import { describe, expect, it } from 'vitest';

import { AssetElement } from '../../src/asset';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

const LAZY_TEXT = '<pc-asset id="cfg" type="text" src="data:text/plain,cfg" lazy></pc-asset>';

/**
 * Waits for the asset element's next `load` event.
 *
 * @param element - The `pc-asset` element to observe.
 * @returns A promise that settles when the event fires.
 */
const loadOf = (element: AssetElement) =>
    new Promise<void>((resolve) => {
        element.addEventListener('load', () => resolve(), { once: true });
    });

describe('pc-asset lazy loading', () => {
    useGuard();

    it('stays registered and unloaded until something uses it', async () => {
        const { get } = await bootApp(LAZY_TEXT);
        const asset = get<AssetElement>('pc-asset').asset;

        expect(asset).toBeTruthy();
        expect(asset!.loaded, 'a lazy asset does not load during boot').toBe(false);
        expect(asset!.loading).toBe(false);
    });

    it('starts the load when resolved through AssetElement.get', async () => {
        // Load on first use is the whole lazy contract: every element resolves its asset
        // references through get(), so resolution is where the load belongs - a consumer
        // cannot forget to trigger it.
        const { get } = await bootApp(LAZY_TEXT);
        const element = get<AssetElement>('pc-asset');
        const loaded = loadOf(element);

        const asset = AssetElement.get('cfg');

        expect(asset).toBe(element.asset);
        await loaded;
        expect(asset!.loaded).toBe(true);
        expect(asset!.resource).toBe('cfg');
    });

    it('resolving an asset repeatedly loads it once', async () => {
        const { get } = await bootApp(LAZY_TEXT);
        const element = get<AssetElement>('pc-asset');
        let loads = 0;
        element.addEventListener('load', () => {
            loads += 1;
        });
        const loaded = loadOf(element);

        AssetElement.get('cfg');
        AssetElement.get('cfg');
        await loaded;
        AssetElement.get('cfg');

        expect(loads, 'repeated resolution must not reload').toBe(1);
    });

    it('starts the load when the lazy attribute is removed', async () => {
        // Un-lazying a registered asset is the declarative way to say "load now" without any
        // element having to reference it.
        const { get } = await bootApp(LAZY_TEXT);
        const element = get<AssetElement>('pc-asset');
        const loaded = loadOf(element);

        element.removeAttribute('lazy');

        await loaded;
        expect(element.asset!.loaded).toBe(true);
    });

    it('loads a lazy texture referenced by a material map', async () => {
        // The regression that motivated load-on-resolution: pc-material subscribed to the
        // asset's load event but nothing ever started the load, so a lazy map waited forever.
        // jsdom never completes image loads, so "started" is as far as this can observe.
        const { get } = await bootApp(`
            <pc-asset id="tex" src="tex.png" lazy></pc-asset>
            <pc-material id="m" diffuse-map="tex"></pc-material>
        `);
        const asset = get<AssetElement>('pc-asset').asset;

        expect(asset!.loading, 'resolving the map reference starts the load').toBe(true);
    });

    it('does not load a lazy atlas when a sprite merely declares it', async () => {
        // Wiring a sprite's data to its atlas at creation time is not a use - the engine's
        // sprite handler loads the atlas when the sprite itself loads. Loading here would make
        // lazy meaningless for any atlas a sprite references.
        const { get } = await bootApp(`
            <pc-asset id="atlas" type="textureatlas" src="atlas.png" lazy></pc-asset>
            <pc-asset id="spr" type="sprite" atlas="atlas" frame-keys="0" lazy></pc-asset>
        `);
        const atlas = get<AssetElement>('pc-asset[id="atlas"]').asset;

        expect(atlas!.loaded).toBe(false);
        expect(atlas!.loading, 'declaring a sprite must not load its atlas').toBe(false);
    });
});
