import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';


/**
 * The smallest valid glTF: no meshes, one named node. instantiateRenderEntity() still returns a
 * real entity hierarchy for it, which is all these tests need - and it loads from a data: URI,
 * so no I/O.
 */
const GLTF_SRC = `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'model-root' }]
}))}`;

const ASSET_TAG = `<pc-asset id="m" type="container" src="${GLTF_SRC}"></pc-asset>`;

describe('<pc-model>', () => {
    const { uncaught } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    it('abandons a load whose element is removed while it waits', async () => {
        // _loadModel parks on the app's ready promise, which is already resolved here - so the
        // load resumes one microtask after connect. A same-task removal lands in that window,
        // and the resumed load must not instantiate an entity for an element that is gone.
        const { appElement, get } = await bootApp(ASSET_TAG);

        expect(get('pc-asset').asset!.loaded, 'the container asset really loaded').toBe(true);

        const model = document.createElement('pc-model');
        model.setAttribute('asset', 'm');
        appElement.appendChild(model);
        model.remove();

        await settleTask();

        expect(model.entity, 'no entity was instantiated for the removed element').toBeNull();
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
        expect(handle.get('pc-model').entity, 'the surviving load produced the entity').toBeTruthy();
        expect(uncaught.seen).toEqual([]);
    });
});
