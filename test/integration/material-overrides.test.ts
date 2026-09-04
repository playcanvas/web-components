import type { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { MaterialElement } from '../../src/material';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * A glTF exercising every selector the mapping grammar offers: a render node whose five
 * primitives cover a named material, an unnamed one (runtime name `Untitled`), a duplicated
 * name (two distinct materials both named `CarPaint`), and a primitive authored without a
 * material (the engine's shared `defaultGlbMaterial`). `Trim` is a render descendant sharing
 * `CarPaint`, which node scoping must leave alone, and `Mount` is a meshless attachment node.
 */
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const positionsBase64 = btoa(String.fromCharCode(...new Uint8Array(positions.buffer)));
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
const normalsBase64 = btoa(String.fromCharCode(...new Uint8Array(normals.buffer)));
const BODY_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'Body', mesh: 0, children: [1, 2] }, { name: 'Trim', mesh: 1 }, { name: 'Mount' }],
        materials: [{ name: 'CarPaint' }, { name: 'Glass' }, { name: 'CarPaint' }, {}],
        meshes: [
            {
                primitives: [
                    { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
                    { attributes: { POSITION: 0, NORMAL: 1 }, material: 3 },
                    { attributes: { POSITION: 0, NORMAL: 1 }, material: 1 },
                    { attributes: { POSITION: 0, NORMAL: 1 } },
                    { attributes: { POSITION: 0, NORMAL: 1 }, material: 2 }
                ]
            },
            { primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
            { buffer: 1, byteOffset: 0, byteLength: normals.byteLength }
        ],
        buffers: [
            {
                uri: `data:application/octet-stream;base64,${positionsBase64}`,
                byteLength: positions.byteLength
            },
            {
                uri: `data:application/octet-stream;base64,${normalsBase64}`,
                byteLength: normals.byteLength
            }
        ]
    })
)}`;

/**
 * A single material on a triangle with no NORMAL attribute. Engine 2.22 clones the material for
 * flat shading and appends `-flatShaded` to its runtime name.
 */
const NO_NORMAL_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'Flat', mesh: 0 }],
        materials: [{ name: 'Glass' }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
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
 * A minimally skinned glTF: one bone, identity bind matrix, every vertex weighted to it. The
 * mesh instance carries a skin instance, which a material swap must leave in place.
 */
const skinnedBytes = new Uint8Array(160 + normals.byteLength);
skinnedBytes.set(new Uint8Array(positions.buffer), 0);
// Joints (UBYTE4 x 3) at offset 36 stay zero; weights bind every vertex fully to joint 0
skinnedBytes.set(new Uint8Array(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]).buffer), 48);
// prettier-ignore
skinnedBytes.set(new Uint8Array(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).buffer), 96);
skinnedBytes.set(new Uint8Array(normals.buffer), 160);
const skinnedBase64 = btoa(String.fromCharCode(...skinnedBytes));
const SKINNED_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'Root', children: [1, 2] }, { name: 'Bone' }, { name: 'Skinny', mesh: 0, skin: 0 }],
        skins: [{ joints: [1], inverseBindMatrices: 3 }],
        materials: [{ name: 'Skin' }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, NORMAL: 4 }, material: 0 }] }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5121, count: 3, type: 'VEC4' },
            { bufferView: 2, componentType: 5126, count: 3, type: 'VEC4' },
            { bufferView: 3, componentType: 5126, count: 1, type: 'MAT4' },
            { bufferView: 4, componentType: 5126, count: 3, type: 'VEC3' }
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 12 },
            { buffer: 0, byteOffset: 48, byteLength: 48 },
            { buffer: 0, byteOffset: 96, byteLength: 64 },
            { buffer: 0, byteOffset: 160, byteLength: normals.byteLength }
        ],
        buffers: [
            {
                uri: `data:application/octet-stream;base64,${skinnedBase64}`,
                byteLength: skinnedBytes.byteLength
            }
        ]
    })
)}`;

const PRELUDE = `
    <pc-material id="candy-red" name="Candy Red"></pc-material>
    <pc-material id="smoked-glass"></pc-material>
    <pc-asset id="body" type="container" src="${BODY_SRC}"></pc-asset>
    <pc-asset id="flat" type="container" src="${NO_NORMAL_SRC}"></pc-asset>
    <pc-asset id="skinned" type="container" src="${SKINNED_SRC}"></pc-asset>
`;

describe('<pc-node> material-overrides', () => {
    const { uncaught, warnings } = useGuard();

    /** Boots the body model with one pc-node carrying `nodeAttributes`. */
    const bootBody = async (nodeAttributes: string) => {
        const booted = await bootApp(`${PRELUDE}<pc-model asset="body"><pc-node ${nodeAttributes}></pc-node></pc-model>`);
        const model = booted.get<ModelElement>('pc-model');
        const node = booted.get<NodeElement>('pc-node');
        const replacements = {
            candyRed: booted.get<MaterialElement>('pc-material[id="candy-red"]').material!,
            smokedGlass: booted.get<MaterialElement>('pc-material[id="smoked-glass"]').material!
        };
        /** The body render component's mesh instances, read fresh from the current hierarchy. */
        const meshInstances = () => model.contentEntity!.render!.meshInstances;
        return { ...booted, model, node, replacements, meshInstances };
    };

    /** Boots the body model with an unmapped pc-node and captures the authored assignments. */
    const bootAuthored = async () => {
        const booted = await bootBody('name="Body"');
        const authored = booted.meshInstances().map((meshInstance) => meshInstance.material);
        return { ...booted, authored };
    };

    describe('selection', () => {
        it('matches the runtime flat-shaded name for a primitive without normals', async () => {
            const { get } = await bootApp(
                `${PRELUDE}<pc-model asset="flat"><pc-node name="Flat"></pc-node></pc-model>`
            );
            const model = get<ModelElement>('pc-model');
            const node = get<NodeElement>('pc-node');
            const replacement = get<MaterialElement>('pc-material[id="smoked-glass"]').material!;
            const meshInstance = model.contentEntity!.render!.meshInstances[0];

            expect(meshInstance.material.name).toBe('Glass-flatShaded');

            node.materialOverrides = { 'name:Glass-flatShaded': 'smoked-glass' };

            expect(meshInstance.material).toBe(replacement);
            expect(uncaught.seen).toEqual([]);
        });

        it('replaces sparsely by name and index, leaving unmatched assignments untouched', async () => {
            const { authored, meshInstances, node, replacements } = await bootAuthored();

            node.setAttribute('material-overrides', '{"name:Glass": "smoked-glass", "index:1": "candy-red"}');

            const current = meshInstances().map((meshInstance) => meshInstance.material);
            expect(current[2], 'name:Glass replaced its one assignment').toBe(replacements.smokedGlass);
            expect(current[1], 'index:1 replaced the unnamed assignment').toBe(replacements.candyRed);
            for (const slot of [0, 3, 4]) {
                expect(current[slot], `slot ${slot} keeps its authored material`).toBe(authored[slot]);
            }
            expect(uncaught.seen).toEqual([]);
        });

        it('replaces every assignment matching a name rule, and only on the bound node', async () => {
            const { meshInstances, model, node, replacements } = await bootBody(
                `name="Body" material-overrides='{"name:CarPaint": "candy-red"}'`
            );

            const current = meshInstances().map((meshInstance) => meshInstance.material);
            expect(current[0], 'both CarPaint assignments replaced').toBe(replacements.candyRed);
            expect(current[4], 'the duplicated name matches too').toBe(replacements.candyRed);

            const trim = (model.entity!.findByName('Trim') as Entity).render!.meshInstances[0];
            expect(trim.material, "the descendant's CarPaint is out of scope").not.toBe(replacements.candyRed);
            expect(trim.material.name).toBe('CarPaint');
            expect(node.state).toBe('bound');
            expect(uncaught.seen).toEqual([]);
        });

        it('lets an index rule win over a name rule for the same instance', async () => {
            const { meshInstances, node, replacements } = await bootAuthored();

            node.materialOverrides = { 'name:CarPaint': 'candy-red', 'index:0': 'smoked-glass' };

            const current = meshInstances().map((meshInstance) => meshInstance.material);
            expect(current[0], 'index beats name on the shared instance').toBe(replacements.smokedGlass);
            expect(current[4], 'the name rule still covers the other match').toBe(replacements.candyRed);
            expect(uncaught.seen).toEqual([]);
        });

        it('falls back from an unresolved index rule to the name rule beneath it', async () => {
            const { meshInstances, node, replacements } = await bootAuthored();

            node.materialOverrides = { 'name:CarPaint': 'candy-red', 'index:0': 'missing' };

            expect(meshInstances()[0].material, 'the invalid rule behaves as absent').toBe(replacements.candyRed);
            warnings.expect("pc-node 'Body' material-overrides could not resolve pc-material 'missing'");
            expect(uncaught.seen).toEqual([]);
        });

        it('matches against the baseline captured at first application, immune to renames', async () => {
            const { authored, meshInstances, node, replacements } = await bootAuthored();

            node.materialOverrides = { 'name:CarPaint': 'candy-red' };
            authored[2]!.name = 'Resprayed';

            // Edits recompute from the baseline: names are matched as captured, never against a
            // replacement (no chaining) and never against a later rename.
            node.materialOverrides = { 'name:CarPaint': 'smoked-glass', 'name:Glass': 'candy-red' };

            const current = meshInstances().map((meshInstance) => meshInstance.material);
            expect(current[0], 'rematched by baseline name, not by the previous replacement').toBe(
                replacements.smokedGlass
            );
            expect(current[4]).toBe(replacements.smokedGlass);
            expect(current[2], 'matched by its captured name despite the rename').toBe(replacements.candyRed);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('lifecycle', () => {
        it('restores the exact authored references on attribute removal, null, empty and malformed mappings', async () => {
            const { authored, meshInstances, node, replacements } = await bootAuthored();
            const restored = () => meshInstances().map((meshInstance) => meshInstance.material);
            const expectAuthored = (reason: string) => {
                restored().forEach((material, slot) => {
                    expect(material, `slot ${slot} ${reason}`).toBe(authored[slot]);
                });
            };

            node.setAttribute('material-overrides', '{"name:CarPaint": "candy-red"}');
            expect(restored()[0]).toBe(replacements.candyRed);
            node.removeAttribute('material-overrides');
            expectAuthored('restored on attribute removal');

            node.materialOverrides = { 'name:CarPaint': 'candy-red' };
            node.materialOverrides = null;
            expectAuthored('restored on null assignment');

            node.materialOverrides = { 'name:CarPaint': 'candy-red' };
            node.setAttribute('material-overrides', '{}');
            expectAuthored('an empty mapping behaves as absent');

            node.materialOverrides = { 'name:CarPaint': 'candy-red' };
            node.setAttribute('material-overrides', '{not json');
            expectAuthored('malformed JSON must not leave a stale mapping in force');
            warnings.expect("pc-node 'Body' material-overrides is not valid JSON");

            node.setAttribute('material-overrides', '["candy-red"]');
            expectAuthored('an array is not a mapping');
            warnings.expect("pc-node 'Body' material-overrides must be a JSON object");
            expect(uncaught.seen).toEqual([]);
        });

        it('restores the old node on retarget and applies to the new one', async () => {
            const { authored, meshInstances, model, node, replacements } = await bootAuthored();

            node.setAttribute('material-overrides', '{"name:CarPaint": "candy-red"}');
            node.setAttribute('name', 'Trim');

            expect(meshInstances()[0].material, 'the old node reads as authored again').toBe(authored[0]);
            const trim = (model.entity!.findByName('Trim') as Entity).render!.meshInstances[0];
            expect(trim.material, 'the mapping now covers the new node').toBe(replacements.candyRed);
            expect(uncaught.seen).toEqual([]);
        });

        it('restores the authored materials when the element is removed', async () => {
            const { authored, meshInstances, node } = await bootAuthored();

            node.setAttribute('material-overrides', '{"name:CarPaint": "candy-red"}');
            node.remove();

            meshInstances().forEach((meshInstance, slot) => {
                expect(meshInstance.material, `slot ${slot} survives the element`).toBe(authored[slot]);
            });
            expect(uncaught.seen).toEqual([]);
        });

        it('captures a fresh baseline and reapplies across a model reload', async () => {
            const { meshInstances, model, node, replacements } = await bootBody(
                `name="Body" material-overrides='{"name:CarPaint": "candy-red"}'`
            );
            const before = meshInstances();

            model.setAttribute('asset', 'body');
            await readyWithin(model);
            await readyWithin(node);

            const after = meshInstances();
            expect(after[0], 'the fresh hierarchy is new').not.toBe(before[0]);
            expect(after[0].material, 'the mapping reapplied to the fresh assignments').toBe(replacements.candyRed);
            expect(after[4].material).toBe(replacements.candyRed);
            expect(after[2].material.name, 'unmatched fresh assignments stay authored').toBe('Glass');
            expect(uncaught.seen).toEqual([]);
        });

        it('keeps a replacement across disable and re-enable without reapplication', async () => {
            const { meshInstances, node, replacements } = await bootBody(
                `name="Body" enabled="false" material-overrides='{"name:CarPaint": "candy-red"}'`
            );

            expect(meshInstances()[0].material, 'applied while disabled').toBe(replacements.candyRed);
            node.enabled = null;
            expect(meshInstances()[0].material, 'still in place once enabled').toBe(replacements.candyRed);
            expect(uncaught.seen).toEqual([]);
        });

        it('freezes the property mapping and does not reflect it to the attribute', async () => {
            const { node, replacements, meshInstances } = await bootAuthored();

            const mapping: Record<string, string> = { 'name:CarPaint': 'candy-red' };
            node.materialOverrides = mapping;
            mapping['name:Glass'] = 'smoked-glass';

            expect(node.materialOverrides, 'later caller mutation is invisible').toEqual({
                'name:CarPaint': 'candy-red'
            });
            expect(Object.isFrozen(node.materialOverrides)).toBe(true);
            expect(node.hasAttribute('material-overrides'), 'property writes do not reflect').toBe(false);
            expect(meshInstances()[2].material, 'the mutated-in rule never applied').not.toBe(
                replacements.smokedGlass
            );
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('diagnostics', () => {
        it('warns per invalid rule and applies the rest of the mapping', async () => {
            const { authored, meshInstances, node, replacements } = await bootAuthored();

            node.materialOverrides = {
                CarPaint: 'candy-red',
                'name:': 'candy-red',
                'index:x': 'candy-red',
                'index:-1': 'candy-red',
                'name:Glass': 'smoked-glass'
            };

            warnings.expect("pc-node 'Body' material-overrides 'CarPaint' has no 'name:' or 'index:' prefix");
            warnings.expect("pc-node 'Body' material-overrides 'name:' selector is empty");
            warnings.expect("pc-node 'Body' material-overrides 'index:x' is not a non-negative integer");
            warnings.expect("pc-node 'Body' material-overrides 'index:-1' is not a non-negative integer");
            expect(meshInstances()[2].material, 'the valid rule still applied').toBe(replacements.smokedGlass);
            expect(meshInstances()[0].material, 'invalid rules changed nothing').toBe(authored[0]);
            expect(uncaught.seen).toEqual([]);
        });

        it('warns on a non-string replacement id, an out-of-range index and an unmatched name', async () => {
            const { authored, meshInstances, node } = await bootAuthored();

            node.materialOverrides = {
                'index:0': 42,
                'index:9': 'candy-red',
                'name:Chrome': 'candy-red'
            } as unknown as Record<string, string>;

            warnings.expect("pc-node 'Body' material-overrides 'index:0' needs a pc-material id");
            warnings.expect("pc-node 'Body' material-overrides 'index:9' is out of range - 5 assignment(s)");
            warnings.expect(
                "pc-node 'Body' material-overrides 'name:Chrome' matches no assignment - baseline names: " +
                    "'CarPaint', 'Untitled', 'Glass', 'defaultGlbMaterial', 'CarPaint'"
            );
            meshInstances().forEach((meshInstance, slot) => {
                expect(meshInstance.material, `slot ${slot} untouched`).toBe(authored[slot]);
            });
            expect(uncaught.seen).toEqual([]);
        });

        it('warns and does nothing on a node without an authored render component, decorations aside', async () => {
            const booted = await bootApp(
                `${PRELUDE}<pc-model asset="body">
                    <pc-node name="Mount"><pc-render type="box"></pc-render></pc-node>
                </pc-model>`
            );
            const node = booted.get<NodeElement>('pc-node');
            const decoration = node.querySelector('pc-render')!;

            node.materialOverrides = { 'name:CarPaint': 'candy-red' };

            warnings.expect(
                "pc-node 'Mount' is bound to a node without an authored render component - material-overrides ignored"
            );
            const decorated = node.entity!.render!.meshInstances[0];
            expect(decorated.material.name, 'the decoration-owned component is never a target').not.toBe(
                'candy-red'
            );
            expect(decoration.isConnected).toBe(true);
            expect(booted.get<ModelElement>('pc-model').contentEntity).toBeTruthy();
            expect(uncaught.seen).toEqual([]);
        });

        it('takes the last of duplicate JSON keys, as JSON.parse defines', async () => {
            const { meshInstances, node, replacements } = await bootAuthored();

            node.setAttribute('material-overrides', '{"index:0": "candy-red", "index:0": "smoked-glass"}');

            expect(meshInstances()[0].material).toBe(replacements.smokedGlass);
            expect(uncaught.seen).toEqual([]);
        });

        it('does not react to a pc-material inserted later, but a mapping retry resolves it', async () => {
            const { appElement, authored, meshInstances, node } = await bootAuthored();

            const late = document.createElement('pc-material') as MaterialElement;
            late.id = 'late';
            appElement.appendChild(late);
            node.materialOverrides = { 'name:Glass': 'late' };

            warnings.expect("pc-node 'Body' material-overrides could not resolve pc-material 'late'");
            expect(meshInstances()[2].material, 'unresolved leaves the baseline in force').toBe(authored[2]);

            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            expect(meshInstances()[2].material, 'insertion alone changes nothing').toBe(authored[2]);

            node.materialOverrides = { 'name:Glass': 'late' };
            expect(meshInstances()[2].material, 'the retry resolves the id').toBe(late.material);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('discovery', () => {
        it('reports replacements through hierarchy() by their material names', async () => {
            const { model, node } = await bootAuthored();

            expect(model.hierarchy()!.materials.map((slot) => slot.name)).toEqual([
                'CarPaint',
                'Untitled',
                'Glass',
                'defaultGlbMaterial',
                'CarPaint'
            ]);

            node.materialOverrides = { 'name:CarPaint': 'candy-red', 'name:Glass': 'smoked-glass' };

            // The id is a reference key, never a label: a replacement whose pc-material carries
            // a name attribute reports it, and one without reads the engine default - label the
            // materials that should be identifiable in hierarchy() output.
            expect(model.hierarchy()!.materials.map((slot) => slot.name)).toEqual([
                'Candy Red',
                'Untitled',
                'Untitled',
                'defaultGlbMaterial',
                'Candy Red'
            ]);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('skinning', () => {
        it('swaps the material of a skinned mesh instance without touching its skin instance', async () => {
            const booted = await bootApp(
                `${PRELUDE}<pc-model asset="skinned"><pc-node name="Skinny"></pc-node></pc-model>`
            );
            const node = booted.get<NodeElement>('pc-node');
            const candyRed = booted.get<MaterialElement>('pc-material[id="candy-red"]').material!;
            const meshInstance = node.entity!.render!.meshInstances[0];
            const skinInstance = meshInstance.skinInstance;
            expect(skinInstance, 'the fixture really is skinned').toBeTruthy();

            node.materialOverrides = { 'name:Skin': 'candy-red' };
            expect(meshInstance.material).toBe(candyRed);
            expect(meshInstance.skinInstance, 'the swap preserves the skin instance').toBe(skinInstance);

            node.materialOverrides = null;
            expect(meshInstance.material.name, 'restored').toBe('Skin');
            expect(meshInstance.skinInstance).toBe(skinInstance);
            expect(uncaught.seen).toEqual([]);
        });
    });
});
