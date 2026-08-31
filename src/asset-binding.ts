import type { Asset, EventHandle } from 'playcanvas';

import { useAsset } from './asset';

// Both declarations are exported inline: stripInternal drops an @internal declaration together
// with an inline export, but a separate `export { ... }` statement would survive it and leave
// the emitted .d.ts exporting names that no longer exist.

/**
 * How an {@link AssetBinding} delivers its asset's settlement.
 *
 * @internal
 */
export type AssetBindingCallbacks = {
    /**
     * Delivers the loaded asset: synchronously from {@link AssetBinding.bind} when the asset has
     * already loaded, otherwise from its `load` event.
     */
    load: (asset: Asset) => void;

    /**
     * Delivers a failed load. Optional — without it, a failure leaves the binding subscribed, so
     * an asset that is reloaded after an error still delivers.
     */
    error?: (err: string | Error) => void;
};

/**
 * One element's subscription to the settlement of its current asset reference.
 *
 * Every element that consumes an asset asynchronously has the same lifecycle problem: an asset
 * change or a disconnect supersedes a load still in flight, and the superseded load's callback
 * must not act on state it no longer owns. The mechanics of staying safe live here — resolve
 * through {@link useAsset} (which starts a lazy asset's load), deliver an already-loaded asset
 * immediately, otherwise subscribe to settlement, and guarantee that a superseded or cancelled
 * subscription never delivers. What to do with the delivered asset — instantiation, warnings,
 * readiness, resource ownership — stays in the consumer.
 *
 * An element owns one binding per asset reference for its whole life: `bind` supersedes whatever
 * the binding was waiting for, and `cancel` (typically on disconnect) leaves it waiting for
 * nothing. Because the binding itself is stable, a delivery that synchronously starts another
 * bind cannot orphan the newer subscription — there is no per-load handle for a resumed caller
 * to overwrite.
 *
 * @internal
 */
export class AssetBinding {
    /**
     * Incremented by every bind and cancel, and captured by a subscription when it is installed.
     * A callback whose generation has moved on abandons itself without touching the binding —
     * any handles it would detach belong to the subscription that superseded it. Bind and cancel
     * already detach superseded handlers; the generation holds on its own, without relying on
     * how the engine's event emitter treats removal.
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
     * Cancels the binding: whatever it was waiting for is detached and can no longer deliver.
     * The binding stays usable — a later {@link bind} starts a new subscription.
     */
    cancel() {
        this._generation++;
        this._detach();
    }

    /**
     * Binds to the asset registered under `id`, superseding whatever the binding was waiting
     * for — even when `id` resolves to nothing, since the element's reference has still moved
     * on. Resolution starts a lazy asset's load. An already-loaded asset is delivered before
     * this returns; otherwise the binding subscribes to the asset's settlement, detaching its
     * handlers once either event delivers.
     *
     * @param id - The `id` of the `<pc-asset>` element to bind to.
     * @param callbacks - Where settlement is delivered.
     * @returns The resolved asset, or `undefined` — the caller owns the policy for a reference
     * that resolves to nothing.
     */
    bind(id: string, callbacks: AssetBindingCallbacks): Asset | undefined {
        const generation = ++this._generation;
        this._detach();

        const asset = useAsset(id);
        if (!asset) {
            return undefined;
        }

        if (asset.loaded) {
            callbacks.load(asset);
            return asset;
        }

        // Each handler checks its generation before detaching: a stale callback (one the detach
        // above should already have removed) must not detach the subscription that superseded
        // it. Whichever of load/error fires first detaches the other.
        this._loadHandle = asset.once('load', () => {
            if (generation !== this._generation) {
                return;
            }
            this._detach();
            callbacks.load(asset);
        });

        const { error } = callbacks;
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
