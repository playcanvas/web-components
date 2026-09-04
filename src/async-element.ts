import type { AppElement } from './app';
import type { EntityBaseElement } from './entity-base';

/**
 * Base class for all PlayCanvas Web Components that initialize asynchronously.
 *
 * @fires {CustomEvent} ready - Fired when the element is fully initialized — once per readiness
 * cycle, so an element that is torn down and re-initialized (for example by removing and
 * re-inserting it) fires it again. Bubbles and is composed.
 *
 * @category Base Classes
 */
class AsyncElement extends HTMLElement {
    private _readyPromise: Promise<void>;

    private _readyResolve!: () => void;

    private _readyResolved = false;

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
     * The nearest ancestor element that fronts an entity — `<pc-entity>`, `<pc-model>` or
     * `<pc-node>` — or `null` if this element has no such ancestor. The search starts at the
     * parent, so an element never resolves to itself.
     * @returns The closest entity-fronting element, or `null`.
     */
    get closestEntity(): EntityBaseElement | null {
        return (this.parentElement?.closest('pc-entity, pc-model, pc-node') as EntityBaseElement | null) ?? null;
    }

    /**
     * Called when the element is fully initialized and ready. Subclasses should call this when
     * they're ready. Resolves the ready promise and dispatches a bubbling, composed `ready`
     * event. Signals at most once per readiness cycle: a repeat call before {@link _resetReady}
     * has re-armed the promise does nothing.
     */
    protected _onReady() {
        if (this._readyResolved) return;
        this._readyResolved = true;
        this._readyResolve();
        this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }));
    }

    /**
     * Returns the ready promise to its pending state. Subclasses should call this when the
     * resource their readiness announced is torn down (typically from `disconnectedCallback`),
     * so that a later re-initialization can signal readiness again. Does nothing while the
     * promise is still pending — an in-flight waiter carries over to the next readiness cycle
     * rather than being stranded on a promise nothing will ever resolve.
     */
    protected _resetReady() {
        if (!this._readyResolved) return;
        this._readyResolved = false;
        this._readyPromise = new Promise<void>((resolve) => {
            this._readyResolve = resolve;
        });
    }

    /**
     * Returns a promise that resolves with this element when it's ready. This is the low-level
     * primitive underlying {@link whenReady}, which is the recommended way to wait for elements.
     *
     * Readiness tracks the element's current lifecycle: once a ready element is torn down (for
     * example by removing it from the document), this returns a fresh promise that resolves when
     * the element is next ready. A promise obtained earlier stays resolved — call this again
     * after re-inserting an element rather than reusing a promise from before its removal.
     * @returns A promise that resolves with this element when it's ready.
     */
    ready(): Promise<this> {
        return this._readyPromise.then(() => this);
    }
}

/**
 * A union of the tag names of all elements that initialize asynchronously (i.e. elements whose
 * classes extend {@link AsyncElement}).
 *
 * @category Types
 */
type AsyncElementTagName = {
    [K in keyof HTMLElementTagNameMap]: HTMLElementTagNameMap[K] extends AsyncElement ? K : never;
}[keyof HTMLElementTagNameMap];

/**
 * Waits for the first element matching the given tag name to be fully initialized. Note that the
 * promise never settles if the element cannot finish initializing (for example, a `<pc-script-instance>`
 * that is not a direct child of `<pc-script>`, or a `<pc-app>` that could not create a graphics
 * device — listen for its `error` event instead). A component element outside an entity-fronting
 * element is the exception: it still becomes ready, but its `component` is `null`. Either way, a
 * misplaced element logs a warning naming the parent it requires.
 * @param target - The tag name of the element to wait for (e.g. `'pc-app'`).
 * @returns A promise that resolves with the element once it's ready.
 * @example
 * const { app } = await whenReady('pc-app');
 *
 * @category Functions
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
 * the promise never settles if the element cannot finish initializing (for example, a `<pc-script-instance>`
 * that is not a direct child of `<pc-script>`, or a `<pc-app>` that could not create a graphics
 * device — listen for its `error` event instead). A component element outside an entity-fronting
 * element is the exception: it still becomes ready, but its `component` is `null`. Either way, a
 * misplaced element logs a warning naming the parent it requires.
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
