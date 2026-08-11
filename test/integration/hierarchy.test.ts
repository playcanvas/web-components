import { describe, expect, it } from 'vitest';

import type { ModelElement } from '../../src/model';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * A glTF exercising everything hierarchy() reports: real geometry (the wheels share one triangle
 * mesh, so instantiation attaches render components), identically named nodes under different
 * parents (the two wheels — cross-parent duplicates survive parsing, which is what match indices
 * disambiguate), and identically named siblings (the two wings — which the engine parser renames
 * apart to `Wing`, `Wing1` as it builds the hierarchy). The vertex buffer is built here rather
 * than pasted as opaque base64 (via btoa: the test tsconfig deliberately carries no node types,
 * so Buffer is unavailable).
 */
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const positionsBase64 = btoa(String.fromCharCode(...new Uint8Array(positions.buffer)));
const CAR_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [
            { name: 'Car', children: [1, 3, 5, 6] },
            { name: 'FrontAxle', children: [2] },
            { name: 'Wheel', mesh: 0 },
            { name: 'RearAxle', children: [4] },
            { name: 'Wheel', mesh: 0 },
            { name: 'Wing' },
            { name: 'Wing' }
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
        buffers: [
            {
                uri: `data:application/octet-stream;base64,${positionsBase64}`,
                byteLength: positions.byteLength
            }
        ]
    })
)}`;

/**
 * A meshless glTF whose single scene holds two root nodes: the engine parser wraps them in a
 * scene-root node named after the scene, and hierarchy() reports that wrapper — the instantiated
 * tree is the authority, not the source asset's node list.
 */
const STAGE_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ name: 'Stage', nodes: [0, 1] }],
        nodes: [{ name: 'Podium' }, { name: 'Backdrop' }]
    })
)}`;

const ASSETS = `
    <pc-asset id="car" type="container" src="${CAR_SRC}"></pc-asset>
    <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
`;

describe('<pc-model> hierarchy()', () => {
    const { uncaught } = useGuard();

    /** Boots an app with both container assets and a car model. */
    const bootCar = async () => {
        const booted = await bootApp(`${ASSETS}<pc-model asset="car"></pc-model>`);
        return { ...booted, model: booted.get<ModelElement>('pc-model') };
    };

    it('returns null while there is no instantiated hierarchy', async () => {
        const { model } = await bootCar();

        expect(document.createElement('pc-model').hierarchy(), 'nothing instantiated yet').toBeNull();
        expect(model.hierarchy(), 'the booted model has a tree').not.toBeNull();

        model.remove();
        expect(model.hierarchy(), 'removal tears the hierarchy down').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('mirrors the instantiated tree as plain serializable data', async () => {
        const { model } = await bootCar();

        // The JSON round trip is part of the assertion: the snapshot must carry no cycles and
        // no enumerable extras beyond the data itself.
        const tree = JSON.parse(JSON.stringify(model.hierarchy()));

        expect(tree).toEqual({
            name: 'Car',
            path: 'Car',
            index: 0,
            components: [],
            children: [
                {
                    name: 'FrontAxle',
                    path: 'FrontAxle',
                    index: 0,
                    components: [],
                    children: [
                        { name: 'Wheel', path: 'FrontAxle/Wheel', index: 0, components: ['render'], children: [] }
                    ]
                },
                {
                    name: 'RearAxle',
                    path: 'RearAxle',
                    index: 0,
                    components: [],
                    children: [
                        { name: 'Wheel', path: 'RearAxle/Wheel', index: 1, components: ['render'], children: [] }
                    ]
                },
                { name: 'Wing', path: 'Wing', index: 0, components: [], children: [] },
                { name: 'Wing1', path: 'Wing1', index: 0, components: [], children: [] }
            ]
        });

        // The round trip alone cannot see toString - JSON.stringify skips functions whether or
        // not they are enumerable - so the data-only key set is pinned directly.
        expect(Object.keys(model.hierarchy()!), 'toString stays non-enumerable').toEqual([
            'name',
            'path',
            'index',
            'components',
            'children'
        ]);
        expect(uncaught.seen).toEqual([]);
    });

    it('gives each node the index a pc-node needs to bind it', async () => {
        const { model } = await bootCar();
        const tree = model.hierarchy()!;
        const wheels = [tree.children[0].children[0], tree.children[1].children[0]];

        for (const wheel of wheels) {
            const node = document.createElement('pc-node');
            node.setAttribute('name', wheel.name);
            node.setAttribute('index', String(wheel.index));
            model.appendChild(node);

            expect(node.state, `'${wheel.path}' bound without ambiguity`).toBe('bound');
            expect(node.path, 'the index selected exactly the node hierarchy() described').toBe(wheel.path);
            node.remove();
        }
        expect(uncaught.seen).toEqual([]);
    });

    it('reads the components attached at call time', async () => {
        const { model } = await bootCar();
        expect(model.hierarchy()!.components).toEqual([]);

        model.entity!.addComponent('camera');

        expect(model.hierarchy()!.components, 'a fresh snapshot sees the new component').toEqual(['camera']);
        expect(uncaught.seen).toEqual([]);
    });

    it('renders a printable tree from toString', async () => {
        const { model } = await bootCar();
        const tree = model.hierarchy()!;

        expect(String(tree)).toBe(
            [
                'Car',
                '├─ FrontAxle',
                '│  └─ Wheel [0] (render)',
                '├─ RearAxle',
                '│  └─ Wheel [1] (render)',
                '├─ Wing',
                '└─ Wing1'
            ].join('\n')
        );
        expect(String(tree.children[0]), 'any node prints its own subtree').toBe('FrontAxle\n└─ Wheel [0] (render)');
        expect(uncaught.seen).toEqual([]);
    });

    it('reports the wrapper root the engine creates for a multi-root scene', async () => {
        const { get } = await bootApp(`${ASSETS}<pc-model asset="stage"></pc-model>`);
        const tree = get<ModelElement>('pc-model').hierarchy()!;

        expect(tree.name, 'the scene wrapper is part of the instantiated tree').toBe('Stage');
        expect(tree.path, "the root's path is its own name").toBe('Stage');
        expect(tree.children.map((child) => child.name)).toEqual(['Podium', 'Backdrop']);
        expect(uncaught.seen).toEqual([]);
    });

    it('snapshots the current hierarchy across a reload', async () => {
        const { model } = await bootCar();
        const before = model.hierarchy()!;

        model.setAttribute('asset', 'stage');
        expect(model.hierarchy(), 'torn down synchronously with the old hierarchy').toBeNull();

        await readyWithin(model);
        expect(model.hierarchy()!.name, 'the snapshot follows the new asset').toBe('Stage');
        expect(before.name, 'the old snapshot is inert data').toBe('Car');
        expect(uncaught.seen).toEqual([]);
    });
});
