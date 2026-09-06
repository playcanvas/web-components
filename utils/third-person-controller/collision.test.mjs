import assert from 'node:assert/strict';
import test from 'node:test';

import { GraphNode, Vec3 } from 'playcanvas';

import { readGlb } from './glb-io.mjs';

const triangles = async (filename) => {
    const { gltf, bin } = await readGlb(filename);
    const nodes = gltf.nodes.map((source) => {
        const node = new GraphNode(source.name);
        node.setLocalPosition(...(source.translation ?? [0, 0, 0]));
        node.setLocalRotation(...(source.rotation ?? [0, 0, 0, 1]));
        node.setLocalScale(...(source.scale ?? [1, 1, 1]));
        assert.equal(source.matrix, undefined);
        return node;
    });
    gltf.nodes.forEach((source, i) => source.children?.forEach((child) => nodes[i].addChild(nodes[child])));
    const read = (index, size) => {
        const accessor = gltf.accessors[index];
        const view = gltf.bufferViews[accessor.bufferView];
        const [bytes, method] = {
            5121: [1, 'readUInt8'],
            5123: [2, 'readUInt16LE'],
            5125: [4, 'readUInt32LE'],
            5126: [4, 'readFloatLE']
        }[accessor.componentType];
        const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        return Array.from({ length: accessor.count }, (_, i) =>
            Array.from({ length: size }, (_, j) =>
                bin[method](offset + i * (view.byteStride ?? size * bytes) + j * bytes)
            )
        );
    };
    return gltf.nodes.flatMap((node, i) =>
        node.mesh === undefined
            ? []
            : gltf.meshes[node.mesh].primitives.flatMap((primitive) => {
                  const positions = read(primitive.attributes.POSITION, 3).map((p) =>
                      nodes[i].getWorldTransform().transformPoint(new Vec3(...p))
                  );
                  const indices = read(primitive.indices, 1).flat();
                  return Array.from({ length: indices.length / 3 }, (_, face) =>
                      indices.slice(face * 3, face * 3 + 3).map((v) => positions[v])
                  );
              })
    );
};
const collision = await triangles(new URL('../../examples/assets/models/observatory-collision.glb', import.meta.url));
const environment = await triangles(
    new URL('../../examples/assets/models/observatory-environment.glb', import.meta.url)
);
const tops = (faces) => faces.filter((face) => face.every((v) => Math.abs(v.y - 3.5) < 1e-5));
const contains = (faces, x, z) =>
    faces.some(([a, b, c]) => {
        const cross = (p, q) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
        const sides = [cross(a, b), cross(b, c), cross(c, a)];
        return sides.every((s) => s >= -1e-6) || sides.every((s) => s <= 1e-6);
    });

test('the delivered collider supports the round dais up to its visible rim at y=3.5', () => {
    const physical = tops(collision),
        visual = tops(environment);
    for (let i = 0; i < 96; i++) {
        const angle = (i * Math.PI) / 48;
        for (const radius of [0, 4.8, 5.2]) {
            const x = 7 + radius * Math.cos(angle),
                z = -21 + radius * Math.sin(angle);
            assert.ok(contains(visual, x, z), `no visible top at ${x}, ${z}`);
            assert.ok(contains(physical, x, z), `unsupported visible dais at ${x}, ${z}`);
        }
    }
});

test('the old square corners no longer form invisible ledges beyond the round base', () => {
    for (const angle of [45, 135, 225, 315]) {
        for (const radius of [5.4, 5.7, 6]) {
            const x = 7 + radius * Math.cos((angle * Math.PI) / 180),
                z = -21 + radius * Math.sin((angle * Math.PI) / 180);
            const nearTop = collision.filter((face) => face.every((v) => v.y > 3.4 && v.y < 3.6));
            assert.equal(contains(nearTop, x, z), false, `invisible square corner at ${x}, ${z}`);
        }
    }
});

test('the collider has the authored 10.6 m outer diameter and 25 mm bevel', () => {
    const rim = collision
        .flat()
        .filter((v) => v.y > 3 && v.y <= 3.50001 && Math.abs(Math.hypot(v.x - 7, v.z + 21) - 5.3) < 0.03);
    assert.ok(rim.length > 96);
    assert.ok(rim.every((v) => Math.hypot(v.x - 7, v.z + 21) < 5.30001));
    assert.ok(
        Math.abs(
            Math.max(...rim.filter((v) => Math.abs(v.y - 3.5) < 1e-5).map((v) => Math.hypot(v.x - 7, v.z + 21))) - 5.275
        ) < 1e-4
    );
});
