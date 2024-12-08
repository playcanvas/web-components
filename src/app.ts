import { Application, CameraComponent, FILLMODE_FILL_WINDOW, Keyboard, Mouse, Picker, RESOLUTION_AUTO } from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { EntityElement } from './entity';
import { MaterialElement } from './material';
import { ModuleElement } from './module';

/**
 * The main application element.
 */
class AppElement extends AsyncElement {
    /**
     * The canvas element.
     */
    private _canvas: HTMLCanvasElement | null = null;

    private _alpha = true;

    private _antialias = true;

    private _depth = true;

    private _stencil = true;

    private _highResolution = false;

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
    app: Application | null = null;

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

        // Initialize the PlayCanvas application
        this.app = new Application(this._canvas, {
            graphicsDeviceOptions: {
                alpha: this._alpha,
                antialias: this._antialias,
                depth: this._depth,
                stencil: this._stencil
            },
            keyboard: new Keyboard(window),
            mouse: new Mouse(this._canvas)
        });
        this.app.graphicsDevice.maxPixelRatio = this._highResolution ? window.devicePixelRatio : 1;

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

    _onPointerMove(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return;

        const canvasRect = this._canvas!.getBoundingClientRect();
        const x = event.clientX - canvasRect.left;
        const y = event.clientY - canvasRect.top;

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        // Get the currently hovered entity by walking up the hierarchy
        let newHoverEntity = null;
        if (selection.length > 0) {
            let node = selection[0].node;
            while (node && !newHoverEntity) {
                const entityElement = this.querySelector(`pc-entity[name="${node.name}"]`) as EntityElement;
                if (entityElement) {
                    newHoverEntity = entityElement;
                }
                node = node.parent;
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

        const canvasRect = this._canvas!.getBoundingClientRect();
        const x = event.clientX - canvasRect.left;
        const y = event.clientY - canvasRect.top;

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        if (selection.length > 0) {
            let node = selection[0].node;
            while (node) {
                const entityElement = this.querySelector(`pc-entity[name="${node.name}"]`) as EntityElement;
                if (entityElement && entityElement.hasListeners('pointerdown')) {
                    entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
                    break;
                }
                node = node.parent;
            }
        }
    }

    _onPointerUp(event: PointerEvent) {
        if (!this._picker || !this.app) return;

        const camera = this.app!.root.findComponent('camera') as CameraComponent;
        if (!camera) return;

        const canvasRect = this._canvas!.getBoundingClientRect();
        const x = event.clientX - canvasRect.left;
        const y = event.clientY - canvasRect.top;

        this._picker.prepare(camera, this.app!.scene);
        const selection = this._picker.getSelection(x, y);

        if (selection.length > 0) {
            const entityElement = this.querySelector(`pc-entity[name="${selection[0].node.name}"]`) as EntityElement;
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
        return ['alpha', 'antialias', 'depth', 'stencil', 'high-resolution'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'alpha':
                this.alpha = newValue !== 'false';
                break;
            case 'antialias':
                this.antialias = newValue !== 'false';
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
