import type { RenderComponent } from 'playcanvas';
import {
    Entity,
    LAYERID_WORLD,
    Plane,
    SHADOW_CASCADE_0,
    SHADOW_CASCADE_1,
    SHADOW_CASCADE_2,
    SHADOW_CASCADE_3,
    Vec3
} from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { RenderComponentElement } from '../../../src/components/render-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const ALL_CASCADES = SHADOW_CASCADE_0 | SHADOW_CASCADE_1 | SHADOW_CASCADE_2 | SHADOW_CASCADE_3;

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
            // Compared by cascade: the engine's SHADOW_CASCADE_ALL also sets the bits of cascades
            // that do not exist, while the element's '0 1 2 3' sets exactly the four that do
            for (const cascade of [SHADOW_CASCADE_0, SHADOW_CASCADE_1, SHADOW_CASCADE_2, SHADOW_CASCADE_3]) {
                expect(component.shadowCascadeMask & cascade).toBe(engine.shadowCascadeMask & cascade);
            }
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

    describe('[enabled]', () => {
        it('keeps the mesh out of the layers until the element is enabled', async () => {
            const { app, get } = await bootApp(scene('enabled="false"'));
            const element = get<RenderComponentElement>('pc-render');
            const world = app.scene.layers.getLayerById(LAYERID_WORLD)!;
            const [meshInstance] = element.component!.meshInstances;

            expect(world.meshInstances, 'not drawn while disabled').not.toContain(meshInstance);

            element.removeAttribute('enabled');
            expect(world.meshInstances, 'drawn once enabled').toContain(meshInstance);
        });
    });

    describe('[type]', () => {
        it("renders the engine's own torus", async () => {
            const { app, get } = await bootApp(scene('type="torus"'));
            const component = get<RenderComponentElement>('pc-render').component!;

            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('render', { type: 'torus' }) as RenderComponent;

            expect(component.type).toBe('torus');
            expect(component.meshInstances[0].mesh!.vertexBuffer.numVertices).toBe(
                engine.meshInstances[0].mesh!.vertexBuffer.numVertices
            );
        });

        it('switches an existing element to a torus', async () => {
            const { get } = await bootApp(scene());
            const element = get<RenderComponentElement>('pc-render');

            element.setAttribute('type', 'torus');
            expect(element.type).toBe('torus');
            expect(element.component!.type).toBe('torus');
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
            expect(element.component!.shadowCascadeMask).toBe(ALL_CASCADES);
        });

        it('warns on a name outside 0 to 3 and keeps all cascades', async () => {
            const { get } = await bootApp(scene('shadow-cascade-mask="0 4"'));

            expect(get<RenderComponentElement>('pc-render').component!.shadowCascadeMask).toBe(ALL_CASCADES);
            warnings.expect("Invalid value '0 4' for attribute 'shadow-cascade-mask'");
        });
    });

    describe('[clipping-planes]', () => {
        const wedge = [new Plane(new Vec3(0, -1, 0), 0), new Plane(new Vec3(0, 0, -1), 0)];

        it('gives its planes and their mode to the component and its mesh instances', async () => {
            const { get } = await bootApp(
                '<pc-entity><pc-render clipping-planes="0 -1 0 0, 0 0 -1 0" clip-intersection></pc-render></pc-entity>'
            );
            const component = get<RenderComponentElement>('pc-render').component!;

            expect(component.clippingPlanes).toEqual(wedge);
            expect(component.clipIntersection).toBe(true);
            for (const meshInstance of component.meshInstances) {
                expect(meshInstance.clippingPlanes).toEqual(wedge);
                expect(meshInstance.clipIntersection).toBe(true);
            }
        });

        it('writes changes through and clips nothing once the attributes are removed', async () => {
            const { get } = await bootApp('<pc-entity><pc-render></pc-render></pc-entity>');
            const render = get<RenderComponentElement>('pc-render');

            expect(render.component!.clippingPlanes, 'no planes by default').toEqual([]);
            expect(render.component!.clipIntersection).toBe(false);

            render.setAttribute('clipping-planes', '0 -1 0 0, 0 0 -1 0');
            render.setAttribute('clip-intersection', '');
            expect(render.component!.clippingPlanes).toEqual(wedge);
            expect(render.component!.clipIntersection).toBe(true);

            render.removeAttribute('clipping-planes');
            render.removeAttribute('clip-intersection');
            expect(render.component!.clippingPlanes).toEqual([]);
            expect(render.component!.meshInstances[0].clippingPlanes).toEqual([]);
            expect(render.component!.clipIntersection).toBe(false);
        });

        it('warns on a plane that is not 4 numbers and clips nothing', async () => {
            // A normal without its distance, which is the half a plane is easiest to leave off
            const { get } = await bootApp('<pc-entity><pc-render clipping-planes="0 -1 0"></pc-render></pc-entity>');

            warnings.expect(
                "Invalid value '0 -1 0' for attribute 'clipping-planes'. Expected planes separated by commas, each as 4 space-separated numbers. Using no planes."
            );
            expect(get<RenderComponentElement>('pc-render').component!.clippingPlanes).toEqual([]);
        });
    });
});
