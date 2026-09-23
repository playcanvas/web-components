import type { RenderComponent } from 'playcanvas';
import { Entity, SHADOW_CASCADE_0, SHADOW_CASCADE_1, SHADOW_CASCADE_3, SHADOW_CASCADE_ALL } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { RenderComponentElement } from '../../../src/components/render-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (renderAttributes = '') =>
    `<pc-entity name="shape"><pc-render ${renderAttributes}></pc-render></pc-entity>`;

describe('<pc-render>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('defaults to a box, which is the one default that departs from the engine on purpose', async () => {
            const { app, get } = await bootApp(scene());
            const component = get<RenderComponentElement>('pc-render').component!;

            // The engine's default type is 'asset', which draws nothing without one. This element
            // exists to place primitives - assets go through <pc-model> - so a bare <pc-render>
            // is a box. Every other property it writes matches a bare engine component.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('render') as RenderComponent;

            expect(component.type).toBe('box');
            expect(engine.type).toBe('asset');
            expect(component.castShadows).toBe(engine.castShadows);
            expect(component.receiveShadows).toBe(engine.receiveShadows);
            expect(component.shadowCascadeMask).toBe(engine.shadowCascadeMask);
        });

        it('leaves the material at the engine default when none is named', async () => {
            const { app, get } = await bootApp(scene());
            const component = get<RenderComponentElement>('pc-render').component!;

            // Passing an unresolved material through the initial data would set the component's
            // material to undefined; the meshes would still draw with the default material, but
            // the component would no longer say so
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('render') as RenderComponent;

            expect(component.material).toBe(engine.material);
            expect(component.meshInstances[0].material).toBe(engine.material);
        });
    });

    describe('[shadow-cascade-mask]', () => {
        it('folds the cascade indices into the mask of every mesh instance', async () => {
            const { get } = await bootApp(scene('shadow-cascade-mask="0 1"'));
            const component = get<RenderComponentElement>('pc-render').component!;

            expect(component.shadowCascadeMask).toBe(SHADOW_CASCADE_0 | SHADOW_CASCADE_1);
            expect(component.meshInstances[0].shadowCascadeMask).toBe(SHADOW_CASCADE_0 | SHADOW_CASCADE_1);
        });

        it('writes changes through and restores all cascades on removal', async () => {
            const { get } = await bootApp(scene());
            const element = get<RenderComponentElement>('pc-render');

            element.setAttribute('shadow-cascade-mask', '3');
            expect(element.component!.shadowCascadeMask).toBe(SHADOW_CASCADE_3);

            element.setAttribute('shadow-cascade-mask', '');
            expect(element.component!.shadowCascadeMask, 'an empty list casts into no cascade').toBe(0);

            element.removeAttribute('shadow-cascade-mask');
            expect(element.component!.shadowCascadeMask).toBe(SHADOW_CASCADE_ALL);
        });

        it('warns on an index outside 0 to 3 and keeps all cascades', async () => {
            const { get } = await bootApp(scene('shadow-cascade-mask="0 4"'));

            expect(get<RenderComponentElement>('pc-render').component!.shadowCascadeMask).toBe(SHADOW_CASCADE_ALL);
            warnings.expect("Invalid value '0 4' for attribute 'shadow-cascade-mask'");
        });
    });
});
