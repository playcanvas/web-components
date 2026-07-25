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

/**
 * A union of the tag names of all elements that initialize asynchronously (i.e. elements whose
 * classes extend {@link AsyncElement}).
 */
type AsyncElementTagName = {
    [K in keyof HTMLElementTagNameMap]: HTMLElementTagNameMap[K] extends AsyncElement ? K : never
}[keyof HTMLElementTagNameMap];

/**
 * A union of the tag names of all elements that do not initialize asynchronously. Used to reject
 * `whenReady('pc-asset')` and the like at compile time, while still accepting arbitrary CSS
 * selectors.
 */
type NonAsyncElementTagName = Exclude<keyof HTMLElementTagNameMap, AsyncElementTagName>;

/**
 * Waits for the first element matching the given tag name to be fully initialized.
 * @param target - The tag name of the element to wait for (e.g. `'pc-app'`).
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const { app } = await whenReady('pc-app');
 */
function whenReady<K extends AsyncElementTagName>(target: K): Promise<HTMLElementTagNameMap[K]>;
/**
 * Waits for the given element to be fully initialized.
 * @param target - The element to wait for.
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const appElement = document.createElement('pc-app');
 * document.body.appendChild(appElement);
 * const { app } = await whenReady(appElement);
 */
function whenReady<T extends AsyncElement>(target: T): Promise<T>;
/**
 * Waits for the first element matching the given CSS selector to be fully initialized.
 * @param target - A CSS selector matching the element to wait for (e.g. `'#my-app'`).
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const { entity } = await whenReady('pc-entity[name="camera"]');
 */
function whenReady<T extends AsyncElement = AsyncElement, S extends string = string>(target: S extends NonAsyncElementTagName ? never : S): Promise<T>;
async function whenReady(target: string | AsyncElement): Promise<AsyncElement> {
    if (document.readyState === 'loading') {
        await new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) {
        throw new Error(`whenReady: no element found matching '${target}'`);
    }
    if (!(element instanceof AsyncElement)) {
        throw new Error(`whenReady: element matching '${target}' does not initialize asynchronously`);
    }

    await element.ready();

    return element;
}

export { AsyncElement, whenReady };
export type { AsyncElementTagName, NonAsyncElementTagName };
