import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import sharp from 'sharp';

import { createIO } from './glb-io.mjs';

// Usage: node utils/third-person-controller/compress.mjs INPUT_DIRECTORY OUTPUT_DIRECTORY
// KTX-Software 4.4.2 (ktx) must be on PATH. Inputs must be fresh Blender exports.
const [inputDirectory, outputDirectory] = process.argv.slice(2);
if (!inputDirectory || !outputDirectory) throw new Error('Supply separate source and destination directories.');
if (path.resolve(inputDirectory) === path.resolve(outputDirectory))
    throw new Error('Keep the source exports separately.');
await fs.mkdir(outputDirectory, { recursive: true });
const io = await createIO();
const cli = fileURLToPath(new URL('./node_modules/@gltf-transform/cli/bin/cli.js', import.meta.url));
const results = [];
const aoConfig = JSON.parse(await fs.readFile(new URL('./lighting-bakes.json', import.meta.url), 'utf8')).observatory;
for (const name of ['character', 'environment', 'collision']) {
    const file = `observatory-${name}.glb`;
    const source = path.join(inputDirectory, file);
    const target = path.join(outputDirectory, file);
    const document = await io.read(source);
    if (
        document
            .getRoot()
            .listExtensionsUsed()
            .some((extension) => ['KHR_draco_mesh_compression', 'KHR_texture_basisu'].includes(extension.extensionName))
    ) {
        throw new Error(`${file} is already compressed; use a fresh source to avoid repeated lossy encoding.`);
    }
    const textures = document.getRoot().listTextures().length;
    let compressedDocument = document;
    const intermediate = path.join(outputDirectory, `.${name}-textures.glb`);
    const prepared = path.join(outputDirectory, `.${name}-prepared.glb`);
    try {
        if (textures) {
            let resized = false;
            for (const texture of document.getRoot().listTextures()) {
                const size = texture.getSize();
                // AO is low-frequency: bake at 2x delivery size to filter ray noise before ETC1S.
                const limit = texture.getName().endsWith('-ao') ? aoConfig.deliveryResolution : Infinity;
                const targetSize = size.map((dimension) =>
                    Math.min(limit, Math.max(4, 2 ** Math.round(Math.log2(dimension))))
                );
                if (size.every((dimension, i) => dimension === targetSize[i])) continue;
                // Engine 2.22 uploads logical mip extents, with a minimum of one 4x4 block.
                // A base level aligned to 4 is insufficient: 1256 -> 628 -> 314 fails on WebGPU.
                texture.setImage(
                    await sharp(texture.getImage())
                        .resize(...targetSize)
                        .png()
                        .toBuffer()
                );
                texture.setMimeType('image/png');
                console.log(`${texture.getName()}: ${size.join('x')} -> ${targetSize.join('x')}`);
                resized = true;
            }
            if (resized) await io.write(prepared, document);
            const result = spawnSync(
                process.execPath,
                [
                    cli,
                    'etc1s',
                    resized ? prepared : source,
                    intermediate,
                    '--quality',
                    '192',
                    '--compression',
                    '2',
                    '--jobs',
                    '4'
                ],
                { stdio: 'inherit' }
            );
            if (result.error || result.status !== 0) throw result.error ?? new Error('ETC1S encoding failed.');
            compressedDocument = await io.read(intermediate);
            if (
                compressedDocument
                    .getRoot()
                    .listTextures()
                    .some((texture) => texture.getMimeType() !== 'image/ktx2')
            ) {
                throw new Error(`${file}: a texture failed to encode; keep the previous delivery.`);
            }
        }
        compressedDocument
            .createExtension(KHRDracoMeshCompression)
            .setRequired(true)
            .setEncoderOptions({
                method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
                encodeSpeed: 0,
                decodeSpeed: 5,
                // Preserve positions/weights exactly; compact shading attributes at high precision.
                // Quantizing positions independently per mesh would risk the carefully fitted seams.
                quantizationBits: { POSITION: 0, NORMAL: 12, COLOR: 0, TEX_COORD: 16, GENERIC: 0 }
            });
        await io.write(target, compressedDocument);
        results.push({ file, before: (await fs.stat(source)).size, after: (await fs.stat(target)).size, textures });
    } finally {
        await fs.rm(intermediate, { force: true });
        await fs.rm(prepared, { force: true });
    }
}
console.table(results);
