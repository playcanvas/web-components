import {
    AppBase,
    AppOptions,
    CameraComponent,
    createGraphicsDevice,
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
import { MaterialElement } from './material';
import { ModuleElement } from './module';

/**
 * The AppElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-app/ | `<pc-app>`} elements.
 * The AppElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class AppElement extends AsyncElement {
    /**
     * The canvas element.
     */
    private _canvas: HTMLCanvasElement | null = null;

    private _alpha = true;

    private _backend: 'webgpu' | 'webgl2' | 'null' = 'webgl2';

    private _antialias = true;

    private _depth = true;

    private _stencil = true;

    private _highResolution = true;

    private _hierarchyReady = false;

    private _picker: Picker | null = null;

    private _hasPointerListeners: { [key: string]: boolean } = {
        pointerenter: false,
        pointerleave: false,
        pointerdown: false,
        pointerup: false,
        pointermove: false
    };

    private _hoveredEntity: EntityElement | null = null;

    private _pointerHandlers: { [key: string]: EventListener | null } = {
        pointermove: null,
        pointerdown: null,
        pointerup: null
    };

    /**
     * The PlayCanvas application instance.
     */
    app: AppBase | null = null;

    /**
     * Creates a new AppElement instance.
     *
     * @ignore
     */
    constructor() {
        super();

        // Bind methods to maintain 'this' context
        this._onWindowResize = this._onWindowResize.bind(this);
    }

    async connectedCallback() {
        // Get all pc-module elements that are direct children of the pc-app element
        const moduleElements = this.querySelectorAll<ModuleElement>(':scope > pc-module');

        // Wait for all modules to load
        await Promise.all(Array.from(moduleElements).map(module => module.getLoadPromise()));

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

        const device = await createGraphicsDevice(this._canvas, {
            // @ts-ignore - alpha needs to be documented
            alpha: this._alpha,
            antialias: this._antialias,
            depth: this._depth,
            deviceTypes: deviceTypes,
            stencil: this._stencil
        });
        device.maxPixelRatio = this._highResolution ? window.devicePixelRatio : 1;

        const createOptions = new AppOptions();
        createOptions.graphicsDevice = device;
        createOptions.keyboard = new Keyboard(window);
        createOptions.mouse = new Mouse(this._canvas);
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

        this.app = new AppBase(this._canvas);
        this.app.init(createOptions);

        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);

        this._pickerCreate();

        // Get all pc-asset elements that are direct children of the pc-app element
        const assetElements = this.querySelectorAll<AssetElement>(':scope > pc-asset');
        Array.from(assetElements).forEach((assetElement) => {
            assetElement.createAsset();
            const asset = assetElement.asset;
            if (asset) {
                this.app!.assets.add(asset);
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
            entityElement.createEntity(this.app!);
        });

        // Build hierarchy
        entityElements.forEach((entityElement) => {
            entityElement.buildHierarchy(this.app!);
        });

        this._hierarchyReady = true;

        // Load assets before starting the application
        this.app.preload(() => {
            // Start the application
            this.app!.start();

            // Handle window resize to keep the canvas responsive
            window.addEventListener('resize', this._onWindowResize);

            this._onReady();
        });
    }

    disconnectedCallback() {
        this._pickerDestroy();

        // Clean up the application
        if (this.app) {
            this.app.destroy();
            this.app = null;
        }

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

        // Create bound handlers but don't attach them yet
        this._pointerHandlers.pointermove = this._onPointerMove.bind(this) as EventListener;
        this._pointerHandlers.pointerdown = this._onPointerDown.bind(this) as EventListener;
        this._pointerHandlers.pointerup = this._onPointerUp.bind(this) as EventListener;

        // Listen for pointer listeners being added/removed
        ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave'].forEach((type) => {
            this.addEventListener(`${type}:connect`, () => this._onPointerListenerAdded(type));
            this.addEventListener(`${type}:disconnect`, () => this._onPointerListenerRemoved(type));
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
        this._pointerHandlers = {
            pointermove: null,
            pointerdown: null,
            pointerup: null
        };
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

    _onPointerMove(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return;

        // Use the helper to convert event coordinates into canvas/picker coordinates.
        const { x, y } = this._getPickerCoordinates(event);

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        // Get the currently hovered entity by walking up the hierarchy
        let newHoverEntity: EntityElement | null = null;
        if (selection.length > 0) {
            const item = selection[0];
            let currentNode: GraphNode | null = item instanceof MeshInstance ? item.node : (item as GSplatComponent).entity;
            while (currentNode !== null) {
                const entityElement = this.querySelector(`pc-entity[name="${currentNode.name}"]`) as EntityElement;
                if (entityElement) {
                    newHoverEntity = entityElement;
                    break;
                }
                currentNode = currentNode.parent;
            }
        }

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

    _onPointerDown(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return;

        // Convert the event's pointer coordinates
        const { x, y } = this._getPickerCoordinates(event);

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        if (selection.length > 0) {
            const item = selection[0];
            let currentNode: GraphNode | null = item instanceof MeshInstance ? item.node : (item as GSplatComponent).entity;
            while (currentNode !== null) {
                const entityElement = this.querySelector(`pc-entity[name="${currentNode.name}"]`) as EntityElement;
                if (entityElement && entityElement.hasListeners('pointerdown')) {
                    entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
                    break;
                }
                currentNode = currentNode.parent;
            }
        }
    }

    _onPointerUp(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return;

        // Convert CSS coordinates to picker coordinates
        const { x, y } = this._getPickerCoordinates(event);

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        if (selection.length > 0) {
            const item = selection[0];
            const node = item instanceof MeshInstance ? item.node : (item as GSplatComponent).entity;
            const entityElement = this.querySelector(`pc-entity[name="${node.name}"]`) as EntityElement;
            if (entityElement && entityElement.hasListeners('pointerup')) {
                entityElement.dispatchEvent(new PointerEvent('pointerup', event));
            }
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
     * Sets the alpha flag.
     * @param value - The alpha flag.
     */
    set alpha(value: boolean) {
        this._alpha = value;
    }

    /**
     * Gets the alpha flag.
     * @returns The alpha flag.
     */
    get alpha() {
        return this._alpha;
    }

    /**
     * Sets the antialias flag.
     * @param value - The antialias flag.
     */
    set antialias(value: boolean) {
        this._antialias = value;
    }

    /**
     * Gets the antialias flag.
     * @returns The antialias flag.
     */
    get antialias() {
        return this._antialias;
    }

    /**
     * Sets the graphics backend.
     * @param value - The graphics backend ('webgpu', 'webgl2', or 'null').
     */
    set backend(value: 'webgpu' | 'webgl2' | 'null') {
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
     * Sets the depth flag.
     * @param value - The depth flag.
     */
    set depth(value: boolean) {
        this._depth = value;
    }

    /**
     * Gets the depth flag.
     * @returns The depth flag.
     */
    get depth() {
        return this._depth;
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
     * Sets the high resolution flag. When true, the application will render at the device's
     * physical resolution. When false, the application will render at CSS resolution.
     * @param value - The high resolution flag.
     */
    set highResolution(value: boolean) {
        this._highResolution = value;
        if (this.app) {
            this.app.graphicsDevice.maxPixelRatio = value ? window.devicePixelRatio : 1;
        }
    }

    /**
     * Gets the high resolution flag.
     * @returns The high resolution flag.
     */
    get highResolution() {
        return this._highResolution;
    }

    /**
     * Sets the stencil flag.
     * @param value - The stencil flag.
     */
    set stencil(value: boolean) {
        this._stencil = value;
    }

    /**
     * Gets the stencil flag.
     * @returns The stencil flag.
     */
    get stencil() {
        return this._stencil;
    }

    static get observedAttributes() {
        return ['alpha', 'antialias', 'backend', 'depth', 'stencil', 'high-resolution'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'alpha':
                this.alpha = newValue !== 'false';
                break;
            case 'antialias':
                this.antialias = newValue !== 'false';
                break;
            case 'backend':
                if (newValue === 'webgpu' || newValue === 'webgl2' || newValue === 'null') {
                    this.backend = newValue;
                }
                break;
            case 'depth':
                this.depth = newValue !== 'false';
                break;
            case 'high-resolution':
                this.highResolution = newValue !== 'false';
                break;
            case 'stencil':
                this.stencil = newValue !== 'false';
                break;
        }
    }
}

customElements.define('pc-app', AppElement);

export { AppElement };
