import type { AppElement } from './app';
import type { EntityElement } from './entity';

/**
 * Base class for all PlayCanvas Web Components that initialize asynchronously.
 *
 * @fires {CustomEvent} ready - Fired once the element is fully initialized. Bubbles and is
 * composed.
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

    /**
     * The nearest ancestor `<pc-app>` element, or `null` if this element has no `<pc-app>`
     * ancestor. The search starts at the parent, so an element never resolves to itself.
     * @returns The closest app element, or `null`.
     */
    get closestApp(): AppElement | null {
        return (this.parentElement?.closest('pc-app') as AppElement | null) ?? null;
    }

    /**
     * The nearest ancestor `<pc-entity>` element, or `null` if this element has no `<pc-entity>`
     * ancestor. The search starts at the parent, so an element never resolves to itself.
     * @returns The closest entity element, or `null`.
     */
    get closestEntity(): EntityElement | null {
        return (this.parentElement?.closest('pc-entity') as EntityElement | null) ?? null;
    }

    /**
     * Called when the element is fully initialized and ready. Subclasses should call this when
     * they're ready. Resolves the ready promise and dispatches a bubbling, composed `ready`
     * event.
     */
    protected _onReady() {
        this._readyResolve();
        this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }));
    }

    /**
     * Returns a promise that resolves with this element when it's ready. This is the low-level
     * primitive underlying {@link whenReady}, which is the recommended way to wait for elements.
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
    [K in keyof HTMLElementTagNameMap]: HTMLElementTagNameMap[K] extends AsyncElement ? K : never;
}[keyof HTMLElementTagNameMap];

/**
 * Waits for the first element matching the given tag name to be fully initialized. Note that the
 * promise never settles if the element cannot finish initializing (for example, a `<pc-script>`
 * that is not a direct child of `<pc-scripts>`). A component element outside a `<pc-entity>` is
 * the exception: it still becomes ready, but its `component` is `null`. Either way, a misplaced
 * element logs a warning naming the parent it requires.
 * @param target - The tag name of the element to wait for (e.g. `'pc-app'`).
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const { app } = await whenReady('pc-app');
 */
function whenReady<K extends AsyncElementTagName>(target: K): Promise<HTMLElementTagNameMap[K]>;
/**
 * Waits for the given element to be fully initialized. Note that the promise never settles if
 * the element cannot finish initializing (for example, an element that is never added to the
 * document).
 * @param target - The element to wait for.
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const appElement = document.createElement('pc-app');
 * document.body.appendChild(appElement);
 * const { app } = await whenReady(appElement);
 */
function whenReady<T extends AsyncElement>(target: T): Promise<T>;
/**
 * Waits for the first element matching the given CSS selector to be fully initialized. Note that
 * the promise never settles if the element cannot finish initializing (for example, a `<pc-script>`
 * that is not a direct child of `<pc-scripts>`). A component element outside a `<pc-entity>` is
 * the exception: it still becomes ready, but its `component` is `null`. Either way, a misplaced
 * element logs a warning naming the parent it requires.
 * @param target - A CSS selector matching the element to wait for (e.g. `'#my-app'`).
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * // In TypeScript, supply the element type when using an arbitrary selector
 * const { entity } = await whenReady<EntityElement>('pc-entity[name="camera"]');
 */
function whenReady<T extends AsyncElement = AsyncElement, S extends string = string>(
    target: S extends Exclude<keyof HTMLElementTagNameMap, AsyncElementTagName> ? never : S
): Promise<T>;
async function whenReady(target: string | AsyncElement): Promise<AsyncElement> {
    let element: Element | null;
    if (typeof target === 'string') {
        if (document.readyState === 'loading') {
            await new Promise((resolve) => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }

        try {
            element = document.querySelector(target);
        } catch {
            throw new Error(`whenReady: '${target}' is not a valid CSS selector`);
        }
        if (!element) {
            throw new Error(`whenReady: no element found matching '${target}'`);
        }
    } else {
        element = target;
    }

    if (!(element instanceof AsyncElement)) {
        const description = element instanceof Element ? `<${element.tagName.toLowerCase()}>` : String(target);
        throw new Error(`whenReady: ${description} does not initialize asynchronously`);
    }

    await element.ready();

    return element;
}

export { AsyncElement, whenReady };
export type { AsyncElementTagName };
