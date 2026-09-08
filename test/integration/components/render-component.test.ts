import type { RenderComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { RenderComponentElement } from '../../../src/components/render-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (renderAttributes = '') =>
    `<pc-entity name="shape"><pc-render ${renderAttributes}></pc-render></pc-entity>`;

describe('<pc-render>', () => {
    useGuard();

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
});
