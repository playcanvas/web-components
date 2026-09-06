// Validate the delivered asset, not just the authoring script's intended output.
import assert from 'node:assert/strict';
import test from 'node:test';

import { GraphNode } from 'playcanvas';

import { readGlb } from './glb-io.mjs';

const { gltf, bin, fileBytes } = await readGlb(
    new URL('../../examples/assets/models/observatory-character.glb', import.meta.url)
);
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = {
    5121: [1, 'readUInt8'],
    5123: [2, 'readUInt16LE'],
    5125: [4, 'readUInt32LE'],
    5126: [4, 'readFloatLE']
};
const read = (index) => {
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const [bytes, method] = types[accessor.componentType];
    const size = sizes[accessor.type];
    const stride = view.byteStride ?? size * bytes;
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, row) =>
        Array.from({ length: size }, (_, col) => bin[method](offset + row * stride + col * bytes))
    );
};

test('walk closes without a leading hold or a vertical pop and bounds pelvis acceleration', () => {
    const walk = gltf.animations.find((animation) => animation.name === 'Walk');
    const nodes = gltf.nodes.map((source) => {
        const node = new GraphNode(source.name);
        node.setLocalPosition(...(source.translation ?? [0, 0, 0]));
        node.setLocalRotation(...(source.rotation ?? [0, 0, 0, 1]));
        node.setLocalScale(...(source.scale ?? [1, 1, 1]));
        return node;
    });
    gltf.nodes.forEach((node, i) => node.children?.forEach((child) => nodes[i].addChild(nodes[child])));
    const setters = { translation: 'setLocalPosition', rotation: 'setLocalRotation', scale: 'setLocalScale' };
    for (const channel of walk.channels) {
        const sampler = walk.samplers[channel.sampler];
        assert.equal(read(sampler.input)[0][0], 0, 'leading hold makes every loop hesitate');
        nodes[channel.target.node][setters[channel.target.path]](...read(sampler.output)[0]);
    }
    const channel = walk.channels.find(
        (c) => c.target.path === 'translation' && gltf.nodes[c.target.node].name === 'pelvis'
    );
    const sampler = walk.samplers[channel.sampler];
    const times = read(sampler.input).flat(),
        poses = read(sampler.output);
    const pelvis = nodes[channel.target.node];
    const heights = poses.map((position) => {
        pelvis.setLocalPosition(...position);
        return pelvis.getPosition().y;
    });
    assert.ok(Math.abs(heights.at(-1) - heights[0]) < 1e-6, 'vertical loop seam');
    const cycle = heights.slice(0, -1),
        step = times[1] - times[0];
    const acceleration = cycle.map(
        (height, i) =>
            Math.abs(cycle[(i + 1) % cycle.length] - 2 * height + cycle[(i + cycle.length - 1) % cycle.length]) /
            step ** 2
    );
    assert.ok(Math.max(...acceleration) < 8, `sharp grounding correction: ${Math.max(...acceleration)} m/s²`);
    assert.ok(Math.max(...cycle) - Math.min(...cycle) > 0.02, 'retain the natural walking bob');
});

test('all rendered primitives have finite, normalized four-weight skins', () => {
    for (const node of gltf.nodes.filter((node) => node.mesh !== undefined)) {
        assert.notEqual(node.skin, undefined, node.name);
        const skin = gltf.skins[node.skin];
        for (const primitive of gltf.meshes[node.mesh].primitives) {
            assert.equal(primitive.attributes.WEIGHTS_1, undefined);
            const positions = read(primitive.attributes.POSITION);
            const joints = read(primitive.attributes.JOINTS_0);
            const weights = read(primitive.attributes.WEIGHTS_0);
            assert.equal(positions.length, weights.length);
            for (let i = 0; i < positions.length; i++) {
                assert.ok(positions[i].every(Number.isFinite));
                assert.ok(weights[i].every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1));
                assert.ok(Math.abs(weights[i].reduce((a, b) => a + b, 0) - 1) < 0.00001);
                assert.ok(joints[i].every((joint) => joint < skin.joints.length));
            }
        }
    }
});

test('six clips bind to unique exported joints and contain moving limb and mantle channels', () => {
    assert.deepEqual(
        gltf.animations.map((animation) => animation.name).sort(),
        ['Idle', 'Walk', 'Run', 'JumpStart', 'FallLoop', 'Land'].sort()
    );
    const jointNames = gltf.skins[0].joints.map((index) => gltf.nodes[index].name);
    assert.equal(new Set(jointNames).size, jointNames.length);
    assert.equal(jointNames.filter((name) => name.startsWith('mantle_')).length, 6);
    assert.ok(!jointNames.some((name) => name.startsWith('control_')));
    for (const animation of gltf.animations) {
        for (const channel of animation.channels) {
            assert.ok(gltf.nodes[channel.target.node]);
            const sampler = animation.samplers[channel.sampler];
            const times = read(sampler.input).flat();
            assert.ok(times.at(-1) > 0);
            assert.ok(times.every((time, i) => Number.isFinite(time) && (!i || time > times[i - 1])));
            assert.ok(read(sampler.output).flat().every(Number.isFinite));
        }
        for (const name of ['thigh_l', 'calf_r', 'mantle_1_1']) {
            const channel = animation.channels.find(
                (channel) => channel.target.path === 'rotation' && gltf.nodes[channel.target.node].name === name
            );
            assert.ok(channel, `${animation.name}: ${name}`);
            const poses = read(animation.samplers[channel.sampler].output);
            assert.ok(
                poses.some((pose) => pose.some((value, i) => Math.abs(value - poses[0][i]) > 0.001)),
                `${animation.name}: frozen ${name}`
            );
        }
        const root = animation.channels.find(
            (channel) => channel.target.path === 'translation' && gltf.nodes[channel.target.node].name === 'root'
        );
        if (root) {
            const positions = read(animation.samplers[root.sampler].output);
            assert.ok(
                positions.every((position) =>
                    position.every((value, i) => Math.abs(value - positions[0][i]) < 0.00001)
                ),
                `${animation.name}: root drift`
            );
        }
    }
});

test('all textures are embedded and runtime geometry stays within its budget', () => {
    assert.equal(gltf.images.length, 15);
    assert.ok(gltf.images.every((image) => image.bufferView !== undefined && image.uri === undefined));
    const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives);
    const triangles = primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
    assert.equal(primitives.length, 9);
    assert.ok(triangles < 100000, `${triangles} triangles`);
    assert.ok(fileBytes < 8 * 1024 * 1024);
    console.log(
        JSON.stringify({
            bytes: fileBytes,
            triangles,
            joints: gltf.skins[0].joints.length,
            primitives: primitives.length
        })
    );
});
