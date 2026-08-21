import { describe, expect, it } from 'vitest';

import type { CameraComponentElement } from '../../../src/components/camera-component';
import type { RenderComponentElement } from '../../../src/components/render-component';
import type { ModelElement } from '../../../src/model';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';
import { expectNeverReady, readyWithin } from '../../helpers/ready';

/**
 * The smallest valid glTF with one named node, per name. instantiateRenderEntity() returns a real
 * hierarchy for it, and it loads from a data: URI - no I/O.
 *
 * @param nodeName - The name of the glTF's single node.
 * @returns The data: URI.
 */
const containerSrc = (nodeName: string) => `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: nodeName }]
}))}`;

const ASSETS = `
    <pc-asset id="m" type="container" src="${containerSrc('content-root')}"></pc-asset>
    <pc-asset id="m2" type="container" src="${containerSrc('content-root-b')}"></pc-asset>
`;

/**
 * Component hosting on entity-fronting elements. `closestEntity` resolves `pc-entity`, `pc-model`
 * and `pc-node`, so a component element inside a `<pc-model>` attaches to the model's host
 * entity - the stable wrapper the content is parented beneath - and survives asset changes with
 * it. These are the cross-element contracts; each component's own behavior lives in its module's
 * suite.
 */
describe('component hosting', () => {
    const { errors, uncaught, warnings } = useGuard();

    describe('inside a pc-model', () => {
        it('attaches to the host once the content settles', async () => {
            const { get } = await bootApp(`${ASSETS}<pc-model asset="m"><pc-render type="box"></pc-render></pc-model>`);
            const model = get<ModelElement>('pc-model');
            const render = get<RenderComponentElement>('pc-render');

            expect(render.component, 'the component exists').toBeTruthy();
            expect(render.component.entity, 'on the model host').toBe(model.entity);
            expect(model.entity!.render, 'not on the content root').toBe(render.component);
            expect(model.contentEntity!.render).toBeUndefined();
        });

        it('attaches on an empty asset, whose selection settles immediately', async () => {
            const { get } = await bootApp('<pc-model name="group"><pc-camera></pc-camera></pc-model>');
            const camera = get<CameraComponentElement>('pc-camera');

            expect(camera.component).toBeTruthy();
            expect(camera.component.entity).toBe(get<ModelElement>('pc-model').entity);
        });

        it('attaches after a failed load - readiness means the selection settled', async () => {
            const { container } = await bootApp(
                '<pc-asset id="bad" type="container" src="data:model/gltf-binary,notaglb" lazy></pc-asset>'
            );

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'bad');
            const camera = document.createElement('pc-camera');
            model.appendChild(camera);
            container.querySelector('pc-app')!.appendChild(model);

            await readyWithin(camera);
            expect(camera.component, 'the host is usable despite the failed content').toBeTruthy();
            expect(camera.component!.entity).toBe(model.entity);
            expect(model.contentEntity).toBeNull();

            // The engine logs the parse failure itself; the element's error event is its channel
            errors.expect(/glb/i);
            expect(uncaught.seen).toEqual([]);
        });

        it('survives an asset change on the same host entity', async () => {
            const { get } = await bootApp(`${ASSETS}<pc-model asset="m"><pc-render type="box"></pc-render></pc-model>`);
            const model = get<ModelElement>('pc-model');
            const render = get<RenderComponentElement>('pc-render');
            const component = render.component;

            model.setAttribute('asset', 'm2');
            await readyWithin(model);

            expect(render.component, 'the same component instance').toBe(component);
            expect(render.component.entity, 'still on the surviving host').toBe(model.entity);
            expect(model.contentEntity!.name, 'above the new content').toBe('content-root-b');
        });

        it('warns and skips a duplicate component on the host, naming it', async () => {
            const { get } = await bootApp(`
                ${ASSETS}
                <pc-model asset="m" name="prop">
                    <pc-camera></pc-camera>
                    <pc-camera id="second"></pc-camera>
                </pc-model>
            `);

            await readyWithin(get<CameraComponentElement>('pc-camera[id="second"]'));
            warnings.expect("pc-camera 'second' - 'prop' already has a 'camera' component - component not added");
        });
    });

    describe('child entities of a pc-model', () => {
        it('defer with a model that is itself deferred behind an unresolved node', async () => {
            // A model inserted under a pc-node that has not bound creates its host but cannot
            // parent it. Its own children must defer with it - not parent beneath the floating
            // host and announce readiness from outside the scene graph.
            const { get } = await bootApp(`${ASSETS}<pc-model asset="m"></pc-model>`);
            const outer = get<ModelElement>('pc-model');

            const node = document.createElement('pc-node');
            node.setAttribute('name', 'Nowhere');
            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'm2');
            const child = document.createElement('pc-entity');
            child.setAttribute('name', 'attachment');
            model.appendChild(child);
            node.appendChild(model);
            outer.appendChild(node);

            warnings.expect("pc-node 'Nowhere' not found in model 'm'");
            expect(model.entity!.parent, 'the deferred host is unparented').toBeNull();
            expect(child.entity?.parent ?? null, 'and its child defers with it').toBeNull();
            await expectNeverReady(model);

            node.setAttribute('name', 'content-root');

            expect(model.entity!.parent, 'the bind parents the host under the bound node').toBe(node.entity);
            expect(child.entity!.parent, 'and the child beneath the host').toBe(model.entity);
            await readyWithin(model);
            expect(model.contentEntity!.parent, 'the content arrived beneath the host too').toBe(model.entity);
        });

        it('parent under the host at build, without waiting for the content', async () => {
            const { appElement } = await bootApp(
                `<pc-asset id="m" type="container" src="${containerSrc('content-root')}" lazy></pc-asset>`
            );

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'm');
            const child = document.createElement('pc-entity');
            child.setAttribute('name', 'attachment');
            model.appendChild(child);
            appElement.appendChild(model);

            // The host and the child build synchronously on insertion; the lazy content has not
            // even started arriving.
            expect(child.entity, 'the child entity exists').toBeTruthy();
            expect(child.entity!.parent, 'parented under the host').toBe(model.entity);
            expect(model.contentEntity, 'before any content').toBeNull();

            await readyWithin(model);
            expect(child.entity!.parent, 'and stays there once the content lands beside it').toBe(model.entity);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('nested models', () => {
        it('parents the inner host under the outer host, keeping content trees apart', async () => {
            await bootApp(`
                ${ASSETS}
                <pc-model asset="m"><pc-model asset="m2"></pc-model></pc-model>
            `);
            const [outer, inner] = Array.from(document.querySelectorAll('pc-model')) as ModelElement[];

            expect(inner.entity!.parent, 'inner host under outer host').toBe(outer.entity);
            expect(inner.contentEntity!.parent, "inner content under the inner host").toBe(inner.entity);
            expect(outer.contentEntity!.children, 'the outer content adopted nothing').toHaveLength(0);
        });

        it("keeps an outer model's pc-node out of the inner model's content", async () => {
            // The node is inserted after boot: a node that never binds never becomes ready, and
            // bootApp settles the whole tree.
            const { get } = await bootApp(`
                ${ASSETS}
                <pc-model asset="m"><pc-model asset="m2"></pc-model></pc-model>
            `);
            const outer = get<ModelElement>('pc-model[asset="m"]');

            const node = document.createElement('pc-node');
            node.setAttribute('name', 'content-root-b');
            outer.appendChild(node);

            // The inner model's content is a sibling subtree of the outer content root, so the
            // outer model's node resolution never sees it.
            expect(node.state).toBe('missing');
            warnings.expect("pc-node 'content-root-b' not found in model 'm' - closest match: 'content-root'");
            await expectNeverReady(node);
        });
    });

    describe('sound slots on a model host', () => {
        it('survive an asset change with the component', async () => {
            const { get } = await bootApp(`
                ${ASSETS}
                <pc-model asset="m">
                    <pc-sounds><pc-sound name="blip"></pc-sound></pc-sounds>
                </pc-model>
            `);
            const model = get<ModelElement>('pc-model');
            const sounds = get('pc-sounds') as { component?: { slots: Record<string, unknown> } };

            expect(Object.keys(sounds.component!.slots)).toContain('blip');

            model.setAttribute('asset', 'm2');
            await readyWithin(model);

            expect(Object.keys(sounds.component!.slots), 'the slot outlived the swap').toContain('blip');
        });
    });
});
