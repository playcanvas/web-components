import { Vec3, WasmModule } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { AssetElement } from '../../src/asset';
import type { JointComponentElement } from '../../src/components/joint-component';
import type { EntityElement } from '../../src/entity';
import type { MaterialElement } from '../../src/material';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
import type { WasmElement } from '../../src/wasm';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * A `<template>` whose content is a nested `<pc-entity>` subtree, in the shape the scroll view
 * example clones per list entry: an outer entity carrying a component of its own, plus child
 * entities that carry theirs.
 */
const ENTRY_TEMPLATE = `
    <template id="entry">
        <pc-entity name="Entry" position="1 2 3">
            <pc-render type="box"></pc-render>
            <pc-entity name="Label" position="0 1 0">
                <pc-render type="sphere"></pc-render>
            </pc-entity>
            <pc-entity name="Button"></pc-entity>
        </pc-entity>
    </template>
`;

/**
 * A prefab wired by bare entity names — the shape scoped resolution exists for. The joint sits
 * before the entities it references, so each clone also pins forward references within itself,
 * and the single root `<pc-entity>` is the documented requirement for a self-contained prefab:
 * it is the enclosing scope the names resolve through.
 */
const CHAIN_TEMPLATE = `
    <template id="chain">
        <pc-entity name="Link">
            <pc-entity name="Frame">
                <pc-joint entity-a="Anchor" entity-b="Bob"></pc-joint>
            </pc-entity>
            <pc-entity name="Anchor"><pc-rigid-body></pc-rigid-body></pc-entity>
            <pc-entity name="Bob"><pc-rigid-body type="dynamic"></pc-rigid-body></pc-entity>
        </pc-entity>
    </template>
`;

/** A meshless glTF with a single named node, for the `<pc-node>` case. */
const STAGE_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ name: 'Stage', nodes: [0] }],
        nodes: [{ name: 'Podium' }]
    })
)}`;

/**
 * A whole `<pc-app>` inside a `<template>`, carrying one of every child the boot sweeps reach for:
 * a module it must wait on, an asset and a material it creates directly, and a nested entity
 * hierarchy with a component at the bottom.
 *
 * The asset is `lazy` so nothing is fetched - the point is that the element's asset gets created at
 * all, not that it loads.
 */
const APP_TEMPLATE = `
    <template id="app">
        <pc-app backend="null">
            <pc-wasm name="Ammo" glue="ammo.wasm.js" wasm="ammo.wasm.wasm" fallback="ammo.js"></pc-wasm>
            <pc-asset id="cloned-texture" type="texture" src="texture.png" lazy></pc-asset>
            <pc-material id="cloned-material" diffuse="1 0 0"></pc-material>
            <pc-entity name="Root" position="1 2 3">
                <pc-entity name="Child" position="0 1 0">
                    <pc-render type="box"></pc-render>
                </pc-entity>
            </pc-entity>
        </pc-app>
    </template>
`;

/**
 * Stubs the engine's wasm loader, holding the instance callback until `release()` so a test can
 * observe the window in which `<pc-app>` is gated on the module. No real network or script
 * execution can happen in jsdom; the element's contract is what these tests pin.
 */
const stubWasmModule = () => {
    let pending: (() => void) | null = null;
    const setConfig = vi.spyOn(WasmModule, 'setConfig').mockImplementation(() => undefined);
    const getInstance = vi.spyOn(WasmModule, 'getInstance').mockImplementation((_name, callback) => {
        pending = () => callback({});
    });
    return { setConfig, getInstance, release: () => pending?.() };
};

/**
 * Insertion of a subtree cloned from a `<template>`.
 *
 * This is the documented way to build repeated content at runtime, and it is the one insertion
 * path whose elements are NOT custom elements when they arrive. Template content lives in an
 * inert document with no browsing context, so nothing in it is ever upgraded; the clone's
 * elements upgrade only once appended, in tree order - which means an outer element's
 * connectedCallback runs while every descendant is still a plain HTMLElement. Any sweep that
 * reaches down into the subtree from there must tolerate that.
 */
describe('a <template>-cloned subtree', () => {
    const { uncaught } = useGuard();

    it('builds a cloned <pc-entity> subtree appended to a running app', async () => {
        const { get, app, appElement, container } = await bootApp(
            `<pc-entity name="Content"></pc-entity>${ENTRY_TEMPLATE}`
        );
        const content = get<EntityElement>('pc-entity[name="Content"]');
        const template = get<HTMLTemplateElement>('template');

        content.appendChild(template.content.cloneNode(true));

        // Entities are built synchronously: every reaction the insertion queued - the upgrade of
        // each cloned element and the connectedCallback it runs - has completed by the time
        // appendChild returns. (Components are not; they await their host's readiness.)
        const entry = content.querySelector<EntityElement>(':scope > pc-entity')!;
        expect(entry.entity, 'the cloned root was created').toBeTruthy();
        expect(entry.entity!.parent, 'and parented under the entity it was appended to').toBe(content.entity);

        // The attributes were parsed before the entity was created: upgrading an element replays
        // attributeChangedCallback for every attribute already on it, ahead of connectedCallback.
        expect(entry.entity!.getLocalPosition().equals(new Vec3(1, 2, 3)), 'position="1 2 3" applied').toBe(true);

        // The descendants that were still plain HTMLElements during the outer connectedCallback
        expect(entry.entity!.children.map((child) => child.name)).toEqual(['Label', 'Button']);

        const label = content.querySelector<EntityElement>('pc-entity[name="Label"]')!;
        expect(label.entity, 'a nested cloned entity was created').toBeTruthy();
        expect(label.entity!.parent, 'and parented under the cloned root').toBe(entry.entity);
        expect(label.entity!.getLocalPosition().equals(new Vec3(0, 1, 0))).toBe(true);

        // The entities are registered with the application, not merely created - the picker's
        // reverse lookup joins scene nodes back to elements through that registration.
        expect(app.root.findByName('Label'), 'the entity is in the scene').toBe(label.entity);
        expect(appElement.elementFromEntity(label.entity!), 'and joined back to its element').toBe(label);

        // Components attach once their host entity is ready, which is a microtask later
        await settle(container);
        expect(entry.entity!.render, "the outer entity's component was added").toBeTruthy();
        expect(label.entity!.render, "a nested entity's component was added too").toBeTruthy();

        expect(uncaught.seen).toEqual([]);
    });

    it('resolves entity references inside a cloned subtree to that clone, not an earlier one', async () => {
        const { get, container } = await bootApp(`<pc-entity name="Content"></pc-entity>${CHAIN_TEMPLATE}`);
        const content = get<EntityElement>('pc-entity[name="Content"]');
        const template = get<HTMLTemplateElement>('template');

        content.appendChild(template.content.cloneNode(true));
        content.appendChild(template.content.cloneNode(true));
        await settle(container);

        // Every clone's joint binds that clone's own bodies. The guard fails this test if any
        // reference warned on the way.
        const links = Array.from(content.querySelectorAll<EntityElement>(':scope > pc-entity'));
        expect(links).toHaveLength(2);
        for (const link of links) {
            const joint = link.querySelector<JointComponentElement>('pc-joint')!;
            expect(joint.component!.entityA).toBe(link.querySelector<EntityElement>('pc-entity[name="Anchor"]')!.entity);
            expect(joint.component!.entityB).toBe(link.querySelector<EntityElement>('pc-entity[name="Bob"]')!.entity);
        }

        // The decisive half: the second clone did not bind the first clone's entities, which is
        // what a document-wide lookup produces - it finds the first instance in document order.
        const [first, second] = links;
        expect(second.querySelector<JointComponentElement>('pc-joint')!.component!.entityA).not.toBe(
            first.querySelector<EntityElement>('pc-entity[name="Anchor"]')!.entity
        );

        expect(uncaught.seen).toEqual([]);
    });

    it('builds a cloned <pc-node> subtree appended to an instantiated <pc-model>', async () => {
        const { get } = await bootApp(`
            <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
            <pc-model asset="stage"></pc-model>
            <template id="attachment">
                <pc-node name="Podium">
                    <pc-entity name="Marker" position="0 1 0"></pc-entity>
                </pc-node>
            </template>
        `);
        const model = get('pc-model');
        const template = get<HTMLTemplateElement>('template');

        // The host is already instantiated, so the cloned pc-node binds from inside its own
        // connectedCallback - the one moment its children have not upgraded yet.
        model.appendChild(template.content.cloneNode(true));

        const node = model.querySelector<NodeElement>(':scope > pc-node')!;
        expect(node.state, 'the cloned node bound').toBe('bound');

        const marker = node.querySelector<EntityElement>('pc-entity')!;
        expect(marker.entity, 'the attachment entity was created').toBeTruthy();
        expect(marker.entity!.parent, 'and parented under the bound node').toBe(node.entity);
        expect(marker.entity!.getLocalPosition().equals(new Vec3(0, 1, 0))).toBe(true);

        expect(uncaught.seen).toEqual([]);
    });

    it('builds a cloned <pc-model> appended to a running app', async () => {
        const { get, container } = await bootApp(`
            <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
            <pc-entity name="Content"></pc-entity>
            <template id="prop">
                <pc-model asset="stage" position="1 2 3"></pc-model>
            </template>
        `);
        const content = get<EntityElement>('pc-entity[name="Content"]');
        const template = get<HTMLTemplateElement>('template');

        content.appendChild(template.content.cloneNode(true));

        // The host is built synchronously on upgrade, like a cloned pc-entity; the content
        // instantiates asynchronously behind the element's readiness.
        const model = content.querySelector<ModelElement>(':scope > pc-model')!;
        expect(model.entity, 'the cloned host was created').toBeTruthy();
        expect(model.entity!.parent, 'and parented under the entity it was appended to').toBe(content.entity);
        expect(model.entity!.getLocalPosition().equals(new Vec3(1, 2, 3)), 'position="1 2 3" applied').toBe(true);

        await settle(container);
        expect(model.contentEntity, 'the content was instantiated').toBeTruthy();
        expect(model.contentEntity!.parent, 'beneath the host').toBe(model.entity);

        expect(uncaught.seen).toEqual([]);
    });

    it('boots a cloned <pc-app> whose children are all still unupgraded when it connects', async () => {
        const { setConfig, getInstance, release } = stubWasmModule();
        const handle = mount(APP_TEMPLATE);
        const template = handle.get<HTMLTemplateElement>('template');

        handle.container.appendChild(template.content.cloneNode(true));
        release();

        const appElement = handle.get<AppElement>('pc-app');
        await readyWithin(appElement);
        const app = appElement.app!;
        app.autoRender = false;
        await settle(handle.container);

        // The module was loaded, not skipped. Skipping an unupgraded <pc-wasm> - the guard that
        // suits a <pc-entity>, which later builds itself - would silently drop the wasm module an
        // app asked for, since nothing else ever loads it.
        expect(setConfig).toHaveBeenCalledWith('Ammo', {
            glueUrl: 'ammo.wasm.js',
            wasmUrl: 'ammo.wasm.wasm',
            fallbackUrl: 'ammo.js'
        });
        expect(getInstance, 'the module was requested exactly once').toHaveBeenCalledTimes(1);
        await readyWithin(handle.get<WasmElement>('pc-wasm'));

        // The application booted at all: the failure this pins left <pc-app> permanently unready,
        // with no canvas and no entities.
        expect(app.graphicsDevice.isNull, 'expected the null graphics device').toBe(true);
        expect(appElement.querySelector('canvas'), 'the canvas was created').toBeTruthy();

        // The ':scope > pc-asset' and ':scope > pc-material' sweeps run after two awaits, by which
        // point the clone has upgraded either way - asserted rather than assumed.
        expect(handle.get<AssetElement>('pc-asset').asset, 'the asset was created').toBeTruthy();
        expect(handle.get<MaterialElement>('pc-material').material, 'the material was created').toBeTruthy();

        // The entity sweep, and the attribute values it seeds entities from. Upgrading an element
        // replays attributeChangedCallback for every attribute already on it, ahead of
        // connectedCallback, so the cached fields are populated before any entity is created.
        const root = handle.get<EntityElement>('pc-entity[name="Root"]');
        const child = handle.get<EntityElement>('pc-entity[name="Child"]');
        expect(root.entity!.parent, 'the outer entity is parented to the app root').toBe(app.root);
        expect(child.entity!.parent, 'and the nested one under it').toBe(root.entity);
        expect(root.entity!.getLocalPosition().equals(new Vec3(1, 2, 3)), 'position="1 2 3" applied').toBe(true);
        expect(child.entity!.getLocalPosition().equals(new Vec3(0, 1, 0))).toBe(true);
        expect(child.entity!.render, "the nested entity's component was added").toBeTruthy();

        expect(uncaught.seen).toEqual([]);
    });

    it('gates a cloned <pc-app> on its cloned <pc-wasm>, rather than racing it', async () => {
        const { getInstance, release } = stubWasmModule();
        const handle = mount(APP_TEMPLATE);
        const template = handle.get<HTMLTemplateElement>('template');

        handle.container.appendChild(template.content.cloneNode(true));

        // The load was started from the element while it was still unupgraded, synchronously -
        // WasmModule.getInstance is called from the promise executor inside _loadModule.
        expect(getInstance, 'the module load started during the insertion').toHaveBeenCalledTimes(1);

        // Nothing must proceed until the module reports in: an app that booted here would create
        // its graphics device before the wasm module backing it was configured.
        const appElement = handle.get<AppElement>('pc-app');
        await expectNeverReady(appElement);
        expect(appElement.app, 'no application while the module is outstanding').toBeNull();
        expect(uncaught.seen, 'and no rejection from reaching into an unupgraded element').toEqual([]);

        // The entity elements have upgraded and their connectedCallbacks have already run, yet no
        // entity exists: they saw _hierarchyReady false and deferred to the boot sweep, exactly as
        // they do on the parser's path. `null` is what distinguishes the two - an element that had
        // not upgraded would have no `entity` accessor at all, and read back `undefined`.
        expect(handle.get<EntityElement>('pc-entity[name="Root"]').entity, 'upgraded but deferred').toBeNull();
        expect(handle.get<EntityElement>('pc-entity[name="Child"]').entity, 'upgraded but deferred').toBeNull();

        release();
        await readyWithin(appElement);
        appElement.app!.autoRender = false;
        await settle(handle.container);

        expect(uncaught.seen).toEqual([]);
    });

    it('abandons the boot of a cloned <pc-app> detached straight after insertion', async () => {
        const { getInstance, release } = stubWasmModule();
        const handle = mount(APP_TEMPLATE);
        const template = handle.get<HTMLTemplateElement>('template');

        handle.container.appendChild(template.content.cloneNode(true));
        const appElement = handle.get<AppElement>('pc-app');

        // Upgrading the subtree has already run every descendant's connectedCallback by this point,
        // so the removal lands on a boot that has done strictly more than the parser's path would
        // have. Releasing the module then drives it to the generation check after the module await,
        // which is what has to stop it - a boot that continued would start an rAF ticker on an
        // element nothing can clean up.
        appElement.remove();
        expect(getInstance, 'the module load had already started').toHaveBeenCalledTimes(1);
        release();

        await expectNeverReady(appElement);
        expect(appElement.app, 'no application was created').toBeNull();
        expect(appElement.querySelector('canvas'), 'no canvas was created').toBeNull();
        expect(appElement.querySelector<EntityElement>('pc-entity[name="Root"]')!.entity, 'no entities').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });
});
