import type { GraphicsDevice, GraphNode, Entity } from 'playcanvas';
import {
    AppBase,
    AppOptions,
    createGraphicsDevice,
    ElementInput,
    FILLMODE_NONE,
    Keyboard,
    Mouse,
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
    XrManager
} from 'playcanvas';

import type { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { SYNTHESIZED_EVENTS } from './entity-base';
import type { EntityBaseElement } from './entity-base';
import type { EntityOwnerElement } from './entity-owner';
import { LoadingBar } from './loading-bar';
import type { MaterialElement } from './material';
import { parseBool, parseEnum, parseNumber } from './parse';
import { PointerController } from './pointer-controller';
import type { WasmElement } from './wasm';

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
 *
 * @category Application
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

    /**
     * The pointer-input subsystem: the picker, the canvas handlers, and the synthesized-event
     * dispatch. The element drives its lifecycle (connect on boot, resize with the drawing
     * buffer, listener syncs, disconnect on teardown) and hands it the two lookups it needs -
     * everything else about pointer input lives in the controller.
     */
    private _pointer = new PointerController({
        elementFromNode: (node) => this._entityElements.get(node) ?? null,
        pointerTargets: () => Array.from(this.querySelectorAll<EntityBaseElement>('pc-entity, pc-model, pc-node'))
    });

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
            this.addEventListener(`${type}:connect`, () => this._pointer.syncListeners());
            this.addEventListener(`${type}:disconnect`, () => this._pointer.syncListeners());
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
                // @ts-expect-error PlayCanvas does not declare the graphics-device alpha option.
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

        this._pointer.connect(app, this._canvas!);

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
        this._pointer.disconnect();

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
        this._pointer.resize(width, height);
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
