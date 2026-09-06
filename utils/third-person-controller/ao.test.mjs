import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createIO } from './glb-io.mjs';

const config = JSON.parse(await fs.readFile(new URL('./lighting-bakes.json', import.meta.url), 'utf8')).observatory;
const io = await createIO();
const root = (
    await io.read(fileURLToPath(new URL('../../examples/assets/models/observatory-environment.glb', import.meta.url)))
).getRoot();

test('every static architectural receiver has a bounded UV1 AO atlas; moving parts do not', () => {
    let count = 0;
    const atlases = new Set();
    for (const node of root.listNodes()) {
        const region = node.getName().split(' ')[1];
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const material = primitive.getMaterial();
            const expected =
                node.getName().startsWith('Environment ') &&
                region in config.regions &&
                config.materialPrefixes.some((prefix) => material.getName().startsWith(prefix));
            assert.equal(!!material.getOcclusionTexture(), expected, node.getName());
            if (!expected) continue;
            count++;
            atlases.add(material.getOcclusionTexture());
            assert.equal(material.getOcclusionTextureInfo().getTexCoord(), 1);
            const uv = primitive.getAttribute('TEXCOORD_1');
            assert.ok(uv && primitive.getAttribute('TEXCOORD_0'));
            for (const value of uv.getArray()) assert.ok(Number.isFinite(value) && value >= -1e-6 && value <= 1.000001);
            assert.deepEqual(material.getOcclusionTexture().getSize(), [
                config.deliveryResolution,
                config.deliveryResolution
            ]);
        }
    }
    assert.equal(count, 39);
    assert.equal(atlases.size, Object.keys(config.regions).length);
});
