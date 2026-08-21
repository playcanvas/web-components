import { describe, expect, it } from 'vitest';

import type { CameraComponentElement } from '../../src/components/camera-component';
import type { EntityElement } from '../../src/entity';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
import { bootApp } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * A meshless glTF with the hierarchy the RFC's examples use. The two authored `Wheel` siblings
 * do NOT survive parsing as duplicates: the engine's glb parser renames identically named
 * SIBLINGS while building the hierarchy (`uniqueNames` in its node loop), so this instantiates
 * as:
 *
 *     Chassis
 *     ├── Wheel
 *     ├── Wheel1   <- renamed by the engine
 *     ├── Head
 *     └── Spoiler
 *
 * Duplicate names under DIFFERENT parents survive (the rename is per-parent) - AXLES_SRC below
 * covers that case, which is where ambiguity and `index` actually operate.
 */
const CAR_SRC = `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
        { name: 'Chassis', children: [1, 2, 3, 4] },
        { name: 'Wheel' },
        { name: 'Wheel' },
        { name: 'Head' },
        { name: 'Spoiler' }
    ]
}))}`;

/** Two identically named wheels in different assemblies, for the subtree-scoping tests. */
const AXLES_SRC = `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
        { name: 'Root', children: [1, 3] },
        { name: 'FrontAxle', children: [2] },
        { name: 'Wheel' },
        { name: 'RearAxle', children: [4] },
        { name: 'Wheel' }
    ]
}))}`;

const CAR_ASSET = `<pc-asset id="car" type="container" src="${CAR_SRC}"></pc-asset>`;
const AXLES_ASSET = `<pc-asset id="axles" type="container" src="${AXLES_SRC}"></pc-asset>`;

describe('<pc-node>', () => {
    const { uncaught, warnings } = useGuard();

    /** Boots an app with the car model and the given pc-model children. */
    const bootCar = async (modelChildren: string) => {
        const booted = await bootApp(`${CAR_ASSET}<pc-model asset="car">${modelChildren}</pc-model>`);
        return { ...booted, model: booted.get<ModelElement>('pc-model') };
    };

    /** Creates a pc-node with the given attributes and appends it to `parent`. */
    const insertNode = (parent: Element, attributes: Record<string, string>) => {
        const node = document.createElement('pc-node');
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        parent.appendChild(node);
        return node;
    };

    describe('binding', () => {
        it('defers a nested entity subtree entirely until the binding resolves', async () => {
            // Every level below an unresolved node must stay out of the scene graph - including
            // descendants of an owner that itself deferred, which must neither parent beneath the
            // owner's floating entity nor announce readiness from outside the graph.
            const { model } = await bootCar('');

            const node = document.createElement('pc-node');
            node.setAttribute('name', 'Nowhere');
            const outer = document.createElement('pc-entity');
            outer.setAttribute('name', 'outer');
            const inner = document.createElement('pc-entity');
            inner.setAttribute('name', 'inner');
            outer.appendChild(inner);
            node.appendChild(outer);
            model.appendChild(node);

            warnings.expect("pc-node 'Nowhere' not found in model 'car'");
            expect(node.state).toBe('missing');
            expect(outer.entity!.parent, 'the deferred owner is unparented').toBeNull();
            expect(inner.entity?.parent ?? null, 'and so is everything beneath it').toBeNull();
            await expectNeverReady(inner);

            node.setAttribute('name', 'Head');

            expect(node.state).toBe('bound');
            expect(outer.entity!.parent, 'the bind parents the whole chain').toBe(node.entity);
            expect(inner.entity!.parent).toBe(outer.entity);
            await readyWithin(inner);
            expect(uncaught.seen).toEqual([]);
        });

        it('binds a uniquely named node and registers it as a pick target', async () => {
            const { appElement, get } = await bootCar('<pc-node name="Head"></pc-node>');
            const node = get<NodeElement>('pc-node');

            expect(node.state).toBe('bound');
            expect(node.entity, 'the bound entity is the authored node').not.toBeNull();
            expect(node.entity!.name).toBe('Head');
            expect(node.path).toBe('Head');
            expect(appElement.elementFromEntity(node.entity!), 'the identity map points back here').toBe(node);
            expect(uncaught.seen).toEqual([]);
        });

        it('binds immediately when inserted after the model has loaded', async () => {
            const { model } = await bootCar('');

            const node = insertNode(model, { name: 'Head' });

            expect(node.state, 'no waiting - the hierarchy already exists').toBe('bound');
            expect(node.entity!.name).toBe('Head');
        });

        it('applies component children to the bound node', async () => {
            const { get } = await bootCar('<pc-node name="Head"><pc-camera></pc-camera></pc-node>');
            const node = get<NodeElement>('pc-node');

            expect(node.entity!.camera, 'the camera component landed on the glTF node').toBeDefined();
        });

        it('parents nested pc-entity content under the bound node', async () => {
            const { get } = await bootCar('<pc-node name="Head"><pc-entity name="hat"></pc-entity></pc-node>');
            const node = get<NodeElement>('pc-node');
            const hat = get<EntityElement>('pc-entity[name="hat"]');

            await readyWithin(hat);
            expect(hat.entity!.parent, 'the attachment point anchors to the bound node').toBe(node.entity);
        });

        it('resolves a nested pc-node within the enclosing subtree', async () => {
            // 'Wheel' appears once per axle: globally ambiguous, unique within RearAxle. Subtree
            // scoping must bind the rear wheel without an ambiguity warning.
            const { get } = await bootApp(
                `${AXLES_ASSET}<pc-model asset="axles">
                    <pc-node name="RearAxle"><pc-node name="Wheel"></pc-node></pc-node>
                </pc-model>`
            );
            const wheel = get<NodeElement>('pc-node[name="Wheel"]');

            expect(wheel.state).toBe('bound');
            expect(wheel.entity!.parent!.name, 'the rear wheel, not the front one').toBe('RearAxle');
        });
    });

    describe('resolution failures', () => {
        it('warns with a near-miss suggestion and stays pending on a miss', async () => {
            const { model } = await bootCar('');

            const node = insertNode(model, { name: 'Weel' });

            warnings.expect("pc-node 'Weel' not found in model 'car' - closest match: 'Wheel'");
            expect(node.state).toBe('missing');
            await expectNeverReady(node);
        });

        it('binds a sibling duplicate through the name the engine parser gave it', async () => {
            // The parser renames identically named siblings (Wheel, Wheel1, ...), so sibling
            // duplicates are addressed by their renamed names rather than by index. This pins
            // that behavior: if the engine ever stops renaming, ambiguity semantics take over
            // and this test will say so.
            const { model } = await bootCar('');

            const renamed = insertNode(model, { name: 'Wheel1' });
            const original = insertNode(model, { name: 'Wheel' });

            expect(renamed.state).toBe('bound');
            expect(original.state).toBe('bound');
            expect(renamed.entity, 'two siblings, two entities').not.toBe(original.entity);
        });

        it('warns listing candidate paths and binds nothing when the name is ambiguous', async () => {
            // Cross-parent duplicates survive parsing (the rename is per-parent), so a wheel per
            // axle is genuinely ambiguous from the model root
            const { get } = await bootApp(`${AXLES_ASSET}<pc-model asset="axles"></pc-model>`);
            const model = get<ModelElement>('pc-model');

            const node = insertNode(model, { name: 'Wheel' });

            warnings.expect(
                "pc-node 'Wheel' is ambiguous in model 'axles' - specify index: [0] FrontAxle/Wheel, [1] RearAxle/Wheel"
            );
            expect(node.state).toBe('ambiguous');
            expect(node.entity, 'ambiguity never binds a fallback').toBeNull();
            await expectNeverReady(node);
        });

        it('selects among duplicate matches with index', async () => {
            const { all } = await bootApp(
                `${AXLES_ASSET}<pc-model asset="axles">
                    <pc-node name="Wheel" index="0"></pc-node>
                    <pc-node name="Wheel" index="1"></pc-node>
                </pc-model>`
            );
            const [front, rear] = all<NodeElement>('pc-node');

            expect(front.state).toBe('bound');
            expect(rear.state).toBe('bound');
            expect(front.entity!.parent!.name, 'index 0 is the first match in depth-first order').toBe('FrontAxle');
            expect(rear.entity!.parent!.name, 'index 1 is the second').toBe('RearAxle');
        });

        it('warns and stays pending when index is out of range', async () => {
            const { get } = await bootApp(`${AXLES_ASSET}<pc-model asset="axles"></pc-model>`);
            const model = get<ModelElement>('pc-model');

            const node = insertNode(model, { name: 'Wheel', index: '5' });

            warnings.expect("pc-node 'Wheel' index 5 is out of range - 2 match(es) in model 'axles'");
            expect(node.state).toBe('missing');
            await expectNeverReady(node);
        });

        it('treats an invalid index as absent, with a warning', async () => {
            const { model } = await bootCar('');

            const node = insertNode(model, { name: 'Head', index: '1.5' });

            warnings.expect("pc-node index '1.5' is not a non-negative integer - treated as absent");
            expect(node.state, 'the unique name still binds without the index').toBe('bound');
        });

        it('warns and stays inert when a second element resolves to an already-bound node', async () => {
            const { model, get } = await bootCar('<pc-node name="Head"></pc-node>');
            const first = get<NodeElement>('pc-node');

            const second = insertNode(model, { name: 'Head' });

            warnings.expect("pc-node 'Head' resolves to a node already bound by another element - element ignored");
            expect(second.state).toBe('duplicate');
            expect(first.state, 'the first binding is untouched').toBe('bound');
            await expectNeverReady(second);
        });

        it('warns and never becomes ready outside pc-model', async () => {
            const handle = mount('<pc-node name="Head"></pc-node>');
            const node = handle.get<NodeElement>('pc-node');

            warnings.expect("pc-node 'Head' must be a descendant of pc-model - node not bound");
            await expectNeverReady(node);
        });

        it('stays silently pending while no name is assigned', async () => {
            const { model } = await bootCar('');

            const node = insertNode(model, {});

            expect(node.state).toBe('pending');
            await expectNeverReady(node);
        });
    });

    describe('overrides', () => {
        it('applies attribute overrides and restores authored values on removal', async () => {
            const { get } = await bootCar('<pc-node name="Head" enabled="false" position="1 2 3"></pc-node>');
            const node = get<NodeElement>('pc-node');
            const entity = node.entity!;

            expect(entity.enabled, 'the enabled override applied').toBe(false);
            expect(entity.getLocalPosition().x, 'the position override applied').toBe(1);

            node.removeAttribute('enabled');
            expect(entity.enabled, 'removal restores the authored state').toBe(true);

            node.removeAttribute('position');
            expect(entity.getLocalPosition().x, 'removal restores the authored position').toBe(0);
        });

        it('clears a property override with null-assignment', async () => {
            const { get } = await bootCar('<pc-node name="Head"></pc-node>');
            const node = get<NodeElement>('pc-node');

            node.enabled = false;
            expect(node.entity!.enabled).toBe(false);

            node.enabled = null;
            expect(node.entity!.enabled, 'null restores the authored state').toBe(true);
            expect(node.enabled, 'the getter reports no override').toBeNull();
        });

        it('leaves authored values untouched while no override is set', async () => {
            const { get } = await bootCar('<pc-node name="Head"></pc-node>');
            const node = get<NodeElement>('pc-node');

            // The element's own defaults must never write: an absent attribute means authored
            expect(node.entity!.enabled).toBe(true);
            expect(node.enabled).toBeNull();
            expect(node.position).toBeNull();
        });
    });

    describe('retargeting', () => {
        it('moves overrides, components and attachments when name changes', async () => {
            const { get } = await bootCar(
                `<pc-node name="Head" enabled="false">
                    <pc-camera></pc-camera>
                    <pc-entity name="hat"></pc-entity>
                </pc-node>`
            );
            const node = get<NodeElement>('pc-node');
            const head = node.entity!;

            node.setAttribute('name', 'Spoiler');

            expect(node.state).toBe('bound');
            expect(node.entity!.name).toBe('Spoiler');
            expect(head.enabled, 'the override reverted on the old node').toBe(true);
            expect(head.camera, 'the component left the old node').toBeUndefined();
            expect(node.entity!.enabled, 'the override re-applied on the new node').toBe(false);
            expect(node.entity!.camera, 'the component moved to the new node').toBeDefined();

            const hat = get<EntityElement>('pc-entity[name="hat"]');
            expect(hat.entity!.parent, 'the attachment point followed').toBe(node.entity);
            expect(uncaught.seen).toEqual([]);
        });

        it('removes component decorations when the binding dissolves without a rebind', async () => {
            const { get } = await bootCar('<pc-node name="Head"><pc-camera></pc-camera></pc-node>');
            const node = get<NodeElement>('pc-node');
            const head = node.entity!;
            expect(head.camera).toBeDefined();

            node.setAttribute('name', 'Nonexistent');

            warnings.expect("pc-node 'Nonexistent' not found in model 'car'");
            expect(node.state).toBe('missing');
            expect(head.camera, 'the decoration left the abandoned node').toBeUndefined();

            // Recovery: resolving again re-applies the decoration through the ready cycle
            node.setAttribute('name', 'Head');
            expect(node.state).toBe('bound');
            expect(node.entity!.camera, 'the component re-applied on rebind').toBeDefined();
            expect(uncaught.seen).toEqual([]);
        });

        it("leaves a still-bound nested pc-node's decorations alone when the ancestor unbinds", async () => {
            const { get } = await bootApp(
                `${AXLES_ASSET}<pc-model asset="axles">
                    <pc-node name="RearAxle">
                        <pc-node name="Wheel">
                            <pc-camera></pc-camera>
                            <pc-entity name="hub"></pc-entity>
                        </pc-node>
                    </pc-node>
                </pc-model>`
            );
            const axle = get<NodeElement>('pc-node[name="RearAxle"]');
            const wheel = get<NodeElement>('pc-node[name="Wheel"]');
            const wheelEntity = wheel.entity!;
            const hub = get<EntityElement>('pc-entity[name="hub"]');
            expect(wheelEntity.camera).toBeDefined();

            axle.setAttribute('name', 'Nope');

            warnings.expect("pc-node 'Nope' not found in model 'axles'");
            expect(axle.state).toBe('missing');
            expect(wheel.state, 'the nested binding itself is untouched').toBe('bound');
            expect(wheelEntity.camera, "the nested binding's component survives").toBeDefined();
            expect(hub.entity?.parent, "the nested binding's attachment survives").toBe(wheelEntity);
            expect(uncaught.seen).toEqual([]);
        });

        it('retains the binding when re-resolution yields the same node', async () => {
            const { get } = await bootCar('<pc-node name="Head" enabled="false"></pc-node>');
            const node = get<NodeElement>('pc-node');
            const entity = node.entity!;
            const readyBefore = node.ready();

            node.setAttribute('index', '0');

            expect(node.entity, 'same entity, binding retained').toBe(entity);
            expect(node.entity!.enabled, 'the override never flickered through a revert').toBe(false);
            await expect(readyBefore, 'readiness never cycled').resolves.toBe(node);
        });
    });

    describe('reload', () => {
        it('rebinds and re-applies the whole decoration tree when the model reloads', async () => {
            const { model, get } = await bootCar(
                `<pc-node name="Head" enabled="false">
                    <pc-camera></pc-camera>
                    <pc-entity name="hat"></pc-entity>
                </pc-node>`
            );
            const node = get<NodeElement>('pc-node');
            const first = node.entity!;

            // Re-setting the same asset id runs the full reload cycle
            model.setAttribute('asset', 'car');
            expect(node.entity, 'the old binding dissolved with the old hierarchy').toBeNull();

            await readyWithin(node);
            const second = node.entity!;

            expect(second, 'a fresh entity from the new hierarchy').not.toBe(first);
            expect(second.name).toBe('Head');
            expect(second.enabled, 'the override re-applied').toBe(false);
            expect(second.camera, 'the component re-applied').toBeDefined();

            const hat = get<EntityElement>('pc-entity[name="hat"]');
            await readyWithin(hat);
            expect(hat.entity!.parent, 'the attachment point re-anchored').toBe(second);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('removal', () => {
        it('reverts overrides and removes decorations, leaving the authored node in place', async () => {
            const { get } = await bootCar(
                '<pc-node name="Head" enabled="false"><pc-camera></pc-camera></pc-node>'
            );
            const node = get<NodeElement>('pc-node');
            const entity = node.entity!;

            node.remove();

            expect(entity.enabled, 'the override reverted').toBe(true);
            expect(entity.camera, 'the component was removed').toBeUndefined();
            expect(entity.parent, 'the authored node itself survives - the model owns it').not.toBeNull();
            expect(node.state).toBe('pending');
            expect(uncaught.seen).toEqual([]);
        });
    });
});

describe('component conflicts', () => {
    const { warnings, uncaught } = useGuard();

    it('warns and becomes ready with a null component when the type already exists', async () => {
        const { all } = await bootApp(
            '<pc-entity name="host"><pc-camera></pc-camera><pc-camera id="second"></pc-camera></pc-entity>'
        );
        const [first, second] = all<CameraComponentElement>('pc-camera');

        await readyWithin(second);
        expect(first.component, 'the first camera applied').not.toBeNull();
        expect(second.component, 'the conflicting camera stayed null').toBeNull();
        warnings.expect("pc-camera 'second' - 'host' already has a 'camera' component - component not added");
        expect(uncaught.seen).toEqual([]);
    });
});
