import { describe, expect, it } from 'vitest';

import type { CollisionComponentElement } from '../../src/components/collision-component';
import type { NodeElement } from '../../src/node';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * A glTF with actual geometry - one triangle shared by two meshes - so instantiation produces
 * render components with render assets, which is what the mesh-collider default reads. The
 * vertex buffer is built here rather than pasted as opaque base64 (via btoa: the test tsconfig
 * deliberately carries no node types, so Buffer is unavailable).
 */
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const positionsBase64 = btoa(String.fromCharCode(...new Uint8Array(positions.buffer)));
const MESH_SRC = `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
        { name: 'Root', children: [1, 2] },
        { name: 'Body', mesh: 0 },
        { name: 'Glass', mesh: 1 }
    ],
    meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 0 } }] }
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    buffers: [
        {
            uri: `data:application/octet-stream;base64,${positionsBase64}`,
            byteLength: positions.byteLength
        }
    ]
}))}`;

const MESH_ASSET = `<pc-asset id="m" type="container" src="${MESH_SRC}"></pc-asset>`;

describe('<pc-collision> mesh geometry default', () => {
    const { uncaught, warnings } = useGuard();

    it("defaults renderAsset to the bound node's render asset", async () => {
        const { get } = await bootApp(
            `${MESH_ASSET}<pc-model asset="m">
                <pc-node name="Body"><pc-collision type="mesh"></pc-collision></pc-node>
            </pc-model>`
        );
        const node = get<NodeElement>('pc-node');
        const collision = get<CollisionComponentElement>('pc-collision');
        await readyWithin(collision);

        expect(node.entity!.render, 'the glTF node arrived with a render component').toBeDefined();
        expect(collision.component!.renderAsset, 'geometry defaulted to the host render asset').toBe(
            node.entity!.render!.asset
        );
        expect(collision.component!.renderAsset).not.toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('recomputes the default when the pc-node retargets', async () => {
        const { get } = await bootApp(
            `${MESH_ASSET}<pc-model asset="m">
                <pc-node name="Body"><pc-collision type="mesh"></pc-collision></pc-node>
            </pc-model>`
        );
        const node = get<NodeElement>('pc-node');
        const collision = get<CollisionComponentElement>('pc-collision');
        await readyWithin(collision);
        const bodyAsset = collision.component!.renderAsset;

        node.setAttribute('name', 'Glass');

        expect(node.entity!.name).toBe('Glass');
        expect(collision.component!.renderAsset, 'the new binding gets the new geometry').toBe(
            node.entity!.render!.asset
        );
        expect(collision.component!.renderAsset).not.toBe(bodyAsset);
        expect(uncaught.seen).toEqual([]);
    });

    it('warns and leaves the collider shapeless when there is no render component', async () => {
        const { get } = await bootApp('<pc-entity name="empty"><pc-collision type="mesh"></pc-collision></pc-entity>');
        const collision = get<CollisionComponentElement>('pc-collision');
        await readyWithin(collision);

        warnings.expect(
            `pc-collision type="mesh" on 'empty' found no asset-backed render component to take geometry from - collider has no shape`
        );
        expect(collision.component!.renderAsset).toBeNull();
    });

    it('warns for a primitive render component, which has no asset to collide against', async () => {
        const { get } = await bootApp(
            '<pc-entity name="prim"><pc-render type="box"></pc-render><pc-collision type="mesh"></pc-collision></pc-entity>'
        );
        const collision = get<CollisionComponentElement>('pc-collision');
        await readyWithin(collision);

        warnings.expect("pc-collision type=\"mesh\" on 'prim' found no asset-backed render component");
        expect(collision.component!.renderAsset).toBeNull();
    });

    it('leaves non-mesh collider types alone', async () => {
        const { get } = await bootApp('<pc-entity name="box"><pc-collision></pc-collision></pc-entity>');
        const collision = get<CollisionComponentElement>('pc-collision');
        await readyWithin(collision);

        // No warning (the guard fails the test if one fires) and no geometry write
        expect(collision.component!.renderAsset).toBeNull();
        expect(collision.component!.type).toBe('box');
    });
});
