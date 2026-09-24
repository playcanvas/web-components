import type { AppBase, CameraComponent, GraphNode, GSplatComponent } from 'playcanvas';
import { MeshInstance, Picker } from 'playcanvas';

import { EntityBaseElement } from './entity-base';
import { createPointerEvent, hasVisibleListener } from './pointer-events';
import type { SynthesizedEventType } from './pointer-events';

// Keep `export` on these declarations. TypeScript removes the declaration and its inline export
// when `stripInternal` is enabled. A separate `export { ... }` statement would remain in the
// generated .d.ts file and refer to a declaration that had been removed.

/**
 * The event types only a hover pick produces: the boundary events and moves. Picking on every
 * move is the expensive part of pointer input, so it only happens while one of these is listened
 * for (or `picking` is `always`).
 */
const HOVER_EVENTS: readonly SynthesizedEventType[] = [
    'pointerover',
    'pointerenter',
    'pointermove',
    'pointerout',
    'pointerleave'
];

/**
 * The event types a press pick serves: pointerdown itself, and the click and pointercancel that
 * are later dispatched to the element the press picked.
 */
const PRESS_EVENTS: readonly SynthesizedEventType[] = ['pointerdown', 'click', 'pointercancel'];

/** The event types a release pick serves. */
const RELEASE_EVENTS: readonly SynthesizedEventType[] = ['pointerup', 'click'];

/**
 * How long after a click a further click on the same target still raises the click count that
 * `detail` carries, approximating the platform's double-click time.
 */
const CLICK_CHAIN_MS = 500;

/**
 * Collects the elements a pointer over `target` is inside of: the target and its ancestors, up
 * to but excluding `root` - the `<pc-app>`, whose own boundary events the canvas's native ones
 * already cover.
 *
 * @param target - The element under the pointer, or `null` for none.
 * @param root - The `<pc-app>` element.
 * @returns The elements, innermost first.
 */
const chainOf = (target: Element | null, root: Element): Element[] => {
    const chain: Element[] = [];
    for (let element = target; element && element !== root; element = element.parentElement) {
        chain.push(element);
    }
    return chain;
};

/**
 * Finds the nearest common inclusive ancestor of two elements below `root` - the element a click
 * belongs to when the press and the release picked different entities, exactly as the DOM
 * assigns a click whose down and up have different targets.
 *
 * @param a - The element the press picked.
 * @param b - The element the release picked.
 * @param root - The `<pc-app>` element, which is never returned: its clicks are the canvas's own.
 * @returns The nearest common inclusive ancestor below `root`, or `null` when there is none.
 */
const commonAncestor = (a: Element, b: Element, root: Element): Element | null => {
    const ancestors = new Set(chainOf(a, root));
    return chainOf(b, root).find((element) => ancestors.has(element)) ?? null;
};

/**
 * The services the pointer controller needs from its host `<pc-app>` element. Each is read fresh
 * on every use, so the controller follows the host's registrations, tree and settings without
 * holding any of them.
 *
 * @internal
 */
export type PointerHost = {
    /**
     * The `<pc-app>` element. Its subtree is where listeners are looked for, and it stands for
     * the background: the pointer is over it wherever it is over the canvas but no entity.
     */
    readonly element: HTMLElement;

    /**
     * Resolves a graph node to the element fronting it, or `null` for a node no element fronts
     * (for example, a node inside a model's instantiated hierarchy).
     */
    elementFromNode(node: GraphNode): EntityBaseElement | null;

    /**
     * The elements whose listeners create demand for picking: the entity elements and the scene
     * element they sit in.
     */
    listeningElements(): Iterable<Element>;

    /** When to pick - see `AppElement.picking`. */
    picking(): 'auto' | 'always' | 'none';
};

/**
 * A press: the button that went down, and the element its pick resolved to - `null` for the
 * background, and until the pick has resolved.
 */
type Press = { target: EntityBaseElement | null; button: number };

/**
 * What the controller tracks for one pointer. Pointers are tracked separately, as the DOM tracks
 * them - two touches can each be over a different entity.
 */
type PointerState = {
    /**
     * The elements the pointer is inside of, innermost first: the entity element under it and its
     * ancestors below `<pc-app>`. Empty over the background and off the canvas.
     */
    chain: Element[];

    /**
     * Releases the pointer's newest move while it can still be superseded. A later move, or the
     * pointer leaving the canvas, calls it: the superseded move then neither dispatches nor holds
     * up the steps queued behind it by waiting for a pick whose result is no longer wanted. A
     * press, release or cancel clears it instead, so the move before one of those keeps its place
     * in the order. `null` when there is no move to release.
     */
    supersede: (() => void) | null;

    /**
     * The pointer's current press, from the pointerdown that begins it to the release or cancel
     * that ends it - on the canvas or off it. Both happen synchronously, in canvas-event order,
     * however far the picks lag behind. Leaving the canvas does not end it: a pointer that
     * returns and releases over the pressed element still clicks it.
     */
    press: Press | null;

    /** The number of dispatch steps queued for the pointer and not yet run. */
    pending: number;
};

/**
 * The pointer-input subsystem of a `<pc-app>` element: it owns the engine {@link Picker}, the
 * canvas pointer handlers, and everything between them - mapping browser coordinates into the
 * drawing buffer, selecting the camera, resolving picked nodes to elements, tracking what each
 * pointer is over, and dispatching the synthesized pointer events in canvas-event order.
 *
 * The events behave like the DOM's own. Each targets the element fronting the deepest node hit
 * and propagates through the element tree - so a listener on an ancestor entity, on
 * `<pc-scene>` or on the document receives it - with `pointerenter` and `pointerleave` dispatched,
 * without bubbling, to each element the pointer enters or leaves. The canvas keeps receiving its
 * native events throughout; nothing is ever dispatched on it.
 *
 * The host drives a small lifecycle: {@link connect} once the application and canvas exist,
 * {@link resize} when the drawing buffer changes size, and {@link disconnect} on teardown.
 *
 * @internal
 */
export class PointerController {
    private _host: PointerHost;

    /**
     * Incremented by every connect and disconnect. Async work captures the value when it starts
     * and stops if it has moved on - so a pick or dispatch belonging to an earlier connection
     * can neither keep reading through its destroyed picker nor deliver into a later
     * connection. The field null checks alone cannot tell the two apart once a reconnect has
     * repopulated them.
     */
    private _generation = 0;

    private _app: AppBase | null = null;

    private _canvas: HTMLCanvasElement | null = null;

    private _picker: Picker | null = null;

    /**
     * The listeners attached by {@link connect} - on the canvas, and capturing on its window for
     * every release - with their capture flags, kept so disconnect can detach them.
     */
    private _listeners: [EventTarget, string, EventListener, boolean][] = [];

    /**
     * The press each release or cancel ended, recorded by the window as the event passes it on
     * the way in - so the canvas concludes exactly the press that event ended, even when a later
     * press has begun by the time its pick resolves.
     */
    private _endedPresses = new WeakMap<Event, Press | null>();

    /**
     * The events this controller synthesized. Their releases and cancels only report ones the
     * canvas already had, so they end no press as they pass the window.
     */
    private _synthesized = new WeakSet<Event>();

    /** The state of each pointer, by pointerId. */
    private _pointers = new Map<number, PointerState>();

    /**
     * The previous click's target, time and count, for chaining successive clicks into the
     * click count that `detail` carries. `null` until a click has concluded.
     */
    private _lastClick: { element: Element; time: number; count: number } | null = null;

    /**
     * Serializes dispatch: picks resolve in GPU order, not canvas-event order, so each canvas
     * event appends a step that awaits its own pick. Replaced on disconnect, so a pick that
     * never resolves cannot stall the dispatches of a later boot.
     */
    private _dispatchChain: Promise<void> = Promise.resolve();

    /**
     * @param host - The services the controller reads from its host element.
     */
    constructor(host: PointerHost) {
        this._host = host;
    }

    /**
     * Creates the picker for a booted application and attaches the canvas handlers. They stay
     * attached for the connection's lifetime: whether a canvas event is worth a pick is decided
     * per event, because an inline handler assigned as a property is invisible until then.
     *
     * @param app - The application to pick against.
     * @param canvas - The canvas the application renders into.
     */
    connect(app: AppBase, canvas: HTMLCanvasElement) {
        this._generation++;
        this._app = app;
        this._canvas = canvas;

        const { width, height } = app.graphicsDevice;
        this._picker = new Picker(app, width, height);

        // A press outlives the pointer leaving the canvas, as in the DOM, so its release or cancel
        // may land anywhere. The window captures every one: nothing on the page can stop an event
        // before it reaches the window's capture phase, and ending the press there needs no
        // knowledge of where the event is headed - which a closed shadow root would hide
        const released = (event: Event) => this._onRelease(event as PointerEvent);
        this._listeners = [
            [canvas, 'pointermove', (event) => this._onPointerMove(event as PointerEvent), false],
            [canvas, 'pointerdown', (event) => this._onPointerDown(event as PointerEvent), false],
            [canvas, 'pointerup', (event) => this._onPointerUp(event as PointerEvent), false],
            [canvas, 'pointercancel', (event) => this._onPointerCancel(event as PointerEvent), false],
            [canvas, 'pointerout', (event) => this._onPointerOut(event as PointerEvent), false]
        ];
        const view = canvas.ownerDocument.defaultView;
        if (view) {
            this._listeners.push([view, 'pointerup', released, true], [view, 'pointercancel', released, true]);
        }
        this._listeners.forEach(([target, type, handler, capture]) => target.addEventListener(type, handler, capture));
    }

    /**
     * Detaches the canvas listeners and drops every piece of pointer state, so nothing picked or
     * queued before the teardown can affect a later boot. Safe to call on a controller that was
     * never connected.
     */
    disconnect() {
        this._generation++;

        this._listeners.forEach(([target, type, handler, capture]) =>
            target.removeEventListener(type, handler, capture)
        );
        this._listeners = [];

        this._app = null;
        this._canvas = null;
        this._picker = null;
        this._pointers.clear();
        this._lastClick = null;

        // Replace the chain: a pick that never resolves must not stall a later boot's dispatches
        this._dispatchChain = Promise.resolve();
    }

    /**
     * Resizes the picker to the drawing buffer. The picker must track the buffer, or picks would
     * land at stale coordinates after a resize.
     *
     * @param width - The drawing buffer width.
     * @param height - The drawing buffer height.
     */
    resize(width: number, height: number) {
        this._picker?.resize(width, height);
    }

    /**
     * Whether any of `types` is worth picking for. `always` and `none` decide outright; `auto`
     * picks while one of them has a listener the library can see on an entity element or the
     * scene element - a listener anywhere else (on the document, or a framework's delegated
     * handler) needs `always`.
     *
     * @param types - The event types a pick would serve.
     * @returns Whether to pick.
     */
    private _demanded(types: readonly SynthesizedEventType[]): boolean {
        const mode = this._host.picking();
        if (mode !== 'auto') {
            return mode === 'always';
        }
        for (const element of this._host.listeningElements()) {
            if (types.some((type) => hasVisibleListener(element, type))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Dispatches a synthesized event. Under `auto` it is only dispatched when a listener the
     * library can see is on its path - the target or an ancestor below `<pc-app>` - so a page
     * that listens for nothing never receives synthesized events at all. Nothing is dispatched on
     * an element that has left the document since it was picked, as the DOM dispatches no pointer
     * events on a removed node.
     *
     * @param target - The element to dispatch on.
     * @param type - The event type.
     * @param source - The canvas event that caused it.
     * @param relatedTarget - The element the pointer came from or went to, for the boundary events.
     * @param detail - The click count, for `click`.
     */
    private _dispatch(
        target: Element,
        type: SynthesizedEventType,
        source: PointerEvent,
        relatedTarget: EventTarget | null = null,
        detail = 0
    ) {
        const mode = this._host.picking();
        if (mode === 'none' || !target.isConnected) return;
        if (
            mode === 'auto' &&
            !chainOf(target, this._host.element).some((element) => hasVisibleListener(element, type))
        ) {
            return;
        }
        const event = createPointerEvent(type, source, relatedTarget, detail);
        this._synthesized.add(event);
        target.dispatchEvent(event);
    }

    /**
     * Returns the state of a pointer, creating it on first use.
     *
     * @param pointerId - The pointer.
     * @returns Its state.
     */
    private _state(pointerId: number): PointerState {
        let state = this._pointers.get(pointerId);
        if (!state) {
            state = { chain: [], supersede: null, press: null, pending: 0 };
            this._pointers.set(pointerId, state);
        }
        return state;
    }

    /**
     * Appends a dispatch step to {@link _dispatchChain}. Must be called synchronously from the
     * canvas event handler - the order of appends is what carries canvas-event order. A step
     * that rejects is reported and released, so the steps queued behind it still dispatch. Once
     * a pointer has no step left to run and is over nothing, its state is dropped, so touches -
     * which each get a new pointerId - do not accumulate.
     *
     * @param pointerId - The pointer the step belongs to.
     * @param state - The pointer's state.
     * @param step - The dispatch work to run once every earlier step has finished.
     */
    private _queue(pointerId: number, state: PointerState, step: () => void | Promise<void>) {
        const generation = this._generation;
        state.pending++;
        this._dispatchChain = this._dispatchChain
            .then(() => {
                // A step queued before a teardown must not run against the next connection
                if (generation === this._generation) {
                    return step();
                }
            })
            .catch((error) => {
                console.error(error);
            })
            .finally(() => {
                state.pending--;
                this._dropIfIdle(pointerId, state);
            });
    }

    /**
     * Drops a pointer's state once it has no step left to run, is over nothing and has no press.
     *
     * @param pointerId - The pointer.
     * @param state - Its state.
     */
    private _dropIfIdle(pointerId: number, state: PointerState) {
        const idle = state.pending === 0 && state.chain.length === 0 && state.press === null;
        if (idle && this._pointers.get(pointerId) === state) {
            this._pointers.delete(pointerId);
        }
    }

    /**
     * Takes the press a release or cancel ends: the one the window recorded for it on the way
     * in or, for an event the window never saw, the pointer's current press.
     *
     * @param event - The release or cancel.
     * @param state - The pointer's state, if it has one.
     * @returns The press it ends, or `null` for none.
     */
    private _takePress(event: PointerEvent, state: PointerState | undefined): Press | null {
        if (this._endedPresses.has(event)) {
            return this._endedPresses.get(event) ?? null;
        }
        const press = state?.press ?? null;
        if (state) {
            state.press = null;
        }
        return press;
    }

    /**
     * Resolves the element a picked node belongs to: the element fronting the node itself or
     * its nearest ancestor that has one. A model's internal nodes are fronted by no element until
     * a `<pc-node>` binds them, so this walk is what makes a model pickable at all.
     *
     * @param node - The picked node, or `null`.
     * @returns The element, or `null` for the background.
     */
    private _targetOf(node: GraphNode | null): EntityBaseElement | null {
        for (; node !== null; node = node.parent) {
            const element = this._host.elementFromNode(node);
            if (element) {
                return element;
            }
        }
        return null;
    }

    /**
     * Moves a pointer onto `next`, dispatching the boundary events the move implies in the DOM's
     * order: `pointerout` on the element left, `pointerleave` on each element left (innermost
     * first), `pointerover` on the element entered, and `pointerenter` on each element entered
     * (outermost first). The background is stood for by `<pc-app>`: moving between it and an
     * entity dispatches `pointerout`/`pointerover` on it, so that relatedTarget-based consumers
     * such as React's enter/leave see a complete transition, but never enter/leave - the canvas's
     * native events already cover the element itself. Leaving the canvas moves the pointer onto
     * nothing: the native events take over from there.
     *
     * @param state - The pointer's state.
     * @param next - The entity element now under the pointer, or `null` for none.
     * @param source - The canvas event that caused the move.
     * @param onCanvas - Whether the pointer is still over the canvas.
     */
    private _hover(state: PointerState, next: EntityBaseElement | null, source: PointerEvent, onCanvas: boolean) {
        const root = this._host.element;

        // An element removed from the document gets no boundary events, as in the DOM: the
        // pointer passes to the nearest entity element above it that is still connected
        const chain = state.chain.filter((element) => element.isConnected);
        const previous = chain.find((element) => element instanceof EntityBaseElement) ?? null;
        const nextChain = chainOf(next, root);
        state.chain = nextChain;

        // The chains are compared as well as the targets: once the hovered entity is removed,
        // its ancestors are still entered even though the pointer's target is already the
        // background, so a move onto the background leaves them without changing the target
        const left = chain.filter((element) => !nextChain.includes(element));
        const entered = nextChain.filter((element) => !chain.includes(element));
        const retargeted = previous !== next;

        if (retargeted) {
            this._dispatch(previous ?? root, 'pointerout', source, next ?? root);
        }
        left.forEach((element) => this._dispatch(element, 'pointerleave', source, next ?? root));

        if (retargeted && (next || onCanvas)) {
            this._dispatch(next ?? root, 'pointerover', source, previous ?? root);
        }
        entered.reverse().forEach((element) => this._dispatch(element, 'pointerenter', source, previous ?? root));
    }

    /**
     * Converts a pointer event's client coordinates into drawing-buffer coordinates - the space
     * the pick buffer and the camera viewports are laid out in. When the canvas has no CSS box
     * to map through (jsdom; a hidden canvas receives no pointer events in a browser), the
     * client coordinates are passed through unmapped and `mapped` is false, so callers know the
     * coordinates correspond to no real geometry.
     *
     * @param event - The pointer event to convert.
     * @param canvas - The canvas the event was dispatched on.
     * @returns The buffer-space coordinates, and whether they were actually mapped.
     */
    private _getPickerCoordinates(
        event: PointerEvent,
        canvas: HTMLCanvasElement
    ): { x: number; y: number; mapped: boolean } {
        const canvasRect = canvas.getBoundingClientRect();
        if (canvasRect.width === 0 || canvasRect.height === 0) {
            return { x: event.clientX, y: event.clientY, mapped: false };
        }
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        return {
            x: (event.clientX - canvasRect.left) * scaleX,
            y: (event.clientY - canvasRect.top) * scaleY,
            mapped: true
        };
    }

    /**
     * Whether a camera's viewport contains the point. A camera renders into its normalized
     * `rect`, whose origin is the bottom-left of the canvas while buffer coordinates run from
     * the top-left - so the vertical test flips, as the engine's ElementInput flips it for UI
     * input. The right and bottom edges are exclusive: a viewport rasterizes the half-open
     * pixel range [left, right) x [top, bottom), so a coordinate on a shared edge belongs to
     * the viewport whose first pixel it is - never to the one it just left, whose pick buffer
     * holds nothing there.
     *
     * @param camera - The camera to test.
     * @param x - The x coordinate, in buffer space.
     * @param y - The y coordinate, in buffer space.
     * @param canvas - The canvas the coordinates are relative to.
     * @returns Whether the camera's viewport contains the point.
     */
    private _cameraContains(camera: CameraComponent, x: number, y: number, canvas: HTMLCanvasElement): boolean {
        const rect = camera.rect;
        const left = rect.x * canvas.width;
        const bottom = (1 - rect.y) * canvas.height;
        const top = bottom - rect.w * canvas.height;
        return x >= left && x < left + rect.z * canvas.width && y >= top && y < bottom;
    }

    /**
     * Picks the scene under the pointer and returns the graph node that was hit, or `null`.
     *
     * The camera is resolved the way the engine's ElementInput resolves it for UI input:
     * enabled cameras are tried topmost-first (they render in ascending `priority` order),
     * skipping cameras that render to a texture and cameras whose viewport `rect` does not
     * contain the pointer. A camera that picks nothing ends the search if it clears the color
     * buffer - its background visually owns the pixel - and otherwise cedes to the cameras
     * beneath it, so an overlay camera only intercepts picks where it actually drew something.
     * The pick buffer is prepared per camera, so each camera picks from its own layers.
     *
     * The read back is asynchronous because the synchronous {@link Picker.getSelection} is not
     * supported on WebGPU, where it returns an empty selection rather than failing - which
     * silently disabled every `onpointer*` handler once WebGPU became the resolved backend. The
     * async variant works on both backends and does not block the main thread on a GPU read.
     *
     * @param event - The pointer event to pick under.
     * @returns The graph node under the pointer, or `null` if nothing was hit.
     */
    private async _pickNode(event: PointerEvent): Promise<GraphNode | null> {
        const generation = this._generation;
        const app = this._app;
        const picker = this._picker;
        const canvas = this._canvas;
        if (!app || !picker || !canvas) return null;

        const { x, y, mapped } = this._getPickerCoordinates(event, canvas);

        // Walked from the end: the array is sorted by ascending priority, so the last camera
        // renders last and sits on top. Read through .at() because a pick handler may remove
        // cameras while an earlier iteration's read back is in flight.
        const cameras = app.systems.camera?.cameras ?? [];
        for (let i = cameras.length - 1; i >= 0; i--) {
            const camera = cameras.at(i);

            // A camera rendering to a texture is not on the canvas.
            if (!camera || camera.renderTarget) continue;

            // Coordinates that could not be mapped cannot be tested for containment.
            if (mapped && !this._cameraContains(camera, x, y, canvas)) continue;

            picker.prepare(camera, app.scene);
            const selection = await picker.getSelectionAsync(x, y);

            // The host may have disconnected - or disconnected and reconnected - while the read
            // back was in flight. Either way this pick's connection is gone.
            if (generation !== this._generation) return null;

            if (selection.length > 0) {
                const item = selection[0];
                return item instanceof MeshInstance ? item.node : (item as GSplatComponent).entity;
            }

            // Nothing hit. A camera that clears the color buffer paints its background over
            // everything beneath it, so the miss is final; one that does not is an overlay
            // that the cameras beneath show through, so they get their turn.
            if (camera.clearColorBuffer) return null;
        }

        return null;
    }

    private _onPointerMove(event: PointerEvent) {
        if (!this._picker || !this._demanded(HOVER_EVENTS)) return;

        // Moves arrive faster than a pick resolves. Only the newest may move the pointer - an
        // older one describes a position already left behind - so a new move releases the one
        // before it, which then skips its turn instead of waiting for its pick.
        const generation = this._generation;
        const state = this._state(event.pointerId);
        state.supersede?.();
        let superseded = false;
        const released = new Promise<void>((resolve) => {
            state.supersede = () => {
                superseded = true;
                resolve();
            };
        });
        const pick = this._pickNode(event);

        this._queue(event.pointerId, state, async () => {
            const node = await Promise.race([released.then(() => null), pick]);
            if (superseded || generation !== this._generation) return;

            const target = this._targetOf(node);
            this._hover(state, target, event, true);
            if (target) {
                this._dispatch(target, 'pointermove', event);
            }
        });
    }

    private _onPointerDown(event: PointerEvent) {
        if (!this._picker) return;
        const hover = this._demanded(HOVER_EVENTS);
        if (!hover && !this._demanded(PRESS_EVENTS)) return;

        const generation = this._generation;
        const state = this._state(event.pointerId);
        // Only consecutive moves supersede one another: a move before this event keeps its place
        // in the order, so a later move must not release it
        state.supersede = null;

        // The press begins now, in canvas-event order; only its target waits for the pick
        const press: Press = { target: null, button: event.button };
        state.press = press;

        // Picks stay concurrent - only the dispatch of the results is serialized
        const pick = this._pickNode(event);

        this._queue(event.pointerId, state, async () => {
            const node = await pick;
            if (generation !== this._generation) return; // this press's connection is gone

            // A press is also a hit test: the element under a touch is entered as it goes down
            const target = this._targetOf(node);
            if (hover) {
                this._hover(state, target, event, true);
            }
            press.target = target;
            if (target) {
                this._dispatch(target, 'pointerdown', event);
            }
        });
    }

    private _onPointerUp(event: PointerEvent) {
        if (!this._picker) return;
        const hover = this._demanded(HOVER_EVENTS);
        if (!hover && !this._demanded(RELEASE_EVENTS)) {
            // Nothing wants the release picked, but the press it ends may have been: that press
            // is over, so it cannot keep the pointer's state or misdirect a later pointercancel
            const state = this._pointers.get(event.pointerId);
            this._takePress(event, state);
            if (state) {
                this._dropIfIdle(event.pointerId, state);
            }
            return;
        }

        const generation = this._generation;
        const state = this._state(event.pointerId);
        state.supersede = null;
        const press = this._takePress(event, state);
        const pick = this._pickNode(event);

        this._queue(event.pointerId, state, async () => {
            const node = await pick;
            if (generation !== this._generation) return; // this release's connection is gone

            const target = this._targetOf(node);
            if (hover) {
                this._hover(state, target, event, true);
            }
            if (target) {
                this._dispatch(target, 'pointerup', event);
            }

            // A click fires where the DOM fires it: at the nearest common inclusive ancestor of
            // what the press and the release picked, for the primary button only, after the
            // pointerup that concludes it. A press or release on the background concludes no
            // synthesized click - the canvas's own native click covers it.
            if (!press?.target || !target || press.button !== 0 || event.button !== 0) return;

            const clickTarget = commonAncestor(press.target, target, this._host.element);
            if (!clickTarget) return;

            // detail is the click count, chained as the platform chains it: same target, within
            // the double-click window
            const time = performance.now();
            const last = this._lastClick;
            const count =
                last && last.element === clickTarget && time - last.time <= CLICK_CHAIN_MS ? last.count + 1 : 1;
            this._lastClick = { element: clickTarget, time, count };
            this._dispatch(clickTarget, 'click', event, null, count);
        });
    }

    private _onPointerCancel(event: PointerEvent) {
        // The browser took the pointer back (a touch that became a scroll, say): the press can
        // no longer conclude, and the element it picked is told so
        const press = this._takePress(event, this._pointers.get(event.pointerId));
        if (!press) return;
        const state = this._state(event.pointerId);
        state.supersede = null;

        this._queue(event.pointerId, state, () => {
            if (press.target) {
                this._dispatch(press.target, 'pointercancel', event);
            }
        });
    }

    private _onPointerOut(event: PointerEvent) {
        // The canvas has no children, so this is the pointer leaving the canvas: onto an
        // element over it, or out of the page. Whatever entity it was over, it has left - a
        // move still in flight must not put it back. A press it carries out stays live until
        // its release, wherever that lands.
        const state = this._pointers.get(event.pointerId);
        if (!state) return;
        state.supersede?.();
        state.supersede = null;

        this._queue(event.pointerId, state, () => {
            this._hover(state, null, event, false);
        });
    }

    private _onRelease(event: PointerEvent) {
        // Every release or cancel ends the pointer's press, wherever it lands. The canvas's own
        // handler concludes the press recorded here; one released off the canvas concludes
        // nothing, so a later release on the canvas - after a press that began off it - clicks
        // nothing
        if (this._synthesized.has(event)) return;
        const state = this._pointers.get(event.pointerId);
        this._endedPresses.set(event, state?.press ?? null);
        if (state) {
            state.press = null;
            this._dropIfIdle(event.pointerId, state);
        }
    }
}
