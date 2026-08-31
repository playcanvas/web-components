import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { CameraComponentElement } from '../../src/components/camera-component';
import type { EntityElement } from '../../src/entity';
import type { SceneElement } from '../../src/scene';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/** The smallest valid glTF, for the pc-model re-boot case. Loads from a data: URI. */
const MODEL_ASSET_TAG = `<pc-asset id="reboot-m" type="container" src="data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'reboot-root' }]
    })
)}"></pc-asset>`;

/**
 * <pc-app> boot and teardown state. Removing the element must return it - and everything that
 * keyed off its readiness - to the pre-boot state, so that re-inserting it boots afresh, and so
 * that a boot still in flight at removal abandons itself instead of completing against an
 * element that is no longer in the document.
 */
describe('<pc-app> lifecycle', () => {
    const { uncaught } = useGuard();

    const settleTask = () =>
        new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

    it('abandons boot when pc-app is detached while it boots', async () => {
        // The removal lands while connectedCallback is parked at its first await, which is before
        // the canvas or the application exist. A boot that continued anyway would start an rAF
        // ticker and add a window resize listener on an element nothing can ever clean up.
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        appElement.remove();

        await expectNeverReady(appElement);

        expect(appElement.app, 'no application was created').toBeNull();
        expect(appElement.querySelector('canvas'), 'no canvas was created').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('abandons boot when an asset load listener removes pc-app during the asset sweep', async () => {
        // A fileless asset completes synchronously inside app.assets.add() during boot's asset
        // sweep, dispatching the pc-asset element's documented load event - so a listener can
        // tear the element down from inside the sweep. Boot must stop there: the entities it
        // would otherwise go on to create belong to no application, and parenting them
        // dereferences the destroyed application's root.
        const handle = mount(`
            <pc-app backend="null">
                <pc-asset id="inline-data" type="json" data='{"answer": 42}'></pc-asset>
                <pc-entity name="e"></pc-entity>
            </pc-app>
        `);
        const appElement = handle.get<AppElement>('pc-app');
        // Grabbed before the listener fires - the removal takes the subtree out of the container
        const entityElement = handle.get<EntityElement>('pc-entity');

        // The load event does not bubble, so listen on the asset element itself
        handle.get('pc-asset').addEventListener('load', () => appElement.remove(), { once: true });

        await expectNeverReady(appElement);

        expect(appElement.app, 'the application is destroyed').toBeNull();
        expect(appElement._hierarchyReady).toBe(false);
        expect(entityElement.entity, 'no orphan entity was created').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('abandons boot when a ready listener removes pc-app during the hierarchy build', async () => {
        // Building the hierarchy dispatches each entity's ready event synchronously from inside
        // boot, so a listener can tear the element down mid-sweep. The teardown's reset must
        // survive the rest of the boot: _hierarchyReady flipping back to true would send the
        // descendants of a later re-insertion down the runtime-insertion path into a null app.
        const handle = mount(`
            <pc-app backend="null">
                <pc-entity name="first"></pc-entity>
                <pc-entity name="second"></pc-entity>
            </pc-app>
        `);
        const appElement = handle.get<AppElement>('pc-app');

        // Fires for the first entity to become ready - the first ready event of the boot
        appElement.addEventListener('ready', () => appElement.remove(), { once: true });

        await expectNeverReady(appElement);

        expect(appElement.app, 'the application is destroyed').toBeNull();
        expect(appElement._hierarchyReady, 'the reset survives the abandoned boot').toBe(false);
        expect(uncaught.seen).toEqual([]);

        // And the element recovers: re-inserting it boots afresh, entities and all.
        handle.container.appendChild(appElement);
        await readyWithin(appElement);
        await settle(handle.container);

        appElement.app!.autoRender = false;
        const entities = handle.all<EntityElement>('pc-entity');
        expect(entities).toHaveLength(2);
        expect(entities.every(entity => entity.entity !== null)).toBe(true);
        expect(uncaught.seen).toEqual([]);
    });

    it('abandons boot when a progress listener removes pc-app', async () => {
        // Boot dispatches a progress event synchronously between building the hierarchy and
        // asking the application to preload. A listener that removes the element there must not
        // leave boot to preload and start an application that disconnect has already destroyed.
        const handle = mount('<pc-app backend="null"><pc-entity name="e"></pc-entity></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        appElement.addEventListener('progress', () => appElement.remove(), { once: true });

        await expectNeverReady(appElement);

        expect(appElement.app, 'the application is destroyed').toBeNull();
        expect(appElement._hierarchyReady).toBe(false);
        expect(appElement.loadProgress, 'preload never ran against the destroyed application').toBe(0);
        expect(uncaught.seen).toEqual([]);
    });

    it('resets _hierarchyReady and re-arms readiness when pc-app is removed', async () => {
        // Descendants branch on both of these: a stale _hierarchyReady sends a re-inserted
        // pc-entity down the runtime-insertion path against a null app, and a stale-resolved
        // ready promise resumes awaiting descendants against the same.
        const { appElement, unmount } = await bootApp('<pc-entity name="e"></pc-entity>');

        expect(appElement._hierarchyReady).toBe(true);

        unmount();
        await settleTask();

        expect(appElement.app, 'the application is destroyed').toBeNull();
        expect(appElement._hierarchyReady, 'the hierarchy is no longer claimed live').toBe(false);

        // The ready promise is pending again, so a descendant awaiting it parks until the
        // element is next inserted and booted, rather than resuming against the null app above.
        await expectNeverReady(appElement);
    });

    it('re-boots a removed pc-app when it is re-added within the same task', async () => {
        const handle = await bootApp(`
            ${MODEL_ASSET_TAG}
            <pc-scene fog="linear" exposure="0.5"></pc-scene>
            <pc-entity name="e">
                <pc-camera></pc-camera>
                <pc-sound><pc-sound-slot name="blip"></pc-sound-slot></pc-sound>
            </pc-entity>
            <pc-model asset="reboot-m"></pc-model>
        `);
        const { appElement, app: firstApp, container, get } = handle;

        // Count readiness announcements for the re-add alone. Descendants' ready events bubble
        // through the app element, so the count is filtered to its own.
        let appReadyEvents = 0;
        appElement.addEventListener('ready', (event) => {
            if (event.target === appElement) appReadyEvents += 1;
        });

        appElement.remove();
        container.appendChild(appElement);

        await readyWithin(appElement);
        await settle(container);

        const app = appElement.app;
        expect(app, 'a fresh application was booted').toBeTruthy();
        expect(app, 'and it is not the destroyed one').not.toBe(firstApp);
        app!.autoRender = false;

        expect(appElement._hierarchyReady).toBe(true);
        expect(appElement.querySelectorAll('canvas'), 'exactly one canvas').toHaveLength(1);
        expect(appReadyEvents, 'readiness was announced again').toBe(1);

        // The entity hierarchy was rebuilt into the new application...
        const entityElement = get<EntityElement>('pc-entity');
        expect(entityElement.entity, 'the entity was recreated').toBeTruthy();
        expect(entityElement.entity!.parent, 'and parented under the new root').toBe(app!.root);

        // ...components were re-added to the recreated entity...
        const cameraElement = get<CameraComponentElement>('pc-camera');
        expect(cameraElement.component, 'the camera component is back').toBeTruthy();
        expect(cameraElement.component!.entity).toBe(entityElement.entity);

        const soundsComponent = (get('pc-sound') as { component?: { slots: Record<string, unknown> } }).component!;
        expect(Object.keys(soundsComponent.slots), 'the sound slot is back').toContain('blip');

        // ...the model's host was recreated in the new application, re-registered, and its
        // content re-instantiated beneath it...
        const modelElement = get('pc-model');
        expect(modelElement.entity, 'the model host is back').toBeTruthy();
        expect(modelElement.entity!.parent).toBe(app!.root);
        expect(appElement.elementFromEntity(modelElement.entity!), 'and re-registered').toBe(modelElement);
        expect(modelElement.contentEntity!.parent, 'with re-instantiated content').toBe(modelElement.entity);

        // ...and the scene element announced the new scene, with its settings re-applied.
        const sceneElement = get<SceneElement>('pc-scene');
        expect(sceneElement.scene).toBe(app!.scene);
        expect(app!.scene.fog.type).toBe('linear');
        expect(app!.scene.exposure).toBe(0.5);

        expect(uncaught.seen).toEqual([]);
    });

    it('boots exactly once when pc-app is removed and re-added while still booting', async () => {
        // The removal and re-insertion land while the first connectedCallback is still parked at
        // an await, so a second connectedCallback starts before the first has resumed. The first
        // must abandon itself when it does - two surviving boots would each append a canvas and
        // start an application, with the loser's left running unowned.
        const handle = mount(`
            <pc-app backend="null">
                <pc-entity name="e"><pc-camera></pc-camera></pc-entity>
            </pc-app>
        `);
        const appElement = handle.get<AppElement>('pc-app');

        appElement.remove();
        handle.container.appendChild(appElement);

        await readyWithin(appElement);
        await settle(handle.container);

        expect(appElement.app).toBeTruthy();
        appElement.app!.autoRender = false;

        expect(appElement.querySelectorAll('canvas'), 'the abandoned boot left no canvas').toHaveLength(1);

        // The stale connectedCallbacks of the first connection must not have added components
        // alongside the live ones - a doubled addComponent nulls the element's reference.
        const entityElement = handle.get<EntityElement>('pc-entity');
        const cameraElement = handle.get<CameraComponentElement>('pc-camera');
        expect(entityElement.entity).toBeTruthy();
        expect(cameraElement.component).toBeTruthy();
        expect(cameraElement.component!.entity).toBe(entityElement.entity);

        expect(uncaught.seen).toEqual([]);
    });
});
