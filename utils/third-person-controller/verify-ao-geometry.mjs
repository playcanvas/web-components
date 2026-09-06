import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createIO } from './glb-io.mjs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Supply the before/after uncompressed environment GLBs.');
const io = await createIO();
const before = (await io.read(beforePath)).getRoot();
const after = (await io.read(afterPath)).getRoot();
const hash = (primitive) => {
    const position = primitive.getAttribute('POSITION');
    const attributes = ['POSITION', 'NORMAL', 'TEXCOORD_0'].map((name) => primitive.getAttribute(name)).filter(Boolean);
    const keys = Array.from({ length: position.getCount() }, (_, i) => {
        const h = createHash('sha256');
        for (const a of attributes) {
            const values = a.getArray().subarray(i * a.getElementSize(), (i + 1) * a.getElementSize());
            h.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
        }
        return h.digest('hex');
    });
    const faces = [],
        indices = primitive.getIndices().getArray();
    for (let i = 0; i < indices.length; i += 3) {
        const triangle = [keys[indices[i]], keys[indices[i + 1]], keys[indices[i + 2]]];
        const start = triangle.indexOf([...triangle].sort()[0]);
        faces.push([triangle[start], triangle[(start + 1) % 3], triangle[(start + 2) % 3]].join(''));
    }
    return createHash('sha256').update(faces.sort().join('')).digest('hex');
};
let count = 0;
for (const node of before.listNodes()) {
    const next = after.listNodes().find((n) => n.getName() === node.getName());
    assert.ok(next, node.getName());
    assert.deepEqual(next.getTranslation(), node.getTranslation());
    assert.deepEqual(next.getRotation(), node.getRotation());
    assert.deepEqual(next.getScale(), node.getScale());
    assert.deepEqual(
        next.listChildren().map((n) => n.getName()),
        node.listChildren().map((n) => n.getName())
    );
    if (!node.getMesh()) continue;
    const a = node.getMesh().listPrimitives(),
        b = next.getMesh().listPrimitives();
    assert.equal(a.length, b.length);
    a.forEach((p, i) => assert.equal(hash(p), hash(b[i]), node.getName()));
    count += a.length;
}
const tracks = (root) =>
    root
        .listAnimations()
        .map((a) => ({
            name: a.getName(),
            samplers: a
                .listSamplers()
                .map((s) => ({
                    interpolation: s.getInterpolation(),
                    input: Array.from(s.getInput().getArray()),
                    output: Array.from(s.getOutput().getArray())
                })),
            channels: a.listChannels().map((c) => [c.getTargetNode().getName(), c.getTargetPath()])
        }));
assert.deepEqual(tracks(after), tracks(before));
console.log(
    JSON.stringify({
        unchangedPrimitives: count,
        exact: ['positions', 'normals', 'UV0', 'triangle winding', 'hierarchy', 'animation']
    })
);
