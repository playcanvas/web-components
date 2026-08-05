import {
    ADDRESS_CLAMP_TO_EDGE,
    ADDRESS_MIRRORED_REPEAT,
    FILTER_LINEAR_MIPMAP_LINEAR,
    FILTER_NEAREST,
    FILTER_NEAREST_MIPMAP_LINEAR,
    Texture,
    TextureAtlas
} from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AssetElement } from '../../src/asset';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * The texture option attributes against a real Asset and the engine's own TextureHandler. The
 * element tier covers parsing; this tier covers what reaches `asset.data` and the Texture.
 *
 * Every asset here is `lazy`, which keeps boot free of I/O and leaves the asset registered but
 * unloaded - the tests then hand-assign `asset.resource` to simulate a load, the same pattern as
 * the material texture-slot tests.
 */
describe('<pc-asset> texture options', () => {
    const { warnings } = useGuard();

    const ALL_OPTIONS = `
        <pc-asset id="t" src="t.png" lazy
            address-u="clamp" address-v="mirror"
            min-filter="nearest-mip-linear" mag-filter="nearest"
            anisotropy="8" mipmaps="false" srgb flip-y></pc-asset>
    `;

    it('maps every option into the asset data using the engine texture JSON keys', async () => {
        const { get } = await bootApp(ALL_OPTIONS);

        const asset = get<AssetElement>('pc-asset').asset!;

        expect(asset.data).toEqual({
            addressu: 'clamp',
            addressv: 'mirror',
            anisotropy: 8,
            flipY: true,
            magfilter: 'nearest',
            minfilter: 'nearest_mip_linear',
            mipmaps: false,
            srgb: true
        });
    });

    it('drives the engine TextureHandler: patching applies every mapped value', async () => {
        // A key the handler does not recognise would assign undefined here, so this pins the
        // kebab-to-snake rename against the real engine rather than against this library's tables
        const { app, get } = await bootApp(ALL_OPTIONS);

        const asset = get<AssetElement>('pc-asset').asset!;
        const texture = new Texture(app.graphicsDevice, { width: 1, height: 1 });
        asset.resource = texture;

        app.loader.patch(asset, app.assets);

        // The engine notes the post-creation RGBA8 -> SRGBA8 format switch; expected here, since
        // the texture is hand-made after the fact rather than constructed from the asset data
        warnings.allow(/Switching format of texture/);

        expect(texture.addressU).toBe(ADDRESS_CLAMP_TO_EDGE);
        expect(texture.addressV).toBe(ADDRESS_MIRRORED_REPEAT);
        expect(texture.minFilter).toBe(FILTER_NEAREST_MIPMAP_LINEAR);
        expect(texture.magFilter).toBe(FILTER_NEAREST);
        expect(texture.anisotropy).toBe(8);
        expect(texture.mipmaps).toBe(false);
        expect(texture.flipY).toBe(true);
        expect(texture.srgb).toBe(true);
    });

    it('writes nothing when no option is set, preserving per-format parser defaults', async () => {
        const { get } = await bootApp('<pc-asset id="t" src="t.png" lazy></pc-asset>');

        expect(get<AssetElement>('pc-asset').asset!.data).toEqual({});
    });

    it('overrides the matching data JSON key and leaves the rest untouched', async () => {
        const { get } = await bootApp(`
            <pc-asset id="t" src="t.png" lazy anisotropy="8"
                data='{"anisotropy": 2, "addressu": "clamp"}'></pc-asset>
        `);

        expect(get<AssetElement>('pc-asset').asset!.data).toEqual({ addressu: 'clamp', anisotropy: 8 });
    });

    it('updates a loaded texture and the asset data when an attribute changes', async () => {
        const { app, get } = await bootApp('<pc-asset id="t" src="t.png" lazy></pc-asset>');
        const element = get<AssetElement>('pc-asset');
        const asset = element.asset!;
        const texture = new Texture(app.graphicsDevice, { width: 1, height: 1 });
        asset.resource = texture;

        element.setAttribute('address-u', 'clamp');

        expect(texture.addressU).toBe(ADDRESS_CLAMP_TO_EDGE);
        expect(asset.data).toEqual({ addressu: 'clamp' });
    });

    it('records an option set after creation but before load in the asset data', async () => {
        const { get } = await bootApp('<pc-asset id="t" src="t.png" lazy></pc-asset>');
        const element = get<AssetElement>('pc-asset');

        element.setAttribute('anisotropy', '8');

        expect(element.asset!.data).toEqual({ anisotropy: 8 });
    });

    it('restores the engine default on a loaded texture when the attribute is removed', async () => {
        const { app, get } = await bootApp('<pc-asset id="t" src="t.png" lazy min-filter="nearest"></pc-asset>');
        const element = get<AssetElement>('pc-asset');
        const asset = element.asset!;
        const texture = new Texture(app.graphicsDevice, { width: 1, height: 1, minFilter: FILTER_NEAREST });
        asset.resource = texture;

        element.removeAttribute('min-filter');

        expect(texture.minFilter).toBe(FILTER_LINEAR_MIPMAP_LINEAR);
        expect(asset.data, 'a reload must behave as never-specified').toEqual({});
        expect(element.minFilter).toBeNull();
    });

    it('flips srgb on a loaded texture, recreating the GPU resource in place', async () => {
        const { app, get } = await bootApp('<pc-asset id="t" src="t.png" lazy></pc-asset>');
        const element = get<AssetElement>('pc-asset');
        const asset = element.asset!;
        const texture = new Texture(app.graphicsDevice, { width: 1, height: 1 });
        asset.resource = texture;
        expect(texture.srgb).toBe(false);

        element.setAttribute('srgb', '');

        // The recreate is exactly what the engine's format-switch note reports - expected, but the
        // srgb getter below is the assertion, not the engine's wording
        warnings.allow(/Switching format of texture/);

        expect(texture.srgb).toBe(true);
        expect(asset.data).toEqual({ srgb: true });
    });

    it('reaches the texture behind a textureatlas resource', async () => {
        const { app, get } = await bootApp('<pc-asset id="a" type="textureatlas" src="a.png" lazy></pc-asset>');
        const element = get<AssetElement>('pc-asset');
        const asset = element.asset!;
        const atlas = new TextureAtlas();
        atlas.texture = new Texture(app.graphicsDevice, { width: 1, height: 1 });
        asset.resource = atlas;

        element.setAttribute('mag-filter', 'nearest');

        expect(atlas.texture.magFilter).toBe(FILTER_NEAREST);
        expect(asset.data).toEqual({ magfilter: 'nearest' });
    });

    it('ignores the options on a non-texture asset and says so', async () => {
        const { get } = await bootApp(`
            <pc-asset id="t" type="text" src="data:text/plain,x" lazy address-u="clamp"></pc-asset>
        `);
        const element = get<AssetElement>('pc-asset');

        warnings.expect(
            "pc-asset 't' has attributes that do not apply to asset type 'text' and are ignored: address-u"
        );
        expect(element.asset!.data).toEqual({});

        // A later live write is a silent no-op - the warning fires once, at creation
        element.setAttribute('anisotropy', '8');
        expect(element.asset!.data).toEqual({});
    });

    it('warns about sprite attributes on a texture asset', async () => {
        await bootApp('<pc-asset id="t" src="t.png" lazy frame-keys="0 1"></pc-asset>');

        warnings.expect(
            "pc-asset 't' has attributes that do not apply to asset type 'texture' and are ignored: frame-keys"
        );
    });
});
