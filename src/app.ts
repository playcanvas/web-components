import { Application, FILLMODE_FILL_WINDOW, Keyboard, Mouse, RESOLUTION_AUTO } from 'playcanvas';

import { AssetElement } from './asset';
import { ModuleElement } from './module';

/**
 * The main application element.
 */
class AppElement extends HTMLElement {
    /**
     * The canvas element.
     */
    private _canvas: HTMLCanvasElement | null = null;

    private appReadyPromise: Promise<Application>;

    private appReadyResolve!: (app: Application) => void;

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

        this.appReadyPromise = new Promise<Application>((resolve) => {
            this.appReadyResolve = resolve;
        });
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
                devicePixelRatio: window.devicePixelRatio
            },
            keyboard: new Keyboard(window),
            mouse: new Mouse(this._canvas)
        });
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);

        // Get all pc-asset elements that are direct children of the pc-app element
        const assetElements = this.querySelectorAll<AssetElement>(':scope > pc-asset');
        Array.from(assetElements).forEach(assetElement => {
            assetElement.createAsset();
            const asset = assetElement.asset;
            if (asset) {
                this.app!.assets.add(asset);
            }
        });

        // Load assets before starting the application
        this.app.preload(() => {
            // Start the application
            this.app!.start();

            // Handle window resize to keep the canvas responsive
            window.addEventListener('resize', this._onWindowResize);

            this.appReadyResolve(this.app!);
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

    async getApplication(): Promise<Application> {
        await this.appReadyPromise;
        return this.app!;
    }

    _onWindowResize() {
        if (this.app) {
            this.app.resizeCanvas();
        }
    }
}

customElements.define('pc-app', AppElement);

export { AppElement };
