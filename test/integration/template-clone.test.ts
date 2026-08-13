import { Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import type { NodeElement } from '../../src/node';
import { bootApp, settle } from '../helpers/app';
import { useGuard } from '../helpers/guard';

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
});
