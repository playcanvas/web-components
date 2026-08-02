import type { StandardMaterial } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { RenderComponentElement } from '../../src/components/render-component';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';


/**
 * pc-render[material] against a real render component. This is the one unparsed string attribute
 * whose removal reached the engine rather than stopping at the element, so it gets engine-level
 * coverage on top of the element-tier removal table.
 */
describe('<pc-render> material', () => {
    useGuard();

    const markup = `
        <pc-material id="red" diffuse="1 0 0"></pc-material>
        <pc-entity name="box">
            <pc-render type="box" material="red"></pc-render>
        </pc-entity>
    `;

    it('resolves the material onto every mesh instance', async () => {
        const { get } = await bootApp(markup);
        const component = get<RenderComponentElement>('pc-render').component;

        expect(component.meshInstances.length).toBeGreaterThan(0);
        for (const meshInstance of component.meshInstances) {
            expect((meshInstance.material as StandardMaterial)?.diffuse.r).toBe(1);
        }
    });

    it('leaves the mesh instances usable when the attribute is removed', async () => {
        // Previously the setter assigned the unresolved lookup straight through. The engine's
        // MeshInstance material setter takes `undefined` literally - it clears _material and skips
        // the ref/transparency/key bookkeeping - so removing the attribute left every mesh instance
        // with no material at all. The lookup is now guarded like every other reference attribute.
        const { get } = await bootApp(markup);
        const element = get<RenderComponentElement>('pc-render');
        const component = element.component;

        element.removeAttribute('material');

        expect(element.material, 'the element property returns to its default').toBe('');
        for (const meshInstance of component.meshInstances) {
            expect(meshInstance.material, 'a mesh instance was left with no material').toBeTruthy();
        }
    });

    it('ignores a material id that resolves to nothing', async () => {
        const { get } = await bootApp(markup);
        const element = get<RenderComponentElement>('pc-render');
        const component = element.component;

        element.setAttribute('material', 'no-such-material');

        expect(element.material).toBe('no-such-material');
        for (const meshInstance of component.meshInstances) {
            expect(meshInstance.material, 'an unresolved id wiped the material').toBeTruthy();
        }
    });
});
