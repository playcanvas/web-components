import fs from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';

export const createIO = async () =>
    new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await draco.createDecoderModule(),
        'draco3d.encoder': await draco.createEncoderModule()
    });

// Let the existing geometry/skin audits inspect decoded shipped data, not source exports.
export const readGlb = async (filename) => {
    let buffer = await fs.readFile(filename);
    const fileBytes = buffer.length;
    let jsonLength = buffer.readUInt32LE(12);
    let gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength));
    if (gltf.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
        const io = await createIO();
        const document = await io.readBinary(buffer);
        document
            .getRoot()
            .listExtensionsUsed()
            .find((extension) => extension instanceof KHRDracoMeshCompression)
            ?.dispose();
        buffer = Buffer.from(await io.writeBinary(document));
        jsonLength = buffer.readUInt32LE(12);
        gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength));
    }
    return { buffer, gltf, bin: buffer.subarray(28 + jsonLength), fileBytes };
};
