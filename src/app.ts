import { Application, FILLMODE_FILL_WINDOW, Keyboard, Mouse, RESOLUTION_AUTO } from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';
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

    /**
     * The PlayCanvas application instance.
     */
    app: Application | null = null;

    /**
     * Creates a new AppElement.
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
