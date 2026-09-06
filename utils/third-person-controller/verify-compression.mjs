import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createIO } from './glb-io.mjs';

const [sourceDirectory, targetDirectory] = process.argv.slice(2);
if (!sourceDirectory || !targetDirectory) throw new Error('Supply source and compressed directories.');
const io = await createIO();
const aoConfig = JSON.parse(await fs.readFile(new URL('./lighting-bakes.json', import.meta.url), 'utf8')).observatory;
const summary = [];
// Draco may reorder vertices/faces and remove zero-area index degenerates. Compare oriented
// triangles by exact position, joints and weights rather than comparing buffer order.
const triangles = (primitive) => {
    const semantics = primitive
        .listSemantics()
        .filter((name) => !['NORMAL', 'TEXCOORD_0', 'TEXCOORD_1'].includes(name))
        .sort();
    const indices = primitive.getIndices().getArray();
    const position = primitive.getAttribute('POSITION').getArray();
    const key = (index) =>
        semantics
            .map((semantic) => {
                const accessor = primitive.getAttribute(semantic);
                const size = accessor.getElementSize();
                return Array.from(accessor.getArray().subarray(index * size, (index + 1) * size)).join(',');
            })
            .join('|');
    const keys = Array.from({ length: position.length / 3 }, (_, i) => key(i));
    const faces = new Map();
    let degenerate = 0;
    for (let i = 0; i < indices.length; i += 3) {
        const vertices = Array.from(indices.subarray(i, i + 3));
        if (new Set(vertices.map((v) => Array.from(position.subarray(v * 3, v * 3 + 3)).join(','))).size < 3) {
            degenerate++;
            continue;
        }
        const values = vertices.map((v) => keys[v]);
        const first = values.indexOf([...values].sort()[0]);
        const face = [values[first], values[(first + 1) % 3], values[(first + 2) % 3]].join('/');
        faces.set(face, (faces.get(face) ?? 0) + 1);
    }
    return { faces, degenerate };
};
for (const name of ['character', 'environment', 'collision']) {
    const file = `observatory-${name}.glb`;
    const source = await io.read(path.join(sourceDirectory, file));
    const target = await io.read(path.join(targetDirectory, file));
    const a = source.getRoot(),
        b = target.getRoot();
    const hierarchy = (root) =>
        root.listNodes().map((node) => ({
            name: node.getName(),
            translation: node.getTranslation(),
            rotation: node.getRotation(),
            scale: node.getScale(),
            children: node.listChildren().map((child) => child.getName())
        }));
    const ha = hierarchy(a),
        hb = hierarchy(b);
    assert.equal(hb.length, ha.length);
    let maxTransformDelta = 0;
    for (let n = 0; n < ha.length; n++) {
        assert.equal(hb[n].name, ha[n].name);
        assert.deepEqual(hb[n].children, ha[n].children);
        for (const property of ['translation', 'rotation', 'scale']) {
            for (let c = 0; c < ha[n][property].length; c++) {
                const delta = Math.abs(ha[n][property][c] - hb[n][property][c]);
                maxTransformDelta = Math.max(maxTransformDelta, delta);
                // glTF Transform's writer uses MathUtils.eq's default 10e-6 tolerance.
                assert.ok(delta <= 1e-5, `${name}: ${ha[n].name} ${property} changed by ${delta}`);
            }
        }
    }
    assert.equal(b.listMeshes().length, a.listMeshes().length);
    let removedDegenerates = 0;
    for (let m = 0; m < a.listMeshes().length; m++) {
        const ap = a.listMeshes()[m].listPrimitives(),
            bp = b.listMeshes()[m].listPrimitives();
        assert.equal(bp.length, ap.length);
        for (let p = 0; p < ap.length; p++) {
            const at = triangles(ap[p]),
                bt = triangles(bp[p]);
            assert.equal(bt.faces.size, at.faces.size, `${name}: changed face count in ${m}/${p}`);
            assert.ok(
                [...at.faces].every(([key, count]) => bt.faces.get(key) === count),
                `${name}: changed triangle positions, weights or winding in ${m}/${p}`
            );
            removedDegenerates += at.degenerate - bt.degenerate;
        }
    }
    const animations = (root) =>
        root.listAnimations().map((animation) => ({
            name: animation.getName(),
            channels: animation.listChannels().map((channel) => ({
                node: channel.getTargetNode().getName(),
                path: channel.getTargetPath(),
                interpolation: channel.getSampler().getInterpolation(),
                input: Array.from(channel.getSampler().getInput().getArray()),
                output: Array.from(channel.getSampler().getOutput().getArray())
            }))
        }));
    assert.deepEqual(animations(b), animations(a), `${name}: animation data changed`);
    const skins = (root) =>
        root.listSkins().map((skin) => ({
            joints: skin.listJoints().map((joint) => joint.getName()),
            inverseBindMatrices: Array.from(skin.getInverseBindMatrices().getArray())
        }));
    assert.deepEqual(skins(b), skins(a), `${name}: bind rig changed`);
    const textures = b.listTextures();
    assert.equal(textures.length, a.listTextures().length);
    assert.ok(textures.every((texture) => texture.getMimeType() === 'image/ktx2'));
    for (let i = 0; i < textures.length; i++) {
        const image = textures[i].getImage();
        const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
        const mipLevels = view.getUint32(40, true);
        for (let level = 0; level < mipLevels; level++) {
            for (const [axis, offset] of [
                ['width', 20],
                ['height', 24]
            ]) {
                const uploadSize = Math.max(4, view.getUint32(offset, true) >> level);
                assert.equal(
                    uploadSize % 4,
                    0,
                    `${textures[i].getName()} mip ${level}: Engine upload ${axis} ${uploadSize} is not block-aligned`
                );
            }
        }
        const expectedSize = a
            .listTextures()
            [i].getSize()
            .map((size) =>
                Math.min(
                    textures[i].getName().endsWith('-ao') ? aoConfig.deliveryResolution : Infinity,
                    Math.max(4, 2 ** Math.round(Math.log2(size)))
                )
            );
        assert.deepEqual(textures[i].getSize(), expectedSize, 'unexpected texture resizing');
        const descriptor = view.getUint32(48, true);
        assert.equal(view.getUint8(descriptor + 12), 163, 'texture must use ETC1S');
        assert.ok(view.getUint32(40, true) > 1, 'texture must include mipmaps');
    }
    summary.push({
        file,
        removedDegenerates,
        maxTransformDelta,
        exactPositionsWeightsAnimations: true,
        textures: textures.length,
        bytes: (await fs.stat(path.join(targetDirectory, file))).size
    });
}
console.log(JSON.stringify(summary, null, 2));
