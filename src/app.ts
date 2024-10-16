import { Application, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';

import { AssetElement } from './asset';
import { EntityElement } from './entity';

/**
 * The main application element.
 */
class AppElement extends HTMLElement {
    /**
     * The PlayCanvas application instance.
     */
    app: Application | null = null;

    /**
     * The mutation observer for observing changes to the DOM.
     */
    private _observer: MutationObserver | null = null;

    /**
     * The canvas element.
     */
    private _canvas: HTMLCanvasElement | null = null;

    /**
     * Creates a new AppElement.
     */
    constructor() {
        super();

        // Bind methods to maintain 'this' context
        this._onWindowResize = this._onWindowResize.bind(this);
        this._onMutation = this._onMutation.bind(this);
    }

    connectedCallback() {
        // Create and append the canvas to the element
        this._canvas = document.createElement('canvas');
        this.appendChild(this._canvas);

        // Initialize the PlayCanvas application
        this.app = new Application(this._canvas);
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);

        const assetElements = this.querySelectorAll('pc-asset');
        Array.from(assetElements).forEach(assetElement => {
            const asset = (assetElement as AssetElement).asset;
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

            // Wait until 'pc-entity' is defined
            customElements.whenDefined('pc-entity').then(() => {
                // Add existing pc-entity elements to the scene
                this._initializeEntities();

                // Observe for dynamically added or removed pc-entity elements
                this._observer = new MutationObserver(this._onMutation);
                this._observer.observe(this, { childList: true, subtree: true });
            });

            // Dispatch an event indicating the application is initialized
            this.dispatchEvent(new CustomEvent('appInitialized', {
                bubbles: true,
                composed: true,
                detail: { app: this.app }
            }));
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

        // Disconnect the mutation observer
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }

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

    _initializeEntities() {
        const entityElements = this.querySelectorAll('pc-entity');
        entityElements.forEach((entityElement) => {
            this._addEntity(entityElement as EntityElement);
        });
    }

    _onMutation(mutationsList: MutationRecord[]) {
        for (const mutation of mutationsList) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof EntityElement && node.matches('pc-entity')) {
                    this._addEntity(node);
                }
            });
            mutation.removedNodes.forEach((node) => {
                if (node instanceof EntityElement && node.matches('pc-entity')) {
                    this._removeEntity(node);
                }
            });
        }
    }

    _addEntity(entityElement: EntityElement) {
        if (entityElement.entity) {
            this.app!.root.addChild(entityElement.entity);
            // Dispatch an event indicating the entity was added
            this.dispatchEvent(new CustomEvent('entityAdded', {
                bubbles: true,
                composed: true,
                detail: { entity: entityElement.entity }
            }));
        } else {
            console.warn('pc-entity element does not have an entity property.');
        }
    }

    _removeEntity(entityElement: EntityElement) {
        if (entityElement.entity && entityElement.entity.parent) {
            entityElement.entity.parent.removeChild(entityElement.entity);
            // Dispatch an event indicating the entity was removed
            this.dispatchEvent(new CustomEvent('entityRemoved', {
                bubbles: true,
                composed: true,
                detail: { entity: entityElement.entity }
            }));
        }
    }
}

customElements.define('pc-asset', AssetElement);
customElements.define('pc-app', AppElement);
customElements.define('pc-entity', EntityElement);

export { AppElement };
