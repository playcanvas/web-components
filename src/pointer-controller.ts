import type { AppBase, CameraComponent, GraphNode, GSplatComponent } from 'playcanvas';
import { MeshInstance, Picker } from 'playcanvas';

import type { EntityBaseElement } from './entity-base';
import { SYNTHESIZED_EVENTS } from './entity-base';

// Keep `export` on these declarations. TypeScript removes the declaration and its inline export
// when `stripInternal` is enabled. A separate `export { ... }` statement would remain in the
// generated .d.ts file and refer to a declaration that had been removed.

/**
 * The event types whose listeners make an element a hover target. Hover resolution walks past
 * elements listening for none of them, so a silent element never swallows an ancestor's
 * enter/leave pair.
 */
const hoverEventTypes = ['pointerenter', 'pointerleave', 'pointermove'] as const;

/**
 * The canvas listeners each synthesized event type is driven by. Enter and leave are derived
 * from move picks. A click is concluded from the down/up pair, with pointercancel discarding a
 * press the browser takes back (for example a touch that becomes a scroll).
 */
const canvasEventsFor: Record<(typeof SYNTHESIZED_EVENTS)[number], readonly string[]> = {
    pointermove: ['pointermove'],
    pointerenter: ['pointermove'],
    pointerleave: ['pointermove'],
    pointerdown: ['pointerdown'],
    pointerup: ['pointerup'],
    click: ['pointerdown', 'pointerup', 'pointercancel']
};

/**
 * How long after a click a further click on the same target still raises the click count that
 * `detail` carries, approximating the platform's double-click time.
 */
const CLICK_CHAIN_MS = 500;

/**
 * Finds the nearest common inclusive ancestor of two picked nodes - the node a click belongs to
 * when the press and the release picked different geometry, exactly as the DOM assigns a click
 * whose down and up have different targets.
 *
 * @param a - The node the press picked, or `null`.
 * @param b - The node the release picked, or `null`.
 * @returns The nearest common inclusive ancestor, or `null` when there is none.
 */
const commonAncestor = (a: GraphNode | null, b: GraphNode | null): GraphNode | null => {
    const ancestors = new Set<GraphNode>();
    for (let node = a; node !== null; node = node.parent) {
        ancestors.add(node);
    }
    for (let node = b; node !== null; node = node.parent) {
        if (ancestors.has(node)) {
            return node;
        }
    }
    return null;
};

/**
 * The services the pointer controller needs from its host `<pc-app>` element. Both are read
 * fresh on every use, so the controller follows the host's registrations and tree without
 * holding any of them.
 *
 * @internal
 */
export type PointerHost = {
    /**
     * Resolves a graph node to the element fronting it, or `null` for a node no element fronts
     * (for example, a node inside a model's instantiated hierarchy).
     */
    elementFromNode(node: GraphNode): EntityBaseElement | null;

    /**
     * The entity-fronting elements currently under the host, whose listeners decide which canvas
     * handlers are needed.
     */
    pointerTargets(): EntityBaseElement[];
};

/**
 * The pointer-input subsystem of a `<pc-app>` element: it owns the engine {@link Picker}, the
 * canvas pointer handlers, and everything between them - mapping browser coordinates into the
 * drawing buffer, selecting the camera, resolving picked nodes to listening elements, tracking
 * hover, and dispatching the synthesized pointer and click events in canvas-event order.
 *
 * The host drives a small lifecycle: {@link connect} once the application and canvas exist,
 * {@link resize} when the drawing buffer changes size, {@link syncListeners} when a descendant's
 * pointer listeners change, and {@link disconnect} on teardown. Everything else is internal.
 *
 * @internal
 */
export class PointerController {
    private _host: PointerHost;

    private _app: AppBase | null = null;

    private _canvas: HTMLCanvasElement | null = null;

    private _picker: Picker | null = null;

    private _hoveredEntity: EntityBaseElement | null = null;

    // Identifies the newest in-flight hover pick, so out-of-order results can be discarded
    private _pickToken = 0;

    private _pointerHandlers: Record<string, EventListener | null> = {
        pointermove: null,
        pointerdown: null,
        pointerup: null,
        pointercancel: null
    };

    /**
     * The pick of each pointer's primary-button press, keyed by pointerId and kept while a click
     * may still conclude it. The promise is stored rather than its result, so a release can
     * await a press pick that has not resolved yet. Entries are removed by the matching
     * pointerup or pointercancel, and only ever stored while some element listens for click -
     * which is also what keeps those two canvas listeners attached.
     */
    private _downPicks = new Map<number, Promise<GraphNode | null>>();

    /** Whether any element in the tree listens for click. Maintained by syncListeners. */
    private _clickListened = false;

    /**
     * The previous click's target, time and count, for chaining successive clicks into the
     * click count that `detail` carries. `null` until a click has fired.
     */
    private _lastClick: { element: EntityBaseElement; time: number; count: number } | null = null;

    /**
     * Serializes dispatch of the discrete synthesized events (pointerdown, pointerup, click),
     * whose picks resolve in GPU order, not canvas-event order. Replaced on disconnect, so a
     * pick that never resolves cannot stall the dispatches of a later boot.
     */
    private _dispatchChain: Promise<void> = Promise.resolve();

    /**
     * @param host - The services the controller reads from its host element.
     */
    constructor(host: PointerHost) {
        this._host = host;
    }

    /**
     * Creates the picker and the canvas handlers for a booted application, and attaches whatever
     * canvas listeners the tree's current element listeners already need (handlers created from
     * inline attributes when their elements were first upgraded, or listeners carried over from
     * before a re-boot).
     *
     * @param app - The application to pick against.
     * @param canvas - The canvas the application renders into.
     */
    connect(app: AppBase, canvas: HTMLCanvasElement) {
        this._app = app;
        this._canvas = canvas;

        const { width, height } = app.graphicsDevice;
        this._picker = new Picker(app, width, height);

        // Create bound handlers but don't attach them yet. The move handler is async, so it is
        // wrapped to discard the promise - a listener must not return one.
        const listener = (handler: (event: PointerEvent) => void | Promise<void>): EventListener => {
            return (event: Event) => {
                handler.call(this, event as PointerEvent);
            };
        };

        this._pointerHandlers.pointermove = listener(this._onPointerMove);
        this._pointerHandlers.pointerdown = listener(this._onPointerDown);
        this._pointerHandlers.pointerup = listener(this._onPointerUp);
        this._pointerHandlers.pointercancel = (event: Event) => {
            this._downPicks.delete((event as PointerEvent).pointerId);
        };

        this.syncListeners();
    }

    /**
     * Detaches the canvas listeners and drops every piece of pointer state, so nothing picked or
     * queued before the teardown can affect a later boot. Safe to call on a controller that was
     * never connected.
     */
    disconnect() {
        if (this._canvas) {
            Object.entries(this._pointerHandlers).forEach(([type, handler]) => {
                if (handler) {
                    this._canvas!.removeEventListener(type, handler);
                }
            });
        }

        this._app = null;
        this._canvas = null;
        this._picker = null;
        this._hoveredEntity = null;
        this._pointerHandlers = {
            pointermove: null,
            pointerdown: null,
            pointerup: null,
            pointercancel: null
        };
        this._downPicks.clear();
        this._clickListened = false;
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
     * Attaches exactly the canvas listeners the tree's current element listeners need, and
     * detaches the rest. Called whenever a listener connects or disconnects anywhere under the
     * host element: several synthesized types can need the same canvas listener (enter, leave
     * and move all ride the move pick; click rides the down/up pair), so one type's removal
     * must not detach a listener another type still uses. Re-attaching an attached listener is
     * a no-op by EventTarget semantics, so no attach state is kept. Does nothing before
     * {@link connect} - connecting syncs once the handlers exist.
     */
    syncListeners() {
        const canvas = this._canvas;
        if (!canvas) return;

        const elements = this._host.pointerTargets();
        const needed = new Set<string>();
        for (const type of SYNTHESIZED_EVENTS) {
            if (elements.some((element) => element._hasListeners(type))) {
                canvasEventsFor[type].forEach((canvasType) => needed.add(canvasType));
            }
        }
        this._clickListened = elements.some((element) => element._hasListeners('click'));

        Object.entries(this._pointerHandlers).forEach(([canvasType, handler]) => {
            if (!handler) return;
            if (needed.has(canvasType)) {
                canvas.addEventListener(canvasType, handler);
            } else {
                canvas.removeEventListener(canvasType, handler);
            }
        });
    }

    /**
     * Resolves the element that owns hover for a picked node: the nearest node up the parent
     * chain - starting with the node itself - whose element listens for any of the hover event
     * types. Skipping silent elements matches {@link _elementWithListener}, so a registered
     * element with no hover listeners (a `<pc-model>` host, a plain child entity) is transparent
     * to hover rather than swallowing a listening ancestor's enter/leave pair.
     *
     * @param node - The picked node, or `null`.
     * @returns The hover-owning element, or `null`.
     */
    private _hoverTarget(node: GraphNode | null): EntityBaseElement | null {
        while (node !== null) {
            const element = this._host.elementFromNode(node);
            if (element && hoverEventTypes.some((type) => element._hasListeners(type))) {
                return element;
            }
            node = node.parent;
        }
        return null;
    }

    /**
     * Like {@link _hoverTarget}, but for one event type: skips elements without a listener for
     * `type`, so a hit on an unlistened child still reaches a listening ancestor.
     *
     * @param node - The picked node, or `null`.
     * @param type - The pointer event type a listener is required for.
     * @returns The nearest listening element, or `null`.
     */
    private _elementWithListener(node: GraphNode | null, type: string): EntityBaseElement | null {
        while (node !== null) {
            const element = this._host.elementFromNode(node);
            if (element?._hasListeners(type)) {
                return element;
            }
            node = node.parent;
        }
        return null;
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

            // The host may have disconnected while the read back was in flight.
            if (!this._picker || !this._app) return null;

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

    private async _onPointerMove(event: PointerEvent) {
        if (!this._picker || !this._app) return;

        // Moves arrive faster than a pick resolves, so results can land out of order. Only the
        // newest pick may update the hover state - an older one describes a pointer position the
        // user has already left.
        const token = ++this._pickToken;
        const node = await this._pickNode(event);
        if (token !== this._pickToken || !this._picker) return;

        // The hovered element is the nearest one up the node's parent chain with a hover
        // listener - the nearest-listener rule down/up use. Dispatch is still gated per event
        // type below: having any hover listener selects the target, each event needs its own.
        const newHoverEntity = this._hoverTarget(node);

        // Handle enter/leave events
        if (this._hoveredEntity !== newHoverEntity) {
            if (this._hoveredEntity && this._hoveredEntity._hasListeners('pointerleave')) {
                this._hoveredEntity.dispatchEvent(new PointerEvent('pointerleave', event));
            }
            if (newHoverEntity && newHoverEntity._hasListeners('pointerenter')) {
                newHoverEntity.dispatchEvent(new PointerEvent('pointerenter', event));
            }
        }

        // Update hover state
        this._hoveredEntity = newHoverEntity;

        // Handle pointermove event
        if (newHoverEntity && newHoverEntity._hasListeners('pointermove')) {
            newHoverEntity.dispatchEvent(new PointerEvent('pointermove', event));
        }
    }

    /**
     * Appends a dispatch step to {@link _dispatchChain}. Must be called synchronously from the
     * canvas event handler - the order of appends is what carries canvas-event order. A step
     * that rejects is reported and released, so the steps queued behind it still dispatch.
     *
     * @param step - The dispatch work to run once every earlier step has finished.
     */
    private _chainDispatch(step: () => Promise<void>) {
        this._dispatchChain = this._dispatchChain.then(step).catch((error) => {
            console.error(error);
        });
    }

    private _onPointerDown(event: PointerEvent) {
        if (!this._picker || !this._app) return;

        // Picks stay concurrent - only the dispatch of the results is serialized
        const pick = this._pickNode(event);

        // A click concludes on the matching pointerup, which needs to know what the press
        // picked. Primary button only - the only button a click can conclude from - and only
        // while click is listened for, since it is the click mapping that keeps the pointerup
        // and pointercancel listeners attached to clean the entry up again.
        if (this._clickListened && event.button === 0) {
            this._downPicks.set(event.pointerId, pick);
        }

        this._chainDispatch(async () => {
            const node = await pick;
            if (!this._picker) return; // the host disconnected while the pick was in flight

            const entityElement = this._elementWithListener(node, 'pointerdown');
            if (entityElement) {
                entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
            }
        });
    }

    private _onPointerUp(event: PointerEvent) {
        if (!this._picker || !this._app) return;

        // The press pick this release may conclude as a click. Claimed synchronously, so the
        // entry is gone before any other event for this pointer can be handled.
        const downPick = this._downPicks.get(event.pointerId);
        this._downPicks.delete(event.pointerId);

        const pick = this._pickNode(event);

        this._chainDispatch(async () => {
            const node = await pick;
            if (!this._picker) return; // the host disconnected while the pick was in flight

            const entityElement = this._elementWithListener(node, 'pointerup');
            if (entityElement) {
                entityElement.dispatchEvent(new PointerEvent('pointerup', event));
            }
        });

        // A click fires where the DOM fires it: at the nearest common inclusive ancestor of
        // what the press and the release picked, for the primary button only. Appended after
        // the release's own step, so it dispatches after the pointerup that concludes it.
        if (!downPick || event.button !== 0) return;

        this._chainDispatch(async () => {
            // A rejected pick was already reported by the press or release step that awaited it;
            // here it just means no click can conclude.
            const picked = await Promise.all([downPick, pick]).catch(() => null);
            if (!picked || !this._picker) return;

            const [downNode, upNode] = picked;
            const clickElement = this._elementWithListener(commonAncestor(downNode, upNode), 'click');
            if (clickElement) {
                const click = new PointerEvent('click', event);

                // The init above copied pointerup's `detail`, which the Pointer Events spec fixes
                // at 0 - but click is exempt: its detail is the click count, chained here as the
                // platform chains it (same target, within the double-click window). Overridden
                // with defineProperty because an event instance used as an init dict cannot have
                // single fields replaced.
                const time = performance.now();
                const last = this._lastClick;
                const count =
                    last && last.element === clickElement && time - last.time <= CLICK_CHAIN_MS ? last.count + 1 : 1;
                this._lastClick = { element: clickElement, time, count };
                Object.defineProperty(click, 'detail', { value: count });

                clickElement.dispatchEvent(click);
            }
        });
    }
}
