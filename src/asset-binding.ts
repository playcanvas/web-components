import type { Asset, EventHandle } from 'playcanvas';

import type { AssetElement } from './asset';

// Keep `export` on these declarations. TypeScript removes the declaration and its inline export
// when `stripInternal` is enabled. A separate `export { ... }` statement would remain in the
// generated .d.ts file and refer to a declaration that had been removed.

// This module imports asset.ts for its types only. pc-app imports this module, and pc-app has to
// be defined before pc-asset: defining an element upgrades every instance already in the document
// and runs its connectedCallback, which awaits the application through `closestApp` - an
// un-upgraded <pc-app> has no `ready()` to await. A value import here would define pc-asset
// first, so the lookup lives here and AssetElement.get delegates to it.

/**
 * Looks up the {@link Asset} created by the `<pc-asset>` element with the given `id`, or
 * `undefined` if there is no such element or its asset has not been created yet.
 *
 * @param id - The `id` of the `<pc-asset>` element.
 * @returns The asset, or `undefined`.
 * @internal
 */
export const findAsset = (id: string) => {
    // getElementById rather than a selector built from the id: an id containing a quote or a
    // backslash would make the selector throw, whereas here it simply matches nothing
    const element = document.getElementById(id);
    return element?.localName === 'pc-asset' ? (element as AssetElement).asset : undefined;
};

/**
 * Resolves an asset reference for use: {@link findAsset}, plus starting the load of a registered
 * asset that has not begun one - a `lazy` asset. Every element that consumes assets resolves its
 * references here, which is what makes `lazy` mean load on first use without any consumer having
 * to remember the load. The load is asynchronous - callers observe the asset's `load` event for
 * the resource.
 *
 * @param id - The `id` of the `<pc-asset>` element.
 * @returns The asset, or `undefined`.
 * @internal
 */
export const useAsset = (id: string) => {
    const asset = findAsset(id);
    // load() ignores an asset that is already loaded or loading, so repeated resolution
    // costs nothing.
    if (asset) {
        asset.registry?.load(asset);
    }
    return asset;
};

/**
 * Functions called when an {@link AssetBinding} finishes loading an asset or encounters an
 * error.
 *
 * @internal
 */
export type AssetBindingCallbacks = {
    /**
     * Called when the asset has a usable resource. If it was already loaded, this can run before
     * {@link AssetBinding.bind} returns. Otherwise it runs when the asset fires `load`.
     */
    load: (asset: Asset) => void;

    /**
     * Called when the asset fails to load, including when it had already failed before
     * {@link AssetBinding.bind} was called. If this is omitted, the binding keeps waiting so a
     * later successful reload can still call `load`.
     */
    error?: (err: string | Error) => void;
};

/**
 * Watches the asset currently selected by an element.
 *
 * An element can change its asset while the old one is still loading, or disconnect before the
 * load finishes. This class makes sure callbacks from those older loads do nothing. Calling
 * {@link bind} stops watching the previous asset and starts watching the new one. Calling
 * {@link cancel} stops watching altogether.
 *
 * Asset lookup goes through {@link useAsset}, so selecting a lazy asset starts its load. The
 * caller still decides what to do with the result, such as creating scene content, reporting an
 * error, or marking an element ready.
 *
 * Reuse one `AssetBinding` for each asset-valued property throughout the element's lifetime. It
 * is safe for a callback to call `bind` again: the new asset remains active after the callback
 * returns.
 *
 * @internal
 */
export class AssetBinding {
    /**
     * Each bind or cancel gets a new number. Event handlers remember the number they were created
     * with and return if it is no longer current. Old listeners are normally removed as well, but
     * this check also protects against an event that was already in progress when removal
     * happened.
     */
    private _generation = 0;

    private _loadHandle: EventHandle | null = null;

    private _errorHandle: EventHandle | null = null;

    private _detach() {
        this._loadHandle?.off();
        this._loadHandle = null;
        this._errorHandle?.off();
        this._errorHandle = null;
    }

    /**
     * Stops watching the current asset and prevents its callbacks from running. The binding can
     * be used again by calling {@link bind}.
     */
    cancel() {
        this._generation++;
        this._detach();
    }

    /**
     * Starts watching the asset registered under `id` and stops watching the previous one. A
     * missing `id` still clears the previous binding. Looking up a lazy asset starts its load.
     *
     * If the asset has already loaded successfully, `load` runs before this method returns. An
     * earlier failure calls `error` immediately when that callback is provided; without one, the
     * binding waits for a later successful reload. Assets still loading are watched for the same
     * two outcomes. Once an event is handled, both listeners are removed.
     *
     * @param id - The `id` of the `<pc-asset>` element to bind to.
     * @param callbacks - Functions to call when loading succeeds or fails.
     * @returns The selected asset, or `undefined` if no asset has this `id`. The caller decides
     * how to handle a missing asset.
     */
    bind(id: string, callbacks: AssetBindingCallbacks): Asset | undefined {
        const generation = ++this._generation;
        this._detach();

        const asset = useAsset(id);
        if (!asset) {
            return undefined;
        }

        const { error } = callbacks;

        if (asset.loaded) {
            // PlayCanvas sets `loaded` after both success and failure, so a resource must also be
            // present before this counts as success. Use `!= null` deliberately: `undefined` and
            // `null` both mean there is no resource, while a valid resource can still be falsy
            // (for example, an empty text file produces '').
            if (asset.resource != null) {
                callbacks.load(asset);
                return asset;
            }
            if (error) {
                error(`asset '${id}' failed to load`);
                return asset;
            }
        }

        // Old listeners are normally removed by bind or cancel. The number check is a second
        // safeguard for a late event. Check it before _detach so an old callback cannot remove
        // the listeners for the current asset. Whichever current event runs first removes both
        // listeners.
        this._loadHandle = asset.once('load', () => {
            if (generation !== this._generation) {
                return;
            }
            this._detach();
            callbacks.load(asset);
        });

        if (error) {
            this._errorHandle = asset.once('error', (err: string | Error) => {
                if (generation !== this._generation) {
                    return;
                }
                this._detach();
                error(err);
            });
        }

        return asset;
    }
}
