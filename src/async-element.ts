import { AppElement } from './app';
import { EntityElement } from './entity';

/**
 * Base class for all PlayCanvas Web Components that initialize asynchronously.
 */
class AsyncElement extends HTMLElement {
    private _readyPromise: Promise<void>;

    private _readyResolve!: () => void;

    /** @ignore */
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
     * Returns a promise that resolves with this element when it's ready.
     * @returns A promise that resolves with this element when it's ready.
     */
    ready(): Promise<this> {
        return this._readyPromise.then(() => this);
    }
}

export { AsyncElement };
