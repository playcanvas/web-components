import {
    AppBase,
    AppOptions,
    CameraComponent,
    createGraphicsDevice,
    ElementInput,
    Entity,
    FILLMODE_FILL_WINDOW,
    GraphNode,
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
    MeshInstance,
    GSplatComponent
} from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { EntityElement } from './entity';
import { LoadingBar } from './loading-bar';
import { MaterialElement } from './material';
import { ModuleElement } from './module';
import { parseBool, parseEnum, parseNumber } from './parse';

/** The pointer event types the application synthesizes on `<pc-entity>` elements via picking. */
const pointerEventTypes = ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave'] as const;

/**
 * The AppElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-app/ | `<pc-app>`} elements.
 * The AppElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @fires {ProgressEvent} progress - Fired while the application preloads its assets. `loaded` and
 * `total` are asset counts, not bytes, and an asset that fails to load still counts as loaded.
 * Fired at least once per boot, and the final event always has `loaded` equal to `total`. Does
 * not bubble.
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

    private _hierarchyReady = false;

    /**
     * Incremented on every connect and disconnect. Boot captures the value on entry and abandons
     * itself wherever it resumes from an await if the value has moved on — so a boot whose
     * element was removed cannot complete against a torn-down element, and a boot whose element
     * was removed and re-inserted (which starts a boot of its own) cannot race the newer one.
     */
    private _bootGeneration = 0;

    /**
     * The elements backing this application's entities, keyed by the entity itself. Registered
     * by EntityElement at creation and removed when an entity is destroyed, this joins engine
     * scene nodes back to their owning elements by identity - never by name.
     */
    private _entityElements = new Map<GraphNode, EntityElement>();

    private _picker: Picker | null = null;

    private _hasPointerListeners: { [key: string]: boolean } = {
        pointerenter: false,
        pointerleave: false,
        pointerdown: false,
        pointerup: false,
        pointermove: false
    };

    private _hoveredEntity: EntityElement | null = null;

    // Identifies the newest in-flight hover pick, so out-of-order results can be discarded
    private _pickToken = 0;

    private _pointerHandlers: { [key: string]: EventListener | null } = {
        pointermove: null,
        pointerdown: null,
        pointerup: null
    };

    private _app: AppBase | null = null;

    private _loadProgress = 0;

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

        // Bind methods to maintain 'this' context
        this._onWindowResize = this._onWindowResize.bind(this);

        // Track pointer listeners being added to and removed from descendant entities.
        // Registered once here rather than on every boot - the handlers no-op while there is no
        // canvas, and a re-booted element must not stack a second set.
        pointerEventTypes.forEach((type) => {
            this.addEventListener(`${type}:connect`, () => this._onPointerListenerAdded(type));
            this.addEventListener(`${type}:disconnect`, () => this._onPointerListenerRemoved(type));
        });
    }

    async connectedCallback() {
        const generation = ++this._bootGeneration;

        // Created before the first await, so the bar is visible while modules and the graphics
        // device are created, and exists before any disconnect could need to clean it up
        if (this._loadingBar && !this._bar) {
            this._bar = new LoadingBar(this);
        }

        // Get all pc-module elements that are direct children of the pc-app element
        const moduleElements = this.querySelectorAll<ModuleElement>(':scope > pc-module');

        // Wait for all modules to load
        await Promise.all(Array.from(moduleElements).map(module => module.getLoadPromise()));

        // The element may have been removed while the modules loaded. Nothing beyond the loading
        // bar exists yet, and disconnectedCallback has already destroyed that.
        if (generation !== this._bootGeneration) {
            return;
        }

        // Create and append the canvas to the element
        this._canvas = document.createElement('canvas');
        this.appendChild(this._canvas);

        // Configure device types based on backend selection
        const backendToDeviceTypes: { [key: string]: string[] } = {
            webgpu: ['webgpu', 'webgl2'], // fallback to webgl2 if webgpu not available
            webgl2: ['webgl2'],
            null: ['null']
        };
        const deviceTypes = backendToDeviceTypes[this._backend] || [];

        this._optionsLocked = true;

        const device = await createGraphicsDevice(this._canvas, {
            // @ts-ignore - alpha needs to be documented
            alpha: this._alpha,
            antialias: this._antialias,
            depth: this._depthBuffer,
            deviceTypes: deviceTypes,
            stencil: this._stencilBuffer
        });

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

        app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(RESOLUTION_AUTO);

        this._pickerCreate();

        // Get all pc-asset elements that are direct children of the pc-app element
        const assetElements = this.querySelectorAll<AssetElement>(':scope > pc-asset');
        Array.from(assetElements).forEach((assetElement) => {
            assetElement.createAsset();
            const asset = assetElement.asset;
            if (asset) {
                app.assets.add(asset);
            }
        });

        // Get all pc-material elements that are direct children of the pc-app element
        const materialElements = this.querySelectorAll<MaterialElement>(':scope > pc-material');
        Array.from(materialElements).forEach((materialElement) => {
            materialElement.createMaterial();
        });

        // Create all entities
        const entityElements = this.querySelectorAll<EntityElement>('pc-entity');
        Array.from(entityElements).forEach((entityElement) => {
            entityElement.createEntity(app);
        });

        // Build hierarchy
        entityElements.forEach((entityElement) => {
            entityElement.buildHierarchy(app);
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

            // Handle window resize to keep the canvas responsive
            window.addEventListener('resize', this._onWindowResize);

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

        // Remove event listeners
        window.removeEventListener('resize', this._onWindowResize);

        // Remove the canvas
        if (this._canvas && this.contains(this._canvas)) {
            this.removeChild(this._canvas);
            this._canvas = null;
        }
    }

    _onWindowResize() {
        if (this.app) {
            this.app.resizeCanvas();
        }
    }

    _pickerCreate() {
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

        // Attach canvas handlers for listeners registered before this boot (e.g. handlers
        // created from onpointer* attributes when their elements were first upgraded, or
        // listeners carried over from before a re-boot)
        pointerEventTypes.forEach((type) => {
            const anyListeners = Array.from(this.querySelectorAll<EntityElement>('pc-entity'))
            .some(entity => entity.hasListeners(type));
            if (anyListeners) {
                this._onPointerListenerAdded(type);
            }
        });
    }

    _pickerDestroy() {
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
            pointerup: null
        };
        this._hasPointerListeners = {
            pointerenter: false,
            pointerleave: false,
            pointerdown: false,
            pointerup: false,
            pointermove: false
        };
    }

    /**
     * Registers the element that created an entity. Called by EntityElement when it creates its
     * entity.
     *
     * @param entity - The entity.
     * @param element - The element that created it.
     * @ignore
     */
    _registerEntityElement(entity: Entity, element: EntityElement) {
        this._entityElements.set(entity, element);
    }

    /**
     * Removes the registration for a destroyed entity. Called by EntityElement.
     *
     * @param entity - The entity.
     * @ignore
     */
    _unregisterEntityElement(entity: Entity) {
        this._entityElements.delete(entity);
    }

    /**
     * Returns the `<pc-entity>` element whose backing entity is `entity`, or `null` if the
     * entity was not created by an element of this application - for example, a node inside a
     * model's instantiated hierarchy, or an entity created through the engine API.
     *
     * @param entity - The entity to look up.
     * @returns The element backing the entity, or `null`.
     */
    elementFromEntity(entity: Entity): EntityElement | null {
        return this._entityElements.get(entity) ?? null;
    }

    /**
     * Resolves the element that owns a picked node: the nearest node up the parent chain -
     * starting with the node itself - that was created by a `<pc-entity>` of this application.
     * A hit inside a model's instantiated hierarchy therefore resolves to the element hosting
     * the model.
     *
     * @param node - The picked node, or `null`.
     * @returns The owning element, or `null`.
     */
    private _elementFromNode(node: GraphNode | null): EntityElement | null {
        while (node !== null) {
            const element = this._entityElements.get(node);
            if (element) {
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
    private _elementWithListener(node: GraphNode | null, type: string): EntityElement | null {
        while (node !== null) {
            const element = this._entityElements.get(node);
            if (element?.hasListeners(type)) {
                return element;
            }
            node = node.parent;
        }
        return null;
    }

    // New helper to convert CSS coordinates to canvas (picker) coordinates
    private _getPickerCoordinates(event: PointerEvent): { x: number, y: number } {
        // Get the canvas' bounding rectangle in CSS pixels.
        const canvasRect = this._canvas!.getBoundingClientRect();
        // Compute scale factors based on canvas actual resolution vs. its CSS display size.
        const scaleX = this._canvas!.width / canvasRect.width;
        const scaleY = this._canvas!.height / canvasRect.height;
        // Convert the client coordinates accordingly.
        const x = (event.clientX - canvasRect.left) * scaleX;
        const y = (event.clientY - canvasRect.top) * scaleY;
        return { x, y };
    }

    /**
     * Picks the scene under the pointer and returns the graph node that was hit, or `null`.
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
        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return null;

        const { x, y } = this._getPickerCoordinates(event);

        this._picker!.prepare(camera, this.app!.scene);
        const selection = await this._picker!.getSelectionAsync(x, y);
        if (selection.length === 0) return null;

        const item = selection[0];
        return item instanceof MeshInstance ? item.node : (item as GSplatComponent).entity;
    }

    async _onPointerMove(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        // Moves arrive faster than a pick resolves, so results can land out of order. Only the
        // newest pick may update the hover state - an older one describes a pointer position the
        // user has already left.
        const token = ++this._pickToken;
        const node = await this._pickNode(event);
        if (token !== this._pickToken || !this._picker) return;

        // The hovered element is the nearest one up the node's parent chain, listening or not -
        // dispatch is gated per event type below
        const newHoverEntity = this._elementFromNode(node);

        // Handle enter/leave events
        if (this._hoveredEntity !== newHoverEntity) {
            if (this._hoveredEntity && this._hoveredEntity.hasListeners('pointerleave')) {
                this._hoveredEntity.dispatchEvent(new PointerEvent('pointerleave', event));
            }
            if (newHoverEntity && newHoverEntity.hasListeners('pointerenter')) {
                newHoverEntity.dispatchEvent(new PointerEvent('pointerenter', event));
            }
        }

        // Update hover state
        this._hoveredEntity = newHoverEntity;

        // Handle pointermove event
        if (newHoverEntity && newHoverEntity.hasListeners('pointermove')) {
            newHoverEntity.dispatchEvent(new PointerEvent('pointermove', event));
        }
    }

    async _onPointerDown(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const node = await this._pickNode(event);
        if (!this._picker) return; // the element disconnected while the pick was in flight

        const entityElement = this._elementWithListener(node, 'pointerdown');
        if (entityElement) {
            entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
        }
    }

    async _onPointerUp(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const node = await this._pickNode(event);
        if (!this._picker) return; // the element disconnected while the pick was in flight

        const entityElement = this._elementWithListener(node, 'pointerup');
        if (entityElement) {
            entityElement.dispatchEvent(new PointerEvent('pointerup', event));
        }
    }

    _onPointerListenerAdded(type: string) {
        if (!this._hasPointerListeners[type] && this._canvas) {
            this._hasPointerListeners[type] = true;

            // For enter/leave events, we need the move handler
            const handler = (type === 'pointerenter' || type === 'pointerleave') ?
                this._pointerHandlers.pointermove :
                this._pointerHandlers[type];

            if (handler) {
                this._canvas.addEventListener(type === 'pointerenter' || type === 'pointerleave' ? 'pointermove' : type, handler);
            }
        }
    }

    _onPointerListenerRemoved(type: string) {
        const hasListeners = Array.from(this.querySelectorAll<EntityElement>('pc-entity'))
        .some(entity => entity.hasListeners(type));

        if (!hasListeners && this._canvas) {
            this._hasPointerListeners[type] = false;

            const handler = (type === 'pointerenter' || type === 'pointerleave') ?
                this._pointerHandlers.pointermove :
                this._pointerHandlers[type];

            if (handler) {
                this._canvas.removeEventListener(type === 'pointerenter' || type === 'pointerleave' ? 'pointermove' : type, handler);
            }
        }
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
            console.warn(`Attribute '${name}' on <pc-app> is only read when the application boots, so this change has no effect. Set it before the element is connected, or remove and re-insert the element to reboot with the new value.`);
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
     * Gets the hierarchy ready flag.
     * @returns The hierarchy ready flag.
     * @ignore
     */
    get hierarchyReady() {
        return this._hierarchyReady;
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
            this.app.resizeCanvas();
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

declare global {
    interface HTMLElementTagNameMap {
        'pc-app': AppElement;
    }
}

export { AppElement };
