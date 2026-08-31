import { Entity, Vec3 } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';


/**
 * The smallest valid glTF: no meshes, one named node. instantiateRenderEntity() still returns a
 * real entity hierarchy for it, which is all these tests need - and it loads from a data: URI,
 * so no I/O.
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

const GLTF_SRC = containerSrc('model-root');

const ASSET_TAG = `<pc-asset id="m" type="container" src="${GLTF_SRC}"></pc-asset>`;

const ASSET_TAG_B = `<pc-asset id="m2" type="container" src="${containerSrc('model-root-b')}"></pc-asset>`;

describe('<pc-model>', () => {
    const { errors, uncaught, warnings } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    it('abandons a load whose element is removed while it waits', async () => {
        // _loadContent parks on the app's ready promise, which is already resolved here - so the
        // load resumes one microtask after connect. A same-task removal lands in that window,
        // and the resumed load must not instantiate content for an element that is gone.
        const { appElement, get } = await bootApp(ASSET_TAG);

        expect(get('pc-asset').asset!.loaded, 'the container asset really loaded').toBe(true);

        const model = document.createElement('pc-model');
        model.setAttribute('asset', 'm');
        appElement.appendChild(model);
        model.remove();

        await settleTask();

        expect(model.entity, 'the host died with the removal').toBeNull();
        expect(model.contentEntity, 'no content was instantiated for the removed element').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('does not instantiate when the element is removed while its asset loads', async () => {
        // With a lazy asset the load parks in the asset's load event rather than on the app's
        // readiness. Removing the element detaches that subscription, so the asset finishing
        // its load afterwards must not instantiate anything for the departed element.
        const { appElement, get } = await bootApp(ASSET_TAG.replace('>', ' lazy>'));
        const asset = get('pc-asset').asset!;
        expect(asset.loaded, 'the lazy asset starts unloaded').toBe(false);

        const model = document.createElement('pc-model');
        model.setAttribute('asset', 'm');
        appElement.appendChild(model);

        // Two microtask hops: the app-ready continuation runs on the first, which resumes the
        // load on the second - by then it has subscribed to the asset and started its load. The
        // data: fetch needs a macrotask, so it cannot have completed yet.
        await Promise.resolve();
        await Promise.resolve();
        model.remove();

        await vi.waitFor(() => expect(asset.loaded).toBe(true));
        await settleTask();

        expect(model.contentEntity, 'nothing was instantiated for the removed element').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('instantiates exactly once when pc-app is removed and re-added while booting', async () => {
        // Both connections' loads park on the same carried-over app-ready promise, so both
        // resume when the second boot completes. Only the load belonging to the current
        // connection may instantiate - the superseded one would leave an undisposed entity
        // behind, invisible except to this counter.
        const handle = mount(`
            <pc-app backend="null">
                ${ASSET_TAG}
                <pc-model asset="m"></pc-model>
            </pc-app>
        `);
        const appElement = handle.get<AppElement>('pc-app');

        // The ready event dispatches synchronously when the app resolves readiness, BEFORE the
        // parked loads resume on the microtask queue - early enough to wrap the resource they
        // will both instantiate from.
        let instantiations = 0;
        appElement.addEventListener('ready', (event) => {
            if (event.target !== appElement) {
                return;
            }
            const resource = handle.get('pc-asset').asset!.resource as { instantiateRenderEntity: () => unknown };
            const original = resource.instantiateRenderEntity.bind(resource);
            resource.instantiateRenderEntity = () => {
                instantiations += 1;
                return original();
            };
        });

        appElement.remove();
        handle.container.appendChild(appElement);

        await readyWithin(appElement);
        await settle(handle.container);
        await settleTask();

        appElement.app!.autoRender = false;

        expect(instantiations, 'the superseded load did not instantiate').toBe(1);
        expect(handle.get('pc-model').contentEntity, 'the surviving load produced the content').toBeTruthy();
        expect(uncaught.seen).toEqual([]);
    });

    it('instantiates only the newest asset when a superseded load settles later', async () => {
        // The model moves from asset A to B while both are still loading, then B settles before
        // A. Only B may instantiate - A settling afterwards must deliver nothing, or it would
        // replace B's content with its own.
        const { app, appElement } = await bootApp(`
            <pc-asset id="slow-a" type="container" src="slow-a.glb" lazy></pc-asset>
            <pc-asset id="slow-b" type="container" src="slow-b.glb" lazy></pc-asset>
        `);

        // Park both loads so the test settles them in a chosen order. Settling a parked load
        // runs the registry's own completion path, so the asset's real load event fires.
        const parked = new Map<string, (err: string | null, resource?: unknown) => void>();
        vi.spyOn(app.loader, 'load').mockImplementation(((
            url: string,
            _type: string,
            callback: (err: string | null, resource?: unknown) => void
        ) => {
            parked.set(url, callback);
        }) as typeof app.loader.load);

        const model = document.createElement('pc-model');
        model.setAttribute('asset', 'slow-a');
        appElement.appendChild(model);
        await vi.waitFor(() => expect(parked.has('slow-a.glb')).toBe(true));

        model.setAttribute('asset', 'slow-b');
        await vi.waitFor(() => expect(parked.has('slow-b.glb')).toBe(true));

        const container = (name: string) => ({ instantiateRenderEntity: () => new Entity(name, app) });
        parked.get('slow-b.glb')!(null, container('root-b'));
        parked.get('slow-a.glb')!(null, container('root-a'));

        expect(model.contentEntity!.name, 'only the newest asset instantiated').toBe('root-b');
        expect(model.contentEntity!.parent, 'parented beneath the host').toBe(model.entity);
        await readyWithin(model);
        expect(uncaught.seen).toEqual([]);
    });

    describe('readiness', () => {
        it('resolves ready only once the content is instantiated and parented', async () => {
            const { appElement } = await bootApp(ASSET_TAG.replace('>', ' lazy>'));

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'm');
            appElement.appendChild(model);

            let ready = false;
            model.ready().then(() => {
                ready = true;
            });

            // The host exists from the moment of connection - readiness tracks the content, not
            // the host entering the scene graph.
            expect(model.entity, 'the host is created on connection').not.toBeNull();

            // Let the connect continuations run: the app-ready resume on the first hop, the asset
            // subscription on the second. The data: fetch needs a macrotask, so the load cannot
            // have completed yet.
            await Promise.resolve();
            await Promise.resolve();
            expect(ready, 'not ready before the asset has loaded').toBe(false);
            expect(model.contentEntity, 'no content before the asset has loaded').toBeNull();

            await readyWithin(model);
            expect(model.contentEntity, 'ready implies instantiated content').not.toBeNull();
            expect(model.contentEntity!.parent, 'ready implies the content is parented beneath the host').toBe(model.entity);
            expect(model.entity!.parent, 'the host is parented under the application root').toBe(appElement.app!.root);
            expect(uncaught.seen).toEqual([]);
        });

        it('becomes ready with no content while no asset is assigned', async () => {
            const { appElement } = await bootApp();

            const model = document.createElement('pc-model');
            appElement.appendChild(model);

            // An empty selection is settled: the element is a usable host with nothing to load.
            // No warning either - the guard fails this test if anything warns.
            await readyWithin(model);
            expect(model.entity, 'the host exists without an asset').not.toBeNull();
            expect(model.contentEntity, 'there is no content to instantiate').toBeNull();
        });

        it('warns and never becomes ready when no asset matches the id', async () => {
            const { appElement } = await bootApp();

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'nope');
            appElement.appendChild(model);

            await expectNeverReady(model);
            warnings.expect("pc-model could not find asset 'nope'");
        });

        it('warns and never becomes ready outside pc-app', async () => {
            const handle = mount('<pc-model asset="m"></pc-model>');
            const model = handle.get('pc-model');

            warnings.expect("pc-model 'm' must be a descendant of pc-app");
            await expectNeverReady(model);
        });
    });

    describe('load and error events', () => {
        it('fires load once instantiated, with the entity already available', async () => {
            const { appElement } = await bootApp(ASSET_TAG);

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'm');
            const seen: { content: unknown; bubbles: boolean }[] = [];
            model.addEventListener('load', (event) => {
                seen.push({ content: model.contentEntity, bubbles: event.bubbles });
            });
            appElement.appendChild(model);

            await readyWithin(model);
            expect(seen).toHaveLength(1);
            expect(seen[0].content, 'the content is set by the time load fires').toBe(model.contentEntity);
            expect(seen[0].bubbles, 'load does not bubble, mirroring pc-asset').toBe(false);
            expect(model.contentEntity).not.toBeNull();
            expect(uncaught.seen).toEqual([]);
        });

        it('fires error and still becomes ready when the container fails to load', async () => {
            const { appElement } = await bootApp(
                '<pc-asset id="bad" type="container" src="data:model/gltf-binary,notaglb" lazy></pc-asset>'
            );

            const model = document.createElement('pc-model');
            model.setAttribute('asset', 'bad');
            const seen: ErrorEvent[] = [];
            model.addEventListener('error', (event) => seen.push(event as ErrorEvent));
            appElement.appendChild(model);

            await readyWithin(model);
            expect(model.contentEntity, 'readiness means the load settled, not that it succeeded').toBeNull();
            expect(model.entity, 'the host survives a failed load').not.toBeNull();
            expect(seen).toHaveLength(1);
            expect(seen[0].message, 'the engine error is forwarded').not.toBe('');
            expect(seen[0].bubbles).toBe(false);

            // The engine logs the parse failure itself; the event above is the element's channel
            errors.expect(/glb/i);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('[asset]', () => {
        it('re-instantiates content beneath the surviving host when the asset changes', async () => {
            const { appElement, get } = await bootApp(`${ASSET_TAG}${ASSET_TAG_B}<pc-model asset="m"></pc-model>`);
            const model = get('pc-model');

            const host = model.entity!;
            const first = model.contentEntity!;
            expect(first.findByName('model-root'), 'the first model is instantiated').not.toBeNull();

            let loads = 0;
            model.addEventListener('load', () => {
                loads += 1;
            });

            model.setAttribute('asset', 'm2');
            expect(model.contentEntity, 'the old content is torn down synchronously').toBeNull();
            expect(model.entity, 'the host survives the change').toBe(host);

            await readyWithin(model);
            const second = model.contentEntity!;
            expect(second, 'new content was instantiated').not.toBe(first);
            expect(second.findByName('model-root-b'), 'the new content comes from the new asset').not.toBeNull();
            expect(second.parent, 'the new content is parented beneath the host').toBe(host);
            expect(host.parent, 'the host never left the scene').toBe(appElement.app!.root);
            expect(first.parent, 'the old content left the scene').toBeNull();
            expect(loads, 'each instantiation fires load').toBe(1);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('host entity', () => {
        it('registers the host so picks and lookups resolve to this element', async () => {
            const { appElement, get } = await bootApp(`${ASSET_TAG}<pc-model asset="m"></pc-model>`);
            const model = get('pc-model');

            expect(appElement.elementFromEntity(model.entity!), 'the identity map points back here').toBe(model);
            expect(appElement.elementFromEntity(model.contentEntity!),
                'the content root itself is not fronted by any element').toBeNull();
        });

        it('applies authored properties to the host and writes changes through', async () => {
            const { get } = await bootApp(
                `${ASSET_TAG}<pc-model asset="m" name="prop" position="1 2 3" scale="2 2 2" tags="a, b"></pc-model>`
            );
            const model = get('pc-model');
            const host = model.entity!;

            expect(host.name).toBe('prop');
            expect(host.getLocalPosition().equals(new Vec3(1, 2, 3))).toBe(true);
            expect(host.getLocalScale().equals(new Vec3(2, 2, 2))).toBe(true);
            expect(host.tags.list().sort()).toEqual(['a', 'b']);

            model.position = new Vec3(4, 5, 6);
            model.enabled = false;
            expect(host.getLocalPosition().equals(new Vec3(4, 5, 6))).toBe(true);
            expect(host.enabled).toBe(false);

            // The authored transform composes with the host's rather than being overwritten by it:
            // the content root keeps its own local transform beneath the placed host.
            expect(model.contentEntity!.parent).toBe(host);
        });
    });
});
