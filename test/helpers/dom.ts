import { afterEach, expect } from 'vitest';

export interface Mounted {
    /** The wrapper the markup was mounted into. */
    readonly container: HTMLElement;
    /** Queries within the mounted subtree, asserting exactly one match. */
    get<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K];
    get<T extends Element>(selector: string): T;
    /** Queries within the mounted subtree, returning every match. */
    all<T extends Element>(selector: string): T[];
    /** Removes the subtree from the document. Called automatically after each test. */
    unmount(): void;
}

const mounted = new Set<Mounted>();

const LIBRARY_SELECTOR = 'pc-app, pc-asset, pc-entity, pc-material, pc-module, pc-scene, pc-sky';

/**
 * Fails if a previous test left library elements in the document.
 *
 * Several of the library's lookups are document-global and keyed by string - AssetElement.get,
 * MaterialElement.get, getEntity, and AppElement's `pc-entity[name=...]` reverse lookup - so a
 * leak silently changes an unrelated test's result. Failing loudly on entry attributes the leak to
 * the test that caused it.
 */
export const assertDocumentClean = () => {
    const strays = Array.from(document.querySelectorAll(LIBRARY_SELECTOR))
    .map(element => element.tagName.toLowerCase());
    expect(strays, 'a previous test leaked library elements into the document').toEqual([]);
};

/**
 * Mounts an HTML subtree into the document and returns typed handles.
 *
 * The subtree is built detached and inserted in a single operation, so every element's
 * connectedCallback runs with the complete subtree already in place. That matches how the library
 * is actually used: pwc.mjs is a deferred module script, so customElements.define runs after the
 * parser has finished and every element upgrades with its children already present. Assigning
 * innerHTML on an already-connected container would instead connect <pc-app> before its children,
 * and its boot queries (`:scope > pc-asset`, `pc-entity`) would find nothing.
 *
 * @param html - The markup to mount.
 * @returns The mount handle.
 */
export const mount = (html: string): Mounted => {
    assertDocumentClean();

    const container = document.createElement('div');
    container.innerHTML = html;

    const handle: Mounted = {
        container,
        get: ((selector: string) => {
            const found = container.querySelectorAll(selector);
            expect(found.length, `expected exactly one '${selector}' in the mounted subtree`).toBe(1);
            return found[0];
        }) as Mounted['get'],
        all: <T extends Element>(selector: string) => Array.from(container.querySelectorAll<T>(selector)),
        unmount: () => {
            container.remove();
            container.innerHTML = '';
            mounted.delete(handle);
        }
    };

    mounted.add(handle);
    document.body.appendChild(container);

    return handle;
};

afterEach(async () => {
    // Removing the container disconnects <pc-app> first, because parents disconnect before their
    // children - which is exactly the teardown ordering the library's disconnectedCallback guards
    // are written for. Destroying the app also cancels its rAF ticker and removes its window
    // resize listener; both were verified to return to zero afterwards.
    for (const handle of [...mounted]) {
        handle.unmount();
    }

    // Let the disconnectedCallbacks - and any connectedCallback still suspended on an await - run
    // to completion inside the test that created them rather than the next one. A macrotask turn is
    // required here; a microtask flush is not enough.
    await new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
});
