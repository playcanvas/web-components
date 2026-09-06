import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AnimComponentSystem,
    AnimCurve,
    AnimData,
    AnimTrack,
    Entity,
    EventHandler,
    GraphNode,
    INTERPOLATION_LINEAR,
    Quat,
    Vec3
} from 'playcanvas';

import { readGlb } from './glb-io.mjs';

const { gltf, bin } = await readGlb(
    new URL('../../examples/assets/models/observatory-environment.glb', import.meta.url)
);

// Reconstruct the delivered hierarchy in real Engine graph nodes, including mesh transforms.
const setup = () => {
    const app = { systems: new EventHandler(), _entityIndex: {} };
    app.systems.anim = new AnimComponentSystem(app);
    const nodes = gltf.nodes.map((source) => {
        const node = new GraphNode(source.name);
        node.setLocalPosition(...(source.translation ?? [0, 0, 0]));
        node.setLocalRotation(...(source.rotation ?? [0, 0, 0, 1]));
        node.setLocalScale(...(source.scale ?? [1, 1, 1]));
        assert.equal(source.matrix, undefined, 'export must use decomposed transforms');
        return node;
    });
    gltf.nodes.forEach((source, i) => source.children?.forEach((child) => nodes[i].addChild(nodes[child])));
    const root = new Entity('observatory', app);
    gltf.scenes[gltf.scene].nodes.forEach((index) => root.addChild(nodes[index]));
    const animation = gltf.animations[0];
    assert.equal(gltf.animations.length, 1);
    assert.equal(animation.name, 'Observatory_Loop');
    assert.equal(animation.channels.length, 9);
    const read = (index) => {
        const accessor = gltf.accessors[index];
        const view = gltf.bufferViews[accessor.bufferView];
        const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
        assert.equal(accessor.componentType, 5126);
        const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        const values = Array.from({ length: accessor.count * size }, (_, i) =>
            bin.readFloatLE(offset + Math.floor(i / size) * (view.byteStride ?? size * 4) + (i % size) * 4)
        );
        assert.ok(values.every(Number.isFinite));
        return new AnimData(size, values);
    };
    const inputs = animation.samplers.map((s) => read(s.input));
    const outputs = animation.samplers.map((s) => read(s.output));
    const curves = animation.channels.map(({ sampler, target }) => {
        assert.equal(animation.samplers[sampler].interpolation, 'LINEAR');
        return new AnimCurve(
            [
                {
                    entityPath: nodes[target.node].path.split('/'),
                    component: 'graph',
                    propertyPath: [target.path === 'rotation' ? 'localRotation' : 'localPosition']
                }
            ],
            sampler,
            sampler,
            INTERPOLATION_LINEAR
        );
    });
    const duration = Math.max(...inputs.map((input) => input.data.at(-1)));
    assert.equal(duration, 720);
    root.addComponent('anim', { activate: true });
    root.anim.assignAnimation(animation.name, new AnimTrack(animation.name, duration, inputs, outputs, curves));
    const rotors = [
        ['Armillary Inner Meridian', new Vec3(0, 1, 0), 6],
        ['Armillary Inner Equator', new Vec3(1, 0, 0), 4.5],
        ['Armillary Inner Ecliptic', new Vec3(0, 1, 0), -8],
        ['Armillary Celestial Core', new Vec3(0, 1, 0), 12]
    ].map(([name, axis, speed]) => {
        const node = root.findByName(name);
        return { name, node, axis, speed, rotation: node.getLocalRotation().clone() };
    });
    const motion = {
        rotors,
        setTime(time) {
            root.anim.baseLayer.activeStateCurrentTime = time;
            root.anim.update(0);
        }
    };
    motion.setTime(0);
    return { root, nodes, motion };
};

const snapshot = (motion) =>
    motion.rotors.map(({ node }) => ({
        position: node.getLocalPosition().clone(),
        rotation: node.getLocalRotation().clone()
    }));
const rotationDot = (a, b) => Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);

test('the emissive energy layers animate independently and close the native loop', () => {
    const { root, motion } = setup();
    const core = root.findByName('Armillary Celestial Core');
    const layers = ['Plasma', 'Filaments', 'Prominences', 'Sparks'].map((name) => {
        const node = root.findByName(`Energy Core ${name}`);
        assert.equal(node.parent, core);
        return node;
    });
    const before = layers.map((node) => node.getLocalRotation().clone());
    motion.setTime(2);
    layers.forEach((node, i) => assert.ok(rotationDot(before[i], node.getLocalRotation()) < 0.99));
    motion.setTime(720 - 1 / 120);
    const end = layers.map((node) => node.getLocalRotation().clone());
    motion.setTime(720 + 1 / 120);
    // The fastest layer traverses 0.75 degrees across these two samples.
    layers.forEach((node, i) => assert.ok(rotationDot(end[i], node.getLocalRotation()) > 0.99997));
    const materials = gltf.materials.filter((material) => material.name.startsWith('OBS Plasma'));
    assert.equal(materials.length, 4);
    for (const material of materials) {
        assert.ok(material.extensions.KHR_materials_emissive_strength.emissiveStrength >= 4);
        assert.ok(material.emissiveFactor.some((value) => value > 0));
    }
    assert.ok(materials.find((material) => material.name === 'OBS Plasma heart').emissiveTexture);
});

test('the exported monument moves all four parts without moving the architecture', () => {
    const { root, motion } = setup();
    const staticNodes = root.children.filter((node) => !motion.rotors.some((rotor) => rotor.node === node));
    const staticTransforms = staticNodes.map((node) => Array.from(node.getWorldTransform().data));
    const before = snapshot(motion);
    motion.setTime(5);
    const after = snapshot(motion);
    for (let i = 0; i < 4; i++) {
        assert.ok(rotationDot(before[i].rotation, after[i].rotation) < 0.999, motion.rotors[i].name);
        if (i < 3) assert.deepEqual(after[i].position, before[i].position, 'a ring orbited around the wrong pivot');
        assert.ok(motion.rotors[i].node.children.length > 0, 'a pivot has no exported geometry');
    }
    assert.ok(Math.abs(after[3].position.y - before[3].position.y) <= 0.1);
    assert.notEqual(after[3].position.y, before[3].position.y);
    assert.deepEqual(
        staticNodes.map((node) => Array.from(node.getWorldTransform().data)),
        staticTransforms
    );
});

test('each inner ring inherits its parent and keeps their hinge axes aligned', () => {
    const { motion } = setup();
    const names = [
        'Armillary Inner Meridian',
        'Armillary Inner Equator',
        'Armillary Inner Ecliptic',
        'Armillary Celestial Core'
    ];
    assert.deepEqual(
        motion.rotors.map(({ node }) => node.name),
        names
    );
    for (const time of [0, 7, 21, 60]) {
        motion.setTime(time);
        for (let i = 1; i < motion.rotors.length; i++) {
            const { node, axis } = motion.rotors[i];
            const parent = motion.rotors[i - 1].node;
            assert.equal(node.parent, parent, `${node.name} must inherit ${parent.name}`);
            const parentAxis = parent.getRotation().transformVector(axis);
            const childAxis = node.getRotation().transformVector(axis);
            assert.ok(parentAxis.sub(childAxis).length() < 1e-6, `${node.name} lost its parent's hinge axis`);
            const expectedPosition = parent.getPosition().clone();
            if (i === 3)
                expectedPosition.add(
                    parent
                        .getRotation()
                        .transformVector(new Vec3(0, 0.1 * Math.sin((time * 2 * Math.PI * 74) / 720), 0))
                );
            assert.ok(node.getPosition().clone().sub(expectedPosition).length() < 1e-5);
        }
    }
});

test('native animation holds when paused and restarts the clip on reset', () => {
    const { root, motion } = setup();
    const initial = snapshot(motion);
    motion.setTime(17);
    const moving = snapshot(motion);
    for (let i = 0; i < 120; i++) root.anim.update(0);
    assert.equal(root.anim.baseLayer.activeStateCurrentTime, 17);
    assert.deepEqual(snapshot(motion), moving);
    root.anim.baseLayer.play('Observatory_Loop');
    root.anim.update(0);
    assert.deepEqual(snapshot(motion), initial);
    motion.setTime(17);
    assert.deepEqual(snapshot(motion), moving, 'reset must be repeatable');
});

test('full turns and the 12-minute loop boundary remain continuous', () => {
    const { motion } = setup();
    for (const time of [30, 45, 60, 80, 720, 1440, 3600]) {
        motion.setTime(time - 1 / 120);
        const before = snapshot(motion);
        motion.setTime(time + 1 / 120);
        snapshot(motion).forEach(({ rotation, position }, i) => {
            assert.ok(rotationDot(rotation, before[i].rotation) > 0.99999, 'rotation jumped at a full turn');
            assert.ok(Math.abs(rotation.length() - 1) < 1e-6);
            assert.ok(position.clone().sub(before[i].position).length() < 0.002, 'bob jumped at loop seam');
        });
    }
});

test('baked rotations retain the original parent-axis speeds throughout the clip', () => {
    const { motion } = setup();
    for (const time of [0, 0.4, 7.3, 59.7, 240, 719.9]) {
        motion.setTime(time);
        for (const rotor of motion.rotors) {
            const expected = new Quat().mul2(
                new Quat().setFromAxisAngle(rotor.axis, time * rotor.speed),
                rotor.rotation
            );
            assert.ok(rotationDot(expected, rotor.node.getLocalRotation()) > 0.999999, `${rotor.name} at ${time}`);
        }
    }
});

test('all exported rotating geometry stays above the explorer and inside its own spherical shell', () => {
    const { nodes, motion } = setup();
    const point = new Vec3();
    const shells = motion.rotors.map(({ node: pivot }) => {
        assert.deepEqual(pivot.getPosition(), new Vec3(7, 11.5, -21));
        let min = Infinity;
        let max = 0;
        for (const child of pivot.children) {
            const source = gltf.nodes[nodes.indexOf(child)];
            if (source.mesh === undefined) continue;
            for (const primitive of gltf.meshes[source.mesh].primitives) {
                const accessor = gltf.accessors[primitive.attributes.POSITION];
                const view = gltf.bufferViews[accessor.bufferView];
                assert.equal(accessor.componentType, 5126);
                const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
                for (let i = 0; i < accessor.count; i++) {
                    const offset = start + i * (view.byteStride ?? 12);
                    point.set(bin.readFloatLE(offset), bin.readFloatLE(offset + 4), bin.readFloatLE(offset + 8));
                    child.getWorldTransform().transformPoint(point, point);
                    const radius = point.sub(pivot.getPosition()).length();
                    assert.ok(Number.isFinite(radius));
                    min = Math.min(min, radius);
                    max = Math.max(max, radius);
                }
            }
        }
        // 3.5 m dais + 2 m player capsule, plus clearance throughout every rotation.
        const bob = pivot === motion.rotors[3].node ? 0.1 : 0;
        assert.ok(11.5 - max - bob > 5.5, `${pivot.name} reaches the standing player`);
        return { min, max, name: pivot.name };
    });
    shells.sort((a, b) => a.max - b.max);
    for (let i = 1; i < shells.length; i++) {
        assert.ok(shells[i].min > shells[i - 1].max + 0.1, `${shells[i].name} intersects another rotor`);
    }
});
