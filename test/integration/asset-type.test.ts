import { describe, expect, it } from 'vitest';

import type { AssetElement } from '../../src/asset';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * The asset type <pc-asset> infers from the `src` file extension when it has no `type`. Every
 * asset is `lazy`, so it is created and registered without anything being fetched.
 */
describe('<pc-asset> type inference', () => {
    useGuard();

    it.each([
        ['scene.ply', 'gsplat'],
        ['scene.sog', 'gsplat'],
        // XGRIDS LCC2 scenes, which the engine loads from 2.24.0
        ['scene.lcc2', 'gsplat']
    ])('infers %s as a %s asset', async (src, type) => {
        const { get } = await bootApp(`<pc-asset id="a" src="${src}" lazy></pc-asset>`);

        expect(get<AssetElement>('pc-asset').asset!.type).toBe(type);
    });

    it('lets an explicit type override the extension', async () => {
        // A SOG scene's meta.json is a gsplat asset, which its extension alone cannot say
        const { get } = await bootApp('<pc-asset id="a" src="meta.json" type="gsplat" lazy></pc-asset>');

        expect(get<AssetElement>('pc-asset').asset!.type).toBe('gsplat');
    });
});
