import type { AppBase, Asset } from 'playcanvas';
import { Texture } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AssetElement } from '../../src/asset';
import type { SkyElement } from '../../src/sky';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * Two lazy textures for the sky to race between. jsdom never completes image loads, so a lazy
 * texture stays pending until a test completes it by hand.
 */
const SKY_ASSETS = `
    <pc-asset id="sky-a" src="sky-a.png" lazy></pc-asset>
    <pc-asset id="sky-b" src="sky-b.png" lazy></pc-asset>
`;

/**
 * Completes a texture asset's load by hand, firing its real `load` event.
 *
 * @param asset - The pending texture asset.
 * @param app - The booted application, for its graphics device.
 * @returns The texture the asset now holds.
 */
const finishTextureLoad = (asset: Asset, app: AppBase) => {
    const texture = new Texture(app.graphicsDevice, { width: 4, height: 4 });
    asset.resource = texture;
    asset.loaded = true;
    asset.fire('load', asset);
    return texture;
};

describe('<pc-sky>', () => {
    const { uncaught } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    it('generates the skybox only from the newest asset when a superseded load settles later', async () => {
        const { app, get } = await bootApp(`${SKY_ASSETS}<pc-scene><pc-sky asset="sky-a"></pc-sky></pc-scene>`);
        const sky = get<SkyElement>('pc-sky');
        const assetA = get<AssetElement>('pc-asset[id="sky-a"]').asset!;
        const assetB = get<AssetElement>('pc-asset[id="sky-b"]').asset!;

        // The load parks on app readiness before it subscribes; a macrotask lets it land
        await settleTask();
        sky.setAttribute('asset', 'sky-b');
        await settleTask();

        // B settles first, then A - the superseded texture must not regenerate the skybox
        finishTextureLoad(assetB, app);
        const skybox = app.scene.skybox;
        expect(skybox, 'the newest asset generated the skybox').toBeTruthy();

        finishTextureLoad(assetA, app);
        expect(app.scene.skybox, 'the superseded asset did not regenerate it').toBe(skybox);
        expect(uncaught.seen).toEqual([]);
    });

    it('survives an asset whose load already failed, and uses a later reload', async () => {
        const { app, get } = await bootApp(`${SKY_ASSETS}<pc-scene><pc-sky></pc-sky></pc-scene>`);
        const sky = get<SkyElement>('pc-sky');
        const assetA = get<AssetElement>('pc-asset[id="sky-a"]').asset!;

        // The failed shape: the engine marks a failed load `loaded` with no resource
        assetA.loaded = true;

        sky.setAttribute('asset', 'sky-a');
        await settleTask();
        expect(app.scene.skybox ?? null, 'no skybox from an empty resource').toBeNull();

        // Without an error callback the binding waits, so a successful reload still delivers
        finishTextureLoad(assetA, app);
        expect(app.scene.skybox, 'the reload generated the skybox').toBeTruthy();
        expect(uncaught.seen).toEqual([]);
    });
});
