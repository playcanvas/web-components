import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { meshoptInitialize } from 'playcanvas';
import type { ContainerResource, Mesh } from 'playcanvas';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../src/asset';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

type MeshoptExtension = 'EXT_meshopt_compression' | 'KHR_meshopt_compression';

const POSITIONS = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const INDICES = [0, 1, 2];

/**
 * A glTF holding one triangle whose vertex and index data exist only in meshopt-compressed form.
 * Its uncompressed buffer is a fallback with no data, as gltfpack writes it, so the triangle
 * loads only if the data is decoded. Everything is inline, so no I/O.
 *
 * @param extension - The glTF extension the data is compressed under.
 * @param nodeName - The name of the node, which also makes the URI distinct: the loader caches
 * by URL.
 * @returns The data: URI of the glTF.
 */
const compressedTriangleSrc = async (extension: MeshoptExtension, nodeName: string) => {
    await MeshoptEncoder.ready;

    // The KHR extension uses version 1 of the vertex codec, and the EXT extension version 0
    const version = extension === 'KHR_meshopt_compression' ? 1 : 0;
    const positions = new Uint8Array(new Float32Array(POSITIONS).buffer);
    const indices = new Uint8Array(new Uint16Array(INDICES).buffer);
    const encodedPositions = MeshoptEncoder.encodeGltfBuffer(positions, 3, 12, 'ATTRIBUTES', version);
    const encodedIndices = MeshoptEncoder.encodeGltfBuffer(indices, 3, 2, 'TRIANGLES', version);

    // The index data starts on a 4 byte boundary
    const indicesOffset = Math.ceil(encodedPositions.byteLength / 4) * 4;
    const compressed = new Uint8Array(indicesOffset + encodedIndices.byteLength);
    compressed.set(encodedPositions, 0);
    compressed.set(encodedIndices, indicesOffset);

    const gltf = {
        asset: { version: '2.0' },
        extensionsUsed: [extension],
        extensionsRequired: [extension],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: nodeName, mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }
        ],
        bufferViews: [
            {
                buffer: 1,
                byteOffset: 0,
                byteLength: positions.byteLength,
                byteStride: 12,
                target: 34962,
                extensions: {
                    [extension]: {
                        buffer: 0,
                        byteOffset: 0,
                        byteLength: encodedPositions.byteLength,
                        byteStride: 12,
                        count: 3,
                        mode: 'ATTRIBUTES'
                    }
                }
            },
            {
                buffer: 1,
                byteOffset: positions.byteLength,
                byteLength: indices.byteLength,
                target: 34963,
                extensions: {
                    [extension]: {
                        buffer: 0,
                        byteOffset: indicesOffset,
                        byteLength: encodedIndices.byteLength,
                        byteStride: 2,
                        count: 3,
                        mode: 'TRIANGLES'
                    }
                }
            }
        ],
        buffers: [
            {
                byteLength: compressed.byteLength,
                uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...compressed))}`
            },
            {
                byteLength: positions.byteLength + indices.byteLength,
                extensions: { [extension]: { fallback: true } }
            }
        ]
    };

    return `data:application/json,${encodeURIComponent(JSON.stringify(gltf))}`;
};

/**
 * Loads a glTF through <pc-asset> and returns its only mesh.
 *
 * @param src - The URI of the glTF.
 * @returns The mesh.
 */
const loadMesh = async (src: string): Promise<Mesh> => {
    const { get } = await bootApp(`<pc-asset id="m" type="container" src="${src}"></pc-asset>`);
    const asset = get<AssetElement>('pc-asset').asset!;

    expect(asset.loaded, 'the container asset loaded').toBe(true);

    const container = asset.resource as ContainerResource;
    return container.renders[0]!.resource!.meshes![0]!;
};

/**
 * Models compressed with meshoptimizer load with no setup: the library gives the engine the
 * decoder when it is imported.
 */
describe('<pc-asset> meshopt compression', () => {
    useGuard();

    afterEach(() => {
        // Put back the decoder the library sets, which one test replaces
        meshoptInitialize({ decoder: MeshoptDecoder });
    });

    it.each<[MeshoptExtension]>([['EXT_meshopt_compression'], ['KHR_meshopt_compression']])(
        'decodes a model compressed under %s',
        async (extension) => {
            const mesh = await loadMesh(await compressedTriangleSrc(extension, `triangle-${extension}`));

            const positions: number[] = [];
            const indices: number[] = [];
            mesh.getPositions(positions);
            mesh.getIndices(indices);

            expect(positions).toEqual(POSITIONS);
            expect(indices).toEqual(INDICES);
        }
    );

    it('lets a later meshoptInitialize call take over the decoding', async () => {
        const decodeGltfBuffer = vi.fn(MeshoptDecoder.decodeGltfBuffer);
        meshoptInitialize({
            decoder: { supported: true, ready: MeshoptDecoder.ready, decodeGltfBuffer }
        });

        const mesh = await loadMesh(await compressedTriangleSrc('EXT_meshopt_compression', 'triangle-own-decoder'));

        // Once for the vertex data and once for the index data
        expect(decodeGltfBuffer).toHaveBeenCalledTimes(2);
        expect(mesh.vertexBuffer.numVertices).toBe(3);
    });
});
