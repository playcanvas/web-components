import { AppElement } from './app';
import { EntityElement } from './entity';

/**
 * Base class for all PlayCanvas web components that initialize asynchronously.
 */
class AsyncElement extends HTMLElement {
    private _readyPromise: Promise<void>;

    private _readyResolve!: () => void;

    constructor() {
        super();
        this._readyPromise = new Promise<void>((resolve) => {
            this._readyResolve = resolve;
        });
    }

    get closestApp(): AppElement {
        return this.parentElement?.closest('pc-app') as AppElement;
    }

    get closestEntity(): EntityElement {
        return this.parentElement?.closest('pc-entity') as EntityElement;
    }

    /**
     * Called when the element is fully initialized and ready.
     * Subclasses should call this when they're ready.
     */
    protected _onReady() {
        this._readyResolve();
        this.dispatchEvent(new CustomEvent('ready'));
    }

    /**
     * Returns a promise that resolves when the element is ready.
     * @returns A promise that resolves when the element is ready.
     */
    ready(): Promise<void> {
        return this._readyPromise;
    }
}

export { AsyncElement };
