import type { CameraComponent, GraphicsDevice, GraphNode, GSplatComponent, Entity } from 'playcanvas';
import {
    AppBase,
    AppOptions,
    createGraphicsDevice,
    ElementInput,
    FILLMODE_NONE,
    Keyboard,
    Mouse,
    Picker,
    RESOLUTION_AUTO,
    AnimComponentSystem,
    AnimationComponentSystem,
    AudioListenerComponentSystem,
    ButtonComponentSystem,
    CameraComponentSystem,
    CollisionComponentSystem,
    ElementComponentSystem,
    GSplatComponentSystem,
    JointComponentSystem,
    LayoutChildComponentSystem,
    LayoutGroupComponentSystem,
    LightComponentSystem,
    ModelComponentSystem,
    ParticleSystemComponentSystem,
    RenderComponentSystem,
    RigidBodyComponentSystem,
    ScriptComponentSystem,
    ScreenComponentSystem,
    ScrollbarComponentSystem,
    ScrollViewComponentSystem,
    SoundComponentSystem,
    SpriteComponentSystem,
    ZoneComponentSystem,
    RenderHandler,
    AnimationHandler,
    AnimClipHandler,
    AnimStateGraphHandler,
    AudioHandler,
    BinaryHandler,
    ContainerHandler,
    CssHandler,
    CubemapHandler,
    FolderHandler,
    FontHandler,
    GSplatHandler,
    HierarchyHandler,
    HtmlHandler,
    JsonHandler,
    MaterialHandler,
    ModelHandler,
    SceneHandler,
    ScriptHandler,
    ShaderHandler,
    SpriteHandler,
    TemplateHandler,
    TextHandler,
    TextureHandler,
    TextureAtlasHandler,
    BatchManager,
    SoundManager,
    Lightmapper,
    XrManager,
    MeshInstance
} from 'playcanvas';

import type { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { SYNTHESIZED_EVENTS } from './entity-base';
import type { EntityBaseElement } from './entity-base';
import type { EntityOwnerElement } from './entity-owner';
import { LoadingBar } from './loading-bar';
import type { MaterialElement } from './material';
import { parseBool, parseEnum, parseNumber } from './parse';
import type { WasmElement } from './wasm';

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
 * Gives `pc-app` the sizing contract of a replaced element (`<video>`, `<img>`): a block-level
 * box that the page's CSS sizes, defaulting to the canvas's own 300x150 intrinsic size, with the
 * canvas and loading bar anchored to it. `:where()` keeps every declaration at zero specificity,
 * so any page rule - however plain - overrides these defaults.
 */
const ensureBaseStyles = () => {
    const id = 'pc-app-styles';
    if (document.getElementById(id)) {
        return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = ':where(pc-app) { display: block; position: relative; width: 300px; height: 150px; }';
    document.head.appendChild(style);
};

/**
 * The AppElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-app/ | `<pc-app>`} elements.
 * The AppElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The element is sized like a replaced element such as `<video>`: a block-level box that the
 * page's CSS controls, 300x150 by default. The application's canvas always fills the element,
 * and the drawing buffer resolution follows the element's size (capped by `max-pixel-ratio`),
 * tracked live via a ResizeObserver — so the element can be embedded at any size, resized by
 * its container, or made fullscreen with ordinary CSS such as `width: 100vw; height: 100dvh`.
 *
 * @elementSummary The `<pc-app>` element creates a PlayCanvas application and the canvas it renders
 * into, and is the root of every scene. It holds the `<pc-asset>`, `<pc-material>`, `<pc-wasm>` and
 * `<pc-scene>` elements, and the page's CSS sizes it, as it would a `<video>`.
 *
 * @fires {ProgressEvent} progress - Fired while the application preloads its assets. `loaded` and
 * `total` are asset counts, not bytes, and an asset that fails to load still counts as loaded.
 * Fired at least once per boot, and the final event always has `loaded` equal to `total`. Does
 * not bubble.
 *
 * @fires {ErrorEvent} error - Fired when the application cannot boot because no graphics device
 * could be created (for example, a browser with WebGL disabled). `message` names the requested
 * backends and `error` holds the underlying failure. The element never becomes ready
 * and `app` stays `null` — listen for this event to show a fallback UI. Removing the element and
 * re-inserting it retries the boot with its current attributes. Does not bubble.
 */
class AppElement extends AsyncElement {
    /**
     * The canvas element.
     */
    private _canvas: HTMLCanvasElement | null = null;

    private _alpha = true;

    private _backend: 'webgpu' | 'webgl2' | 'null' = 'webgpu';

    private _antialias = true;

    private _depthBuffer = true;

    private _stencilBuffer = true;

    private _maxPixelRatio = Infinity;

    private _loadingBar = true;

    /**
     * Set once the graphics options above have been handed to `createGraphicsDevice`, after which
     * writing any of them changes nothing. Guards the warning in {@link _warnIfBooted}, and is
     * cleared on disconnect so a re-connected element boots from its current attributes.
     */
    private _optionsLocked = false;

    private _bar: LoadingBar | null = null;

    /**
     * Whether the application has created its initial entity hierarchy. Read by EntityElement to
     * decide whether a newly connected element must create its entity itself or leave it to the
     * boot sweep.
     * @internal
     */
    _hierarchyReady = false;

    /**
     * Incremented on every connect and disconnect. Boot captures the value on entry and abandons
     * itself wherever it resumes from an await if the value has moved on — so a boot whose
     * element was removed cannot complete against a torn-down element, and a boot whose element
     * was removed and re-inserted (which starts a boot of its own) cannot race the newer one.
     */
    private _bootGeneration = 0;

    /**
     * The elements backing this application's entities, keyed by the entity itself. Registered
     * by entity-owning elements at creation (pc-entity, and pc-model for its host) and by
     * NodeElement at binding, and removed when an entity is destroyed or unbound, this joins
     * engine scene nodes back to their owning elements by identity - never by name.
     */
    private _entityElements = new Map<GraphNode, EntityBaseElement>();

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

    /** Whether any element in the tree listens for click. Maintained by _syncCanvasListeners. */
    private _clickListened = false;

    /**
     * The previous click's target, time and count, for chaining successive clicks into the
     * click count that `detail` carries. `null` until a click has fired.
     */
    private _lastClick: { element: EntityBaseElement; time: number; count: number } | null = null;

    private _app: AppBase | null = null;

    private _loadProgress = 0;

    /**
     * Tracks the element's box so the drawing buffer and picker follow it. Created per boot once
     * the application exists, and disconnected on teardown. `null` where ResizeObserver is
     * unavailable (jsdom), where the boot-time resolution set is the only sizing that happens.
     */
    private _resizeObserver: ResizeObserver | null = null;

    /**
     * The PlayCanvas application instance. `null` until the element is ready, and again once it
     * has been removed from the document — await {@link whenReady} or the element's `ready()`
     * promise before accessing it.
     * @returns The application instance, or `null`.
     */
    get app(): AppBase | null {
        return this._app;
    }

    /**
     * The asset preload progress of the application, as a fraction from 0 to 1. It is 0 until
     * preloading begins (and again once the element has been removed from the document), and 1
     * once preloading has finished — including when there was nothing to preload. Read this to
     * initialize a loading UI; subsequent updates arrive via the `progress` event.
     * @returns The preload progress.
     */
    get loadProgress(): number {
        return this._loadProgress;
    }

    /**
     * Creates a new AppElement instance.
     *
     * @ignore
     */
    constructor() {
        super();

        // Track listeners for the synthesized events being added to and removed from descendant
        // entities. Registered once here rather than on every boot - the sync no-ops while there
        // is no canvas, and a re-booted element must not stack a second set.
        SYNTHESIZED_EVENTS.forEach((type) => {
            this.addEventListener(`${type}:connect`, () => this._syncCanvasListeners());
            this.addEventListener(`${type}:disconnect`, () => this._syncCanvasListeners());
        });
    }

    async connectedCallback() {
        const generation = ++this._bootGeneration;

        // Installed before the loading bar is created: the bar anchors to this element, which
        // these styles make a positioned block box
        ensureBaseStyles();

        // Created before the first await, so the bar is visible while modules and the graphics
        // device are created, and exists before any disconnect could need to clean it up
        if (this._loadingBar && !this._bar) {
            this._bar = new LoadingBar(this);
        }

        // Upgrade the subtree before reading anything out of it. A subtree cloned from a
        // <template> arrives entirely unupgraded - template content lives in an inert document,
        // where custom element definitions are never looked up - and appending the clone upgrades
        // its elements in tree order, this one before its descendants. The module query below would
        // otherwise find plain HTMLElements with no _getLoadPromise to call, and the boot would die
        // there, leaving the element permanently unready: no canvas, no entities, no application.
        //
        // Upgrading is the fix here rather than skipping whatever has not upgraded, because a
        // <pc-wasm> is the one child that nothing else ever builds on its own behalf - skipping
        // it would drop the wasm module the app asked for, silently and only for cloned apps.
        // Upgrading runs each descendant's connectedCallback synchronously, a few lines earlier
        // than the parser's path runs them but into the same state they see there: no application
        // yet and _hierarchyReady false, so they defer to the sweeps below. A descendant that
        // disconnects this element from there is caught by the generation check after the await,
        // as any other disconnect is. An already-upgraded subtree - every other insertion path -
        // is left completely untouched.
        customElements.upgrade(this);

        // Get all pc-wasm elements that are direct children of the pc-app element
        const wasmElements = this.querySelectorAll<WasmElement>(':scope > pc-wasm');

        // Wait for all modules to load
        await Promise.all(Array.from(wasmElements).map((element) => element._getLoadPromise()));

        // The element may have been removed while the modules loaded. Nothing beyond the loading
        // bar exists yet, and disconnectedCallback has already destroyed that.
        if (generation !== this._bootGeneration) {
            return;
        }

        // Create and append the canvas, filling the element's content box - the page sizes the
        // element, and everything else follows. touch-action: none keeps touch drags driving the
        // engine's input handlers instead of scrolling the page.
        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = 'display: block; width: 100%; height: 100%; touch-action: none;';
        this.appendChild(this._canvas);

        // Configure device types based on backend selection
        const backendToDeviceTypes: Record<string, string[]> = {
            webgpu: ['webgpu', 'webgl2'], // fallback to webgl2 if webgpu not available
            webgl2: ['webgl2'],
            null: ['null']
        };
        const deviceTypes = backendToDeviceTypes[this._backend] || [];

        this._optionsLocked = true;

        // createGraphicsDevice appends its final null-device fallback to the array in place, so
        // the requested list is captured now for the failure message.
        const requested = deviceTypes.join(', ');

        let device: GraphicsDevice;
        try {
            device = await createGraphicsDevice(this._canvas, {
                // @ts-ignore - alpha needs to be documented
                alpha: this._alpha,
                antialias: this._antialias,
                depth: this._depthBuffer,
                deviceTypes: deviceTypes,
                stencil: this._stencilBuffer
            });
        } catch (error) {
            // The element may have been removed while device creation was failing. The teardown
            // has already cleaned up, and the failure belongs to a boot that no longer owns the
            // element.
            if (generation !== this._bootGeneration) {
                return;
            }

            // Return the element to its pre-boot state - no dead canvas, no loading bar stuck at
            // zero - before announcing the failure. Readiness deliberately stays pending: nothing
            // it would announce (the app, the entity hierarchy) exists, so a device-less element
            // joins the documented never-ready cases and the failure surfaces through the error
            // event instead.
            if (this._canvas && this.contains(this._canvas)) {
                this.removeChild(this._canvas);
            }
            this._canvas = null;
            this._bar?.destroy();
            this._bar = null;

            const reason = error instanceof Error ? error.message : String(error);
            const message = `pc-app failed to create a graphics device (${requested}) - ${reason}`;
            console.error(message, error);
            this.dispatchEvent(new ErrorEvent('error', { message, error }));
            return;
        }

        // The element may have been removed while the device was created. disconnectedCallback
        // has already cleaned up the canvas; the device was created inside the await, so it is
        // this boot's to release.
        if (generation !== this._bootGeneration) {
            device.destroy();
            return;
        }

        // Assigned rather than resolved to a number here: the engine caps against the live
        // window.devicePixelRatio on every resize, so an uncapped Infinity keeps following the
        // display when a window moves between monitors of differing density.
        device.maxPixelRatio = this._maxPixelRatio;

        const createOptions = new AppOptions();
        createOptions.graphicsDevice = device;
        createOptions.keyboard = new Keyboard(window);
        createOptions.mouse = new Mouse(this._canvas);
        createOptions.elementInput = new ElementInput(this._canvas, {
            useMouse: true,
            useTouch: true
        });
        createOptions.componentSystems = [
            AnimComponentSystem,
            AnimationComponentSystem,
            AudioListenerComponentSystem,
            ButtonComponentSystem,
            CameraComponentSystem,
            CollisionComponentSystem,
            ElementComponentSystem,
            GSplatComponentSystem,
            JointComponentSystem,
            LayoutChildComponentSystem,
            LayoutGroupComponentSystem,
            LightComponentSystem,
            ModelComponentSystem,
            ParticleSystemComponentSystem,
            RenderComponentSystem,
            RigidBodyComponentSystem,
            ScreenComponentSystem,
            ScriptComponentSystem,
            ScrollbarComponentSystem,
            ScrollViewComponentSystem,
            SoundComponentSystem,
            SpriteComponentSystem,
            ZoneComponentSystem
        ];
        createOptions.resourceHandlers = [
            AnimClipHandler,
            AnimationHandler,
            AnimStateGraphHandler,
            AudioHandler,
            BinaryHandler,
            CssHandler,
            ContainerHandler,
            CubemapHandler,
            FolderHandler,
            FontHandler,
            GSplatHandler,
            HierarchyHandler,
            HtmlHandler,
            JsonHandler,
            MaterialHandler,
            ModelHandler,
            RenderHandler,
            ScriptHandler,
            SceneHandler,
            ShaderHandler,
            SpriteHandler,
            TemplateHandler,
            TextHandler,
            TextureAtlasHandler,
            TextureHandler
        ];
        createOptions.soundManager = new SoundManager();
        createOptions.lightmapper = Lightmapper;
        createOptions.batchManager = BatchManager;
        createOptions.xr = XrManager;

        const app = new AppBase(this._canvas);
        this._app = app;
        app.init(createOptions);

        // FILLMODE_NONE leaves the canvas's CSS sizing alone (the engine's other fill modes
        // stamp window-derived pixel sizes onto it); RESOLUTION_AUTO sizes the drawing buffer
        // from the canvas's client size
        app.setCanvasFillMode(FILLMODE_NONE);
        app.setCanvasResolution(RESOLUTION_AUTO);

        this._pickerCreate();

        // Track the element's box rather than the window: containers resize without any window
        // event (splitter drags, flex reflow, animations). Guarded because jsdom has no
        // ResizeObserver - there, the resolution set above is the only sizing that happens.
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._syncCanvasSize());
            this._resizeObserver.observe(this);
        }

        // Get all pc-asset elements that are direct children of the pc-app element
        const assetElements = this.querySelectorAll<AssetElement>(':scope > pc-asset');
        for (const assetElement of Array.from(assetElements)) {
            assetElement._createAsset();
            const asset = assetElement.asset;
            if (asset) {
                app.assets.add(asset);

                // Adding a fileless asset (one built purely from data, such as a sprite)
                // completes it synchronously, dispatching the element's load event - whose
                // listeners may have removed this element. Stop before the next addition
                // reaches the destroyed registry, and before orphan entities are created.
                if (generation !== this._bootGeneration) {
                    return;
                }
            }
        }

        // Get all pc-material elements that are direct children of the pc-app element
        const materialElements = this.querySelectorAll<MaterialElement>(':scope > pc-material');
        Array.from(materialElements).forEach((materialElement) => {
            materialElement._createMaterial();
        });

        // Create all entities. pc-model joins the sweep because it owns a host entity of its
        // own; its instantiated content arrives later, beneath that host.
        const ownerElements = this.querySelectorAll<EntityOwnerElement>('pc-entity, pc-model');
        Array.from(ownerElements).forEach((ownerElement) => {
            ownerElement._createEntity(app);
        });

        // Build hierarchy
        ownerElements.forEach((ownerElement) => {
            ownerElement._buildHierarchy(app);
        });

        // Building the hierarchy dispatched each entity's ready event synchronously, and a
        // listener may have removed the element. The sweep itself degrades safely - destroying
        // the application nulls every element's entity, so the remaining builds no-op - but the
        // teardown's reset must not be overwritten here.
        if (generation !== this._bootGeneration) {
            return;
        }

        this._hierarchyReady = true;

        // Forward the engine's preload lifecycle as DOM ProgressEvents on this element. The
        // listener must be attached before preload() is called: an asset that is already loaded
        // ticks synchronously inside it.
        const total = app.assets.list({ preload: true }).length;
        let loaded = 0;
        const onPreloadProgress = () => {
            loaded += 1;
            this._loadProgress = loaded / total;
            this._bar?.progress(loaded, total);
            this.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded, total }));
        };
        app.on('preload:progress', onPreloadProgress);

        this._loadProgress = total === 0 ? 1 : 0;
        this._bar?.progress(0, total);
        this.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 0, total }));

        // The progress dispatch above ran listeners synchronously, and one may have removed the
        // element. The application is already destroyed - it must not be asked to preload.
        if (generation !== this._bootGeneration) {
            return;
        }

        // Load assets before starting the application
        app.preload(() => {
            // The element may have been removed while assets loaded. The application is already
            // destroyed, so it must not be started — and readiness must not be signaled for a
            // boot that no longer owns the element.
            if (generation !== this._bootGeneration) {
                return;
            }

            // Scope the counter to this preload pass, so a later app.preload() call by user code
            // cannot push `loaded` past `total`
            app.off('preload:progress', onPreloadProgress);
            this._loadProgress = 1;

            // Start the application
            app.start();

            // Dismiss the bar only once a frame has actually rendered; ready fires before the
            // first rAF tick
            app.once('frameend', () => this._bar?.complete());

            this._onReady();
        });
    }

    disconnectedCallback() {
        // Invalidate any boot still in flight, so it abandons itself when it next resumes
        // instead of completing against a torn-down element.
        this._bootGeneration++;

        this._optionsLocked = false;
        this._pickerDestroy();

        // Clean up the application. Destroying it destroys every entity, whose destroy hooks
        // unregister them - clear() covers any entity the engine no longer reached.
        if (this._app) {
            this._app.destroy();
            this._app = null;
        }
        this._entityElements.clear();
        this._loadProgress = 0;
        this._bar?.destroy();
        this._bar = null;

        // Return the element to its pre-boot state, so re-inserting it boots afresh: descendants
        // must neither see a hierarchy that no longer exists nor resume against a readiness that
        // no longer holds.
        this._hierarchyReady = false;
        this._resetReady();

        // Stop tracking the element's size
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;

        // Remove the canvas
        if (this._canvas && this.contains(this._canvas)) {
            this.removeChild(this._canvas);
            this._canvas = null;
        }
    }

    /**
     * Syncs the drawing buffer and the picker to the canvas's current CSS size. The picker must
     * track the buffer, or picks would land at stale coordinates after a resize. Skipped while
     * an XR session presents - the session owns the buffer size.
     */
    private _syncCanvasSize() {
        if (!this.app || this.app.xr?.active) {
            return;
        }
        this.app.updateCanvasSize();
        const { width, height } = this.app.graphicsDevice;
        this._picker?.resize(width, height);
    }

    private _pickerCreate() {
        const { width, height } = this.app!.graphicsDevice;
        this._picker = new Picker(this.app!, width, height);

        // Create bound handlers but don't attach them yet. The handlers pick asynchronously, so
        // each is wrapped to discard the promise - a listener must not return one, and nothing
        // awaits the result.
        const listener = (handler: (event: PointerEvent) => Promise<void>): EventListener => {
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

        // Attach canvas listeners for element listeners registered before this boot (e.g.
        // handlers created from inline attributes when their elements were first upgraded, or
        // listeners carried over from before a re-boot)
        this._syncCanvasListeners();
    }

    private _pickerDestroy() {
        if (this._canvas) {
            Object.entries(this._pointerHandlers).forEach(([type, handler]) => {
                if (handler) {
                    this._canvas!.removeEventListener(type, handler);
                }
            });
        }

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
    }

    /**
     * Registers the element that fronts an entity. Called by EntityElement when it creates its
     * entity, and by NodeElement when it binds one.
     *
     * @param entity - The entity.
     * @param element - The element that fronts it.
     * @internal
     */
    _registerEntityElement(entity: Entity, element: EntityBaseElement) {
        this._entityElements.set(entity, element);
    }

    /**
     * Removes the registration for a destroyed entity. Called by EntityElement.
     *
     * @param entity - The entity.
     * @internal
     */
    _unregisterEntityElement(entity: Entity) {
        this._entityElements.delete(entity);
    }

    /**
     * Returns the `<pc-entity>`, `<pc-model>` or `<pc-node>` element whose backing entity is
     * `entity`, or `null` if the entity is not fronted by an element of this application - for
     * example, an unbound node inside a model's instantiated hierarchy, or an entity created
     * through the engine API.
     *
     * @param entity - The entity to look up.
     * @returns The element fronting the entity, or `null`.
     */
    elementFromEntity(entity: Entity): EntityBaseElement | null {
        return this._entityElements.get(entity) ?? null;
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
            const element = this._entityElements.get(node);
            if (element && hoverEventTypes.some((type) => element._hasListeners(type))) {
                return element;
            }
            node = node.parent;
        }
        return null;
    }

    /**
     * Like {@link _elementFromNode}, but skips elements without a listener for `type`, so a hit
     * on an unlistened child still reaches a listening ancestor.
     *
     * @param node - The picked node, or `null`.
     * @param type - The pointer event type a listener is required for.
     * @returns The nearest listening element, or `null`.
     */
    private _elementWithListener(node: GraphNode | null, type: string): EntityBaseElement | null {
        while (node !== null) {
            const element = this._entityElements.get(node);
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
        const app = this.app;
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

            // The element may have disconnected while the read back was in flight.
            if (!this._picker || !this.app) return null;

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
        if (!this._picker || !this.app) return;

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

    private async _onPointerDown(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const pick = this._pickNode(event);

        // A click concludes on the matching pointerup, which needs to know what the press
        // picked. Primary button only - the only button a click can conclude from - and only
        // while click is listened for, since it is the click mapping that keeps the pointerup
        // and pointercancel listeners attached to clean the entry up again.
        if (this._clickListened && event.button === 0) {
            this._downPicks.set(event.pointerId, pick);
        }

        const node = await pick;
        if (!this._picker) return; // the element disconnected while the pick was in flight

        const entityElement = this._elementWithListener(node, 'pointerdown');
        if (entityElement) {
            entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
        }
    }

    private async _onPointerUp(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        // The press pick this release may conclude as a click. Claimed synchronously, so the
        // entry is gone before any other event for this pointer can be handled.
        const downPick = this._downPicks.get(event.pointerId);
        this._downPicks.delete(event.pointerId);

        const node = await this._pickNode(event);
        if (!this._picker) return; // the element disconnected while the pick was in flight

        const entityElement = this._elementWithListener(node, 'pointerup');
        if (entityElement) {
            entityElement.dispatchEvent(new PointerEvent('pointerup', event));
        }

        // A click fires where the DOM fires it: at the nearest common inclusive ancestor of
        // what the press and the release picked, for the primary button only. The press pick
        // may still be in flight - a quick tap resolves in pick order, not event order.
        if (!downPick || event.button !== 0) return;
        const downNode = await downPick;
        if (!this._picker) return;

        const clickElement = this._elementWithListener(commonAncestor(downNode, node), 'click');
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
    }

    /**
     * Attaches exactly the canvas listeners the tree's current element listeners need, and
     * detaches the rest. Recomputed whenever a listener connects or disconnects anywhere under
     * this element: several synthesized types can need the same canvas listener (enter, leave
     * and move all ride the move pick; click rides the down/up pair), so one type's removal
     * must not detach a listener another type still uses. Re-attaching an attached listener is
     * a no-op by EventTarget semantics, so no attach state is kept.
     */
    private _syncCanvasListeners() {
        const canvas = this._canvas;
        if (!canvas) return; // not booted yet: _pickerCreate syncs once the handlers exist

        const elements = Array.from(this.querySelectorAll<EntityBaseElement>('pc-entity, pc-model, pc-node'));
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
     * Warns that a graphics option was written too late to have any effect. These options are read
     * once, when the element connects and creates its graphics device, so a later write updates
     * only the element's own property - silently, without this.
     *
     * @param name - The name of the option, as its attribute.
     */
    private _warnIfBooted(name: string) {
        if (this._optionsLocked) {
            console.warn(
                `Attribute '${name}' on <pc-app> is only read when the application boots, so this change has no effect. Set it before the element is connected, or remove and re-insert the element to reboot with the new value.`
            );
        }
    }

    /**
     * Sets whether the frame buffer has an alpha channel, which is what lets the page show through
     * wherever the scene has not drawn. Read only when the application boots.
     * @param value - The alpha flag.
     */
    set alpha(value: boolean) {
        this._warnIfBooted('alpha');
        this._alpha = value;
    }

    /**
     * Gets whether the frame buffer has an alpha channel.
     * @returns The alpha flag.
     */
    get alpha() {
        return this._alpha;
    }

    /**
     * Sets whether the frame buffer is anti-aliased. Read only when the application boots.
     * @param value - The antialias flag.
     */
    set antialias(value: boolean) {
        this._warnIfBooted('antialias');
        this._antialias = value;
    }

    /**
     * Gets whether the frame buffer is anti-aliased.
     * @returns The antialias flag.
     */
    get antialias() {
        return this._antialias;
    }

    /**
     * Sets the graphics backend. Defaults to 'webgpu', which falls back to 'webgl2' if WebGPU
     * is not supported by the browser. Read only when the application boots.
     * @param value - The graphics backend ('webgpu', 'webgl2', or 'null').
     */
    set backend(value: 'webgpu' | 'webgl2' | 'null') {
        this._warnIfBooted('backend');
        this._backend = value;
    }

    /**
     * Gets the graphics backend.
     * @returns The graphics backend.
     */
    get backend() {
        return this._backend;
    }

    /**
     * Sets whether the frame buffer has a depth buffer, which the renderer needs to resolve which
     * surface is nearest the camera. Read only when the application boots.
     * @param value - The depth buffer flag.
     */
    set depthBuffer(value: boolean) {
        this._warnIfBooted('depth-buffer');
        this._depthBuffer = value;
    }

    /**
     * Gets whether the frame buffer has a depth buffer.
     * @returns The depth buffer flag.
     */
    get depthBuffer() {
        return this._depthBuffer;
    }

    /**
     * Sets whether the application shows its built-in loading bar while it boots and preloads its
     * assets. Enabled by default; setting `false` removes the bar immediately, while setting
     * `true` has no effect until the element is next connected. The bar can be themed with the
     * CSS custom properties `--pc-loading-bar-color`, `--pc-loading-bar-background` and
     * `--pc-loading-bar-height`.
     * @param value - The loading bar flag.
     */
    set loadingBar(value: boolean) {
        this._loadingBar = value;
        if (!value && this._bar) {
            this._bar.destroy();
            this._bar = null;
        }
    }

    /**
     * Gets whether the application shows its built-in loading bar while it boots and preloads
     * its assets.
     * @returns The loading bar flag.
     */
    get loadingBar() {
        return this._loadingBar;
    }

    /**
     * Sets the cap on the pixel ratio the application renders at. The canvas is sized by the
     * smaller of this value and the display's own device pixel ratio, so the default of `Infinity`
     * renders at full physical resolution, `1` renders at CSS resolution, and an intermediate
     * value such as `2` keeps a dense display sharp without paying for every one of its pixels.
     * Must be greater than 0. Unlike the other graphics options, this applies immediately.
     * @param value - The maximum pixel ratio.
     */
    set maxPixelRatio(value: number) {
        this._maxPixelRatio = value;
        if (this.app) {
            this.app.graphicsDevice.maxPixelRatio = value;
            this._syncCanvasSize();
        }
    }

    /**
     * Gets the cap on the pixel ratio the application renders at.
     * @returns The maximum pixel ratio.
     */
    get maxPixelRatio() {
        return this._maxPixelRatio;
    }

    /**
     * Sets whether the frame buffer has a stencil buffer, which stencil-based effects and UI
     * masking need. Read only when the application boots.
     * @param value - The stencil buffer flag.
     */
    set stencilBuffer(value: boolean) {
        this._warnIfBooted('stencil-buffer');
        this._stencilBuffer = value;
    }

    /**
     * Gets whether the frame buffer has a stencil buffer.
     * @returns The stencil buffer flag.
     */
    get stencilBuffer() {
        return this._stencilBuffer;
    }

    static get observedAttributes() {
        return ['alpha', 'antialias', 'backend', 'depth-buffer', 'loading-bar', 'max-pixel-ratio', 'stencil-buffer'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'alpha':
                this.alpha = parseBool(newValue, true);
                break;
            case 'antialias':
                this.antialias = parseBool(newValue, true);
                break;
            case 'backend':
                this.backend = parseEnum(newValue, ['webgpu', 'webgl2', 'null'], 'webgpu', name);
                break;
            case 'depth-buffer':
                this.depthBuffer = parseBool(newValue, true);
                break;
            case 'loading-bar':
                this.loadingBar = parseBool(newValue, true);
                break;
            case 'max-pixel-ratio':
                this.maxPixelRatio = parseNumber(newValue, Infinity, name);
                break;
            case 'stencil-buffer':
                this.stencilBuffer = parseBool(newValue, true);
                break;
        }
    }
}

customElements.define('pc-app', AppElement);

export { AppElement };
