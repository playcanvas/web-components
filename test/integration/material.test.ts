import { BLEND_NORMAL, CULLFACE_FRONT, Texture, Vec2 } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../src/asset';
import type { MaterialElement } from '../../src/material';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * <pc-material> against a real StandardMaterial on the null graphics device. The element tier
 * covers parsing; this tier covers what actually reaches the engine.
 */
describe('<pc-material> integration', () => {
    const { warnings } = useGuard();

    const flush = () => Promise.resolve();

    it('writes parsed attribute values through to the material', async () => {
        const { get } = await bootApp(`
            <pc-material id="m"
                diffuse="1 0 0"
                gloss="0.8"
                opacity="0.5"
                cull="front"
                blend-type="normal"
                diffuse-map-tiling="4 4"
                diffuse-map-channel="r"
                two-sided-lighting="true"></pc-material>
        `);

        const material = get<MaterialElement>('pc-material').material;
        expect(material).toBeTruthy();

        expect(material!.diffuse.r).toBe(1);
        expect(material!.diffuse.g).toBe(0);
        expect(material!.gloss).toBe(0.8);
        expect(material!.opacity).toBe(0.5);
        expect(material!.cull).toBe(CULLFACE_FRONT);
        expect(material!.blendType).toBe(BLEND_NORMAL);
        expect(material!.diffuseMapTiling).toEqual(new Vec2(4, 4));
        expect(material!.diffuseMapChannel).toBe('r');
        expect(material!.twoSidedLighting).toBe(true);
    });

    it('enables the metalness workflow on a dielectric, unlike a bare StandardMaterial', async () => {
        // Without useMetalness, metalnessMap is never sampled - the LIT_METALNESS define is driven
        // straight off it - so the metalness-* attributes would do nothing at all. metalness has to
        // be 0 to go with it: the engine's 1 is a don't-care under its own useMetalness of false,
        // and enabling the workflow while adopting it makes every material fully metallic, which
        // drops the diffuse lobe and leaves a bare <pc-material diffuse="..."> nearly black.
        const { get } = await bootApp('<pc-material id="m"></pc-material>');

        const material = get<MaterialElement>('pc-material').material!;
        expect(material.useMetalness).toBe(true);
        expect(material.metalness).toBe(0);
    });

    it('honours use-metalness="false" for the older specular workflow', async () => {
        const { get } = await bootApp('<pc-material id="m" use-metalness="false"></pc-material>');

        expect(get<MaterialElement>('pc-material').material!.useMetalness).toBe(false);
    });

    it('inverts gloss for roughness-map but not for gloss-map', async () => {
        const { all } = await bootApp(`
            <pc-material id="rough" roughness-map="tex"></pc-material>
            <pc-material id="glossy" gloss-map="tex"></pc-material>
        `);

        const [rough, glossy] = all<MaterialElement>('pc-material');

        expect(rough.material!.glossInvert).toBe(true);
        expect(glossy.material!.glossInvert).toBe(false);
    });

    it('warns when the roughness and gloss families are mixed', async () => {
        await bootApp('<pc-material id="mixed" gloss="0.5" roughness="0.5"></pc-material>');

        warnings.expect("pc-material 'mixed' sets both 'roughness' and 'gloss'");
    });

    it('coalesces update() across a burst of attribute writes', async () => {
        const { get } = await bootApp('<pc-material id="m"></pc-material>');
        const element = get<MaterialElement>('pc-material');
        const update = vi.spyOn(element.material!, 'update');

        element.setAttribute('diffuse', '0 1 0');
        element.setAttribute('gloss', '0.9');
        element.setAttribute('opacity', '0.5');
        element.setAttribute('metalness', '0.2');

        expect(update, 'nothing runs synchronously').not.toHaveBeenCalled();
        await flush();
        expect(update).toHaveBeenCalledTimes(1);
    });

    describe('texture slots', () => {
        /**
         * Boots a lazy texture asset alongside a material, so the asset is registered but has not
         * loaded - which is the state the pending-load path exists for.
         *
         * @param materialAttributes - Attributes for the pc-material.
         * @returns The booted handle, plus the asset, the element and an unloaded texture.
         */
        const bootWithLazyTexture = async (materialAttributes: string) => {
            const handle = await bootApp(`
                <pc-asset id="tex" src="tex.png" lazy></pc-asset>
                <pc-material id="m" ${materialAttributes}></pc-material>
            `);

            const asset = handle.get<AssetElement>('pc-asset').asset;
            const element = handle.get<MaterialElement>('pc-material');
            const texture = new Texture(handle.app.graphicsDevice, { width: 1, height: 1 });

            expect(asset).toBeTruthy();
            expect(asset!.loaded, 'a lazy asset should not have loaded').toBe(false);

            return { ...handle, asset: asset!, element, texture };
        };

        it('applies the texture once a pending asset loads', async () => {
            const { asset, element, texture } = await bootWithLazyTexture('diffuse-map="tex"');

            expect(element.material!.diffuseMap, 'nothing to apply yet').toBeNull();

            asset.resource = texture;
            asset.fire('load', asset);

            expect(element.material!.diffuseMap).toBe(texture);
            expect(texture.anisotropy, 'the library default applies when the asset declares nothing').toBe(4);
        });

        it('leaves an asset-declared anisotropy alone when applying a map', async () => {
            const { app, get } = await bootApp(`
                <pc-asset id="tex" src="tex.png" lazy anisotropy="8"></pc-asset>
                <pc-material id="m" diffuse-map="tex"></pc-material>
            `);
            const asset = get<AssetElement>('pc-asset').asset!;
            const element = get<MaterialElement>('pc-material');
            // anisotropy 8 mirrors what the engine texture constructor reads from asset.data at load
            const texture = new Texture(app.graphicsDevice, { width: 1, height: 1, anisotropy: 8 });

            asset.resource = texture;
            asset.fire('load', asset);

            expect(element.material!.diffuseMap).toBe(texture);
            expect(texture.anisotropy, 'the library default must not clobber the declared value').toBe(8);
        });

        it('leaves a data-JSON-declared anisotropy alone when applying a map', async () => {
            const { app, get } = await bootApp(`
                <pc-asset id="tex" src="tex.png" lazy data='{"anisotropy": 8}'></pc-asset>
                <pc-material id="m" diffuse-map="tex"></pc-material>
            `);
            const asset = get<AssetElement>('pc-asset').asset!;
            const element = get<MaterialElement>('pc-material');
            const texture = new Texture(app.graphicsDevice, { width: 1, height: 1, anisotropy: 8 });

            asset.resource = texture;
            asset.fire('load', asset);

            expect(element.material!.diffuseMap).toBe(texture);
            expect(texture.anisotropy, 'the data JSON must win like the attribute does').toBe(8);
        });

        it('clears the slot when the attribute is removed', async () => {
            const { asset, element, texture } = await bootWithLazyTexture('diffuse-map="tex"');

            asset.resource = texture;
            asset.fire('load', asset);
            expect(element.material!.diffuseMap).toBe(texture);

            element.removeAttribute('diffuse-map');

            expect(element.material!.diffuseMap).toBeNull();
            expect(element.diffuseMap).toBe('');
        });

        it('drops a pending load when the attribute is removed', async () => {
            // The handler used to outlive the assignment, so an asset that finished loading after
            // the element had moved on would still write its texture into the slot.
            const { asset, element, texture } = await bootWithLazyTexture('diffuse-map="tex"');

            element.removeAttribute('diffuse-map');

            asset.resource = texture;
            asset.fire('load', asset);

            expect(element.material!.diffuseMap, 'the abandoned load still wrote through').toBeNull();
        });

        it('drops a pending load when the element disconnects', async () => {
            const { asset, element, texture, unmount } = await bootWithLazyTexture('diffuse-map="tex"');

            unmount();
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });

            expect(element.material, 'the material is destroyed on disconnect').toBeNull();

            asset.resource = texture;
            expect(() => asset.fire('load', asset), 'a late load must not touch the torn-down element').not.toThrow();
        });
    });
});
