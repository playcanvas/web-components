import type { AppBase, Entity } from 'playcanvas';
import { AnimTrack } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../../src/asset';
import type { AnimClipElement } from '../../../src/components/anim-clip';
import type { AnimComponentElement } from '../../../src/components/anim-component';
import type { ModelElement } from '../../../src/model';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';
import { parkLoads } from '../../helpers/loader';
import { expectNeverReady, readyWithin } from '../../helpers/ready';

/**
 * An animated glTF: one node, one 1-second translation channel per clip, built as a data: URI so
 * no I/O is involved (the buffer goes through btoa: the test tsconfig deliberately carries no
 * node types, so Buffer is unavailable). Clips move the node along a direction determined by
 * their index — even clips lift +Y, odd clips push +X — so a pose sample identifies which clip
 * is driving the node.
 */
const times = new Float32Array([0, 1]);
const lift = new Float32Array([0, 0, 0, 0, 2, 0]);
const push = new Float32Array([0, 0, 0, 2, 0, 0]);
const animData = new Float32Array([...times, ...lift, ...push]);
const animDataBase64 = btoa(String.fromCharCode(...new Uint8Array(animData.buffer)));

const animatedSrc = (...clipNames: string[]) => `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'bone' }],
    ...(clipNames.length > 0 ? {
        animations: clipNames.map((name, index) => ({
            name,
            channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
            samplers: [{ input: 0, output: 1 + (index % 2) }]
        })),
        accessors: [
            { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
            { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
            { bufferView: 2, componentType: 5126, count: 2, type: 'VEC3' }
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 8 },
            { buffer: 0, byteOffset: 8, byteLength: 24 },
            { buffer: 0, byteOffset: 32, byteLength: 24 }
        ],
        buffers: [
            { uri: `data:application/octet-stream;base64,${animDataBase64}`, byteLength: 56 }
        ]
    } : {})
}))}`;

const WALK_RUN_IDLE = `<pc-asset id="m" type="container" src="${animatedSrc('Walk', 'Run', 'Idle')}"></pc-asset>`;

/** The animated node's local position - the pose the assertions sample. */
const bonePosition = (app: AppBase) => (app.root.findByName('bone') as Entity).getLocalPosition();

describe('<pc-anim>', () => {
    const { uncaught, warnings } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    describe('#component', () => {
        it('creates the anim component with the engine defaults', async () => {
            // A bare pc-anim outside a pc-model is an empty component driven through the JS
            // API - deliberately silent, like a pc-sound with no slots
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');
            const component = anim.component!;

            expect(component).toBeDefined();
            expect(component.activate).toBe(true);
            expect(component.speed).toBe(1);
            expect(component.playing).toBe(false);
            expect(component.baseLayer).toBeNull();
            expect(anim.clips).toEqual([]);
        });
    });

    describe('attributes', () => {
        it('applies declarative attributes through the initial component data', async () => {
            const { get } = await bootApp(
                '<pc-entity name="e"><pc-anim activate="false" speed="2" transition-time="0.5"></pc-anim></pc-entity>'
            );
            const anim = get<AnimComponentElement>('pc-anim');

            expect(anim.component!.activate).toBe(false);
            expect(anim.component!.speed).toBe(2);
            expect(anim.transitionTime).toBe(0.5);
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            anim.setAttribute('activate', 'false');
            anim.setAttribute('speed', '3');
            anim.setAttribute('transition-time', '0.25');

            expect(anim.component!.activate).toBe(false);
            expect(anim.component!.speed).toBe(3);
            expect(anim.transitionTime).toBe(0.25);
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            anim.setAttribute('activate', 'false');
            anim.setAttribute('speed', '3');
            anim.setAttribute('transition-time', '0.25');
            anim.setAttribute('clip', '');
            anim.removeAttribute('activate');
            anim.removeAttribute('speed');
            anim.removeAttribute('transition-time');
            anim.removeAttribute('clip');

            expect(anim.component!.activate).toBe(true);
            expect(anim.component!.speed).toBe(1);
            expect(anim.transitionTime).toBe(0);
            expect(anim.clip).toBe('');
        });

        it('falls back to the default and warns once per invalid value', async () => {
            const { get } = await bootApp(
                '<pc-entity name="e"><pc-anim speed="fast" transition-time="soon"></pc-anim></pc-entity>'
            );
            const anim = get<AnimComponentElement>('pc-anim');

            warnings.expect("Invalid value 'fast' for attribute 'speed'. Expected a finite number. Using '1'.");
            warnings.expect("Invalid value 'soon' for attribute 'transition-time'. Expected a finite number. Using '0'.");

            expect(anim.component!.speed).toBe(1);
            expect(anim.transitionTime).toBe(0);
        });
    });

    describe('auto-assign from the enclosing model', () => {
        it('assigns every clip of the model, first clip playing', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m"><pc-anim></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));
            expect(anim.component!.playing).toBe(true);

            expect(bonePosition(app).y).toBe(0);
            step(0.5);
            // Walk is container index 0, so it lifts +Y
            expect(bonePosition(app).y).toBeGreaterThan(0);
            expect(bonePosition(app).x).toBe(0);
        });

        it('warns when the enclosing model has no animations', async () => {
            const { get } = await bootApp(`
                <pc-asset id="still" type="container" src="${animatedSrc()}"></pc-asset>
                <pc-model asset="still"><pc-anim></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            await vi.waitFor(() => warnings.expect("pc-anim - model 'still' has no animations"));
            expect(anim.clips).toEqual([]);
        });

        it('re-assigns from the new container when the model asset swaps', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Jump')}"></pc-asset>
                <pc-model asset="m"><pc-anim></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));

            // The host's readiness cycle owns the refresh; the model-ready listener must not run
            // a second one. Each track resolving exactly once is the observable difference.
            const assign = vi.spyOn(anim.component!, 'assignAnimation');

            get<ModelElement>('pc-model').setAttribute('asset', 'm2');

            await vi.waitFor(() => expect(anim.clips).toEqual(['Jump']));
            expect(assign, 'the swap assigned the new container track exactly once').toHaveBeenCalledTimes(1);
            step(0.5);
            expect(bonePosition(app).y).toBeGreaterThan(0);
            expect(uncaught.seen).toEqual([]);
        });

        it('restores the active clip and playhead across a swap whose clip names survive', async () => {
            const { get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Walk', 'Run')}"></pc-asset>
                <pc-model asset="m"><pc-anim clip="Run"></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));
            step(0.3);
            const layer = anim.component!.baseLayer!;
            expect(layer.activeState).toBe('Run');
            const time = layer.activeStateCurrentTime;
            expect(time).toBeGreaterThan(0);

            get<ModelElement>('pc-model').setAttribute('asset', 'm2');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run']));

            const restored = anim.component!.baseLayer!;
            expect(restored.activeState, 'the surviving selection is restored').toBe('Run');
            // The app ticks on rAF between the capture and this read, so the playhead has moved
            // on a little - but a dropped restore would have reset it to (near) zero.
            expect(restored.activeStateCurrentTime, 'the interrupted playhead carried over').toBeGreaterThanOrEqual(time);
            expect(uncaught.seen).toEqual([]);
        });

        it('keeps the component on the model host under legacy wrapper markup', async () => {
            // The arrangement that predates the model host: a wrapper entity that only supplied
            // the transform. The component now attaches to the model's host rather than the
            // wrapper, and playback is unchanged.
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-entity name="legacy"><pc-model asset="m"><pc-anim></pc-anim></pc-model></pc-entity>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));

            const model = get<ModelElement>('pc-model');
            expect(anim.component!.entity, 'the component landed on the model host').toBe(model.entity);
            expect((app.root.findByName('legacy') as Entity).anim, 'not on the wrapper').toBeUndefined();

            step(0.5);
            expect(bonePosition(app).y).toBeGreaterThan(0);
        });

        it('skips container tracks the engine cannot host, naming each', async () => {
            const { get } = await bootApp(`
                <pc-asset id="odd" type="container" src="${animatedSrc('Walk', 'Walk', 'bad.name')}"></pc-asset>
                <pc-model asset="odd"><pc-anim></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk']));
            warnings.expect("pc-anim - duplicate track name 'Walk' - track skipped");
            warnings.expect("pc-anim - track 'bad.name' - '.' in a clip name is reserved for blend tree paths - track skipped");
        });
    });

    describe('declared clips', () => {
        it('assigns only the declared clips, first declared active', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            expect(anim.clips).toEqual(['Walk', 'Run']);
            expect(anim.component!.baseLayer!.activeState === 'Walk' || anim.component!.baseLayer!.activeState === 'START').toBe(true);

            step(0.5);
            // Walk lifts +Y; Run would push +X
            expect(bonePosition(app).y).toBeGreaterThan(0);
            expect(bonePosition(app).x).toBe(0);
        });

        it('plays the clip declared by the clip attribute from boot', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim clip="Run">
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            expect(anim.component!.baseLayer!.activeState).toBe('Run');
            step(0.5);
            // Run is container index 1, so it pushes +X
            expect(bonePosition(app).x).toBeGreaterThan(0);
            expect(bonePosition(app).y).toBe(0);
        });

        it('resolves clips from an explicit asset beside the model', async () => {
            // The clip references the container itself rather than riding the implicit source -
            // the arrangement used when clips live in a library asset separate from the skeleton.
            // The wrapper is deliberate: it pins the sibling-model/outer-host path, where the
            // component's host is the enclosing entity rather than the model.
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-entity name="holder">
                    <pc-model asset="m"></pc-model>
                    <pc-anim>
                        <pc-anim-clip name="Run" asset="m"></pc-anim-clip>
                    </pc-anim>
                </pc-entity>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            expect(anim.clips).toEqual(['Run']);
            step(0.5);
            expect(bonePosition(app).x).toBeGreaterThan(0);
        });

        it('rebinds without reassigning when a sibling model swaps its content', async () => {
            // A sibling model is not the component's host, so its readiness cycles must not
            // rebuild the clip set - the assigned tracks stand and only their curve bindings
            // re-resolve against the new hierarchy.
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Jump')}"></pc-asset>
                <pc-entity name="holder">
                    <pc-model asset="m"></pc-model>
                    <pc-anim>
                        <pc-anim-clip name="Run" asset="m"></pc-anim-clip>
                    </pc-anim>
                </pc-entity>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            expect(anim.clips).toEqual(['Run']);

            const assign = vi.spyOn(anim.component!, 'assignAnimation');
            const rebind = vi.spyOn(anim.component!, 'rebind');

            get<ModelElement>('pc-model').setAttribute('asset', 'm2');
            await readyWithin(get<ModelElement>('pc-model'));

            expect(rebind, 'the sibling cycle rebinds').toHaveBeenCalled();
            expect(assign, 'without touching the clip set').not.toHaveBeenCalled();
            expect(anim.clips).toEqual(['Run']);

            step(0.5);
            expect(bonePosition(app).x, 'the old track drives the new content').toBeGreaterThan(0);
        });

        it('clears the managed binding root when a second model makes the skeleton ambiguous', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Jump')}"></pc-asset>
                <pc-entity name="holder">
                    <pc-model asset="m"></pc-model>
                    <pc-anim>
                        <pc-anim-clip name="Run" asset="m"></pc-anim-clip>
                    </pc-anim>
                </pc-entity>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            const model = get<ModelElement>('pc-model');
            expect(anim.component!.rootBone, 'the sole sibling model pins the root').toBe(model.entity);

            // A second sibling model leaves no single skeleton to pin - the stale pin must not
            // survive, or curves would keep binding against whichever model happened to be first.
            const second = document.createElement('pc-model');
            second.setAttribute('asset', 'm2');
            model.parentElement!.appendChild(second);
            await readyWithin(second);

            expect(anim.component!.rootBone, 'the ambiguous source clears the pin').toBeNull();
        });

        it('leaves a binding root assigned through the engine API alone', async () => {
            const { app, get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Jump')}"></pc-asset>
                <pc-entity name="holder"><pc-model asset="m"><pc-anim></pc-anim></pc-model></pc-entity>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            const model = get<ModelElement>('pc-model');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));
            expect(anim.component!.rootBone).toBe(model.entity);

            const custom = app.root.findByName('holder') as Entity;
            anim.component!.rootBone = custom;

            model.setAttribute('asset', 'm2');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Jump']));

            expect(anim.component!.rootBone, "the user's choice outranks the managed default").toBe(custom);
        });

        it('resolves animation and animclip typed assets', async () => {
            // A data: URI cannot reach the engine's GLB animation parser (it keys off the .glb
            // extension), so the multi-track 'animation' shape is produced directly: a lazy
            // asset populated with real AnimTracks before anything resolves it
            const { appElement, get } = await bootApp(`
                <pc-asset id="fly" type="animation" src="unused.json" lazy></pc-asset>
                <pc-asset id="roll" type="animclip" src="unused.json" lazy></pc-asset>
                <pc-entity name="e"></pc-entity>
            `);

            const flyAsset = (document.querySelector('pc-asset[id="fly"]') as AssetElement).asset!;
            flyAsset.resources = [new AnimTrack('Fly', 1, [], [], []), new AnimTrack('Swim', 1, [], [], [])];
            flyAsset.loaded = true;

            const rollAsset = (document.querySelector('pc-asset[id="roll"]') as AssetElement).asset!;
            rollAsset.resource = new AnimTrack('Roll', 1, [], [], []);
            rollAsset.loaded = true;

            const entity = get('pc-entity');
            const anim = document.createElement('pc-anim');
            anim.innerHTML = `
                <pc-anim-clip name="Swim" asset="fly"></pc-anim-clip>
                <pc-anim-clip name="Roll" asset="roll"></pc-anim-clip>
            `;
            entity.appendChild(anim);
            await readyWithin(anim);
            await Promise.all(Array.from(anim.children).map((clip) => readyWithin(clip as AnimClipElement)));

            expect(anim.clips).toEqual(['Swim', 'Roll']);
            expect(appElement.isConnected).toBe(true);
        });

        it('falls back to the first track with a warning when no name matches', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim activate="false">
                        <pc-anim-clip name="Dive"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            warnings.expect(
                "pc-anim-clip 'Dive' - no track named 'Dive' in model 'm' - using 'Walk' (available: Walk, Run, Idle)"
            );
            expect(anim.clips).toEqual(['Dive']);
        });
    });

    describe('clip switching', () => {
        const DECLARED = `
            ${WALK_RUN_IDLE}
            <pc-model asset="m">
                <pc-anim>
                    <pc-anim-clip name="Walk"></pc-anim-clip>
                    <pc-anim-clip name="Run"></pc-anim-clip>
                </pc-anim>
            </pc-model>
        `;

        it('switches clips with a hard cut when the clip attribute changes', async () => {
            const { app, get, step } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');

            anim.setAttribute('clip', 'Run');

            expect(anim.component!.baseLayer!.activeState).toBe('Run');
            step(0.5);
            expect(bonePosition(app).x).toBeGreaterThan(0);
        });

        it('cross-fades when transition-time is set', async () => {
            const { get, step } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');
            step(0.1);

            anim.setAttribute('transition-time', '0.5');
            anim.setAttribute('clip', 'Run');

            const layer = anim.component!.baseLayer!;
            expect(layer.activeState).toBe('Run');
            step(0.1);
            expect(layer.transitioning).toBe(true);
        });

        it('warns once and keeps the current clip for an unknown name', async () => {
            const { get } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');

            anim.setAttribute('clip', 'Nope');
            anim.setAttribute('clip', '');
            anim.setAttribute('clip', 'Nope');

            warnings.expect("pc-anim has no clip named 'Nope' - selection unchanged");
            expect(anim.component!.baseLayer!.activeState).not.toBe('Nope');
        });

        it('keeps playing when the clip attribute is removed', async () => {
            const { get } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');
            anim.setAttribute('clip', 'Run');

            anim.removeAttribute('clip');

            expect(anim.clip).toBe('');
            expect(anim.component!.playing).toBe(true);
            expect(anim.component!.baseLayer!.activeState).toBe('Run');
        });

        it('play and pause freeze and resume the pose', async () => {
            const { app, get, step } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');

            step(0.25);
            const frozen = bonePosition(app).y;
            expect(frozen).toBeGreaterThan(0);

            anim.pause();
            expect(anim.component!.playing).toBe(false);
            step(0.25);
            expect(bonePosition(app).y).toBe(frozen);

            anim.play();
            step(0.25);
            expect(bonePosition(app).y).toBeGreaterThan(frozen);
        });

        it('play(name) hard-cuts, transition(name) cross-fades, unknown names are ignored', async () => {
            const { get, step } = await bootApp(DECLARED);
            const anim = get<AnimComponentElement>('pc-anim');
            const layer = anim.component!.baseLayer!;
            step(0.1);

            anim.play('Run');
            expect(layer.activeState).toBe('Run');

            anim.transition('Walk', 0.2);
            step(0.05);
            expect(layer.activeState).toBe('Walk');
            expect(layer.transitioning).toBe(true);

            anim.play('Nope');
            anim.transition('Nope');
            expect(layer.activeState).toBe('Walk');
        });

        it('defers playback until play() when activate is false', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim activate="false" clip="Run">
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            expect(anim.component!.playing).toBe(false);
            step(0.5);
            expect(bonePosition(app).x).toBe(0);
            expect(bonePosition(app).y).toBe(0);

            anim.play();
            step(0.5);
            // The declared selection was pre-positioned while paused, so play() resumes Run
            expect(bonePosition(app).x).toBeGreaterThan(0);
            expect(bonePosition(app).y).toBe(0);
        });
    });

    describe('dynamic clip changes', () => {
        const WALK_ONLY = `
            ${WALK_RUN_IDLE}
            <pc-model asset="m">
                <pc-anim>
                    <pc-anim-clip name="Walk"></pc-anim-clip>
                </pc-anim>
            </pc-model>
        `;

        it('appends a clip without interrupting the active one', async () => {
            const { get, step } = await bootApp(WALK_ONLY);
            const anim = get<AnimComponentElement>('pc-anim');
            // The first tick is consumed by the START transition (the engine resets its state
            // time entering the clip), so the playhead only reads non-zero from the second on
            step(0.25);
            step(0.25);
            const layer = anim.component!.baseLayer!;
            const before = layer.activeStateCurrentTime;
            expect(before).toBeGreaterThan(0);

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Run');
            anim.appendChild(clip);
            await readyWithin(clip);

            expect(anim.clips).toEqual(['Walk', 'Run']);
            expect(layer.activeState).toBe('Walk');
            expect(layer.activeStateCurrentTime).toBeGreaterThanOrEqual(before);
        });

        it('replaces an auto-assigned set with declared children', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m"><pc-anim></pc-anim></pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Run');
            anim.appendChild(clip);

            await vi.waitFor(() => expect(anim.clips).toEqual(['Run']));
        });

        it('rebuilds on removal, flipping back to auto-assign after the last child', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            const [walk, run] = Array.from(anim.children) as AnimClipElement[];

            run.remove();
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk']));

            walk.remove();
            // No declared children left inside a pc-model: the element auto-assigns again
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk', 'Run', 'Idle']));
        });

        it('preserves a pause and its playhead across a rebuild', async () => {
            const { app, get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            // Two steps: the first tick is consumed by the START transition
            step(0.25);
            step(0.25);
            anim.pause();
            const time = anim.component!.baseLayer!.activeStateCurrentTime;
            expect(time).toBeGreaterThan(0);

            // Rebuild while paused: remove the inactive clip
            (anim.children[1] as AnimClipElement).remove();
            await vi.waitFor(() => expect(anim.clips).toEqual(['Walk']));

            expect(anim.component!.playing).toBe(false);
            expect(anim.component!.baseLayer!.activeState).toBe('Walk');
            expect(anim.component!.baseLayer!.activeStateCurrentTime).toBeCloseTo(time, 5);

            const held = bonePosition(app).y;
            step(0.25);
            expect(bonePosition(app).y).toBe(held);

            anim.play();
            step(0.25);
            expect(bonePosition(app).y).toBeGreaterThan(held);
        });

        it('falls back to the next clip when the active one is removed', async () => {
            const { get, step } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                        <pc-anim-clip name="Run"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            step(0.1);
            expect(anim.component!.baseLayer!.activeState).toBe('Walk');

            (anim.children[0] as AnimClipElement).remove();
            await vi.waitFor(() => expect(anim.clips).toEqual(['Run']));

            step(0.1);
            expect(anim.component!.baseLayer!.activeState).toBe('Run');
        });

        it('renames a clip in place', async () => {
            const { app, get, step } = await bootApp(`
                <pc-asset id="solo" type="container" src="${animatedSrc('Walk')}"></pc-asset>
                <pc-model asset="solo">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            const clip = anim.children[0] as AnimClipElement;

            clip.setAttribute('name', 'Trot');
            await readyWithin(clip);

            // A single-track source supplies its track whatever the clip is named
            expect(anim.clips).toEqual(['Trot']);
            step(0.5);
            expect(bonePosition(app).y).toBeGreaterThan(0);
        });

        it('applies a speed change live, preserving the playhead', async () => {
            const { get, step } = await bootApp(WALK_ONLY);
            const anim = get<AnimComponentElement>('pc-anim');
            const clip = anim.children[0] as AnimClipElement;
            const layer = anim.component!.baseLayer!;
            // Two steps: the first tick is consumed by the START transition
            step(0.25);
            step(0.25);
            const before = layer.activeStateCurrentTime;
            expect(before).toBeGreaterThan(0);

            clip.setAttribute('speed', '2');

            expect(layer.activeStateCurrentTime).toBeCloseTo(before, 5);
            step(0.25);
            expect(layer.activeStateCurrentTime).toBeGreaterThan(before);
        });

        it('clamps and holds the last pose of a non-looping clip', async () => {
            const { app, get, step } = await bootApp(`
                <pc-asset id="solo" type="container" src="${animatedSrc('Walk')}"></pc-asset>
                <pc-model asset="solo">
                    <pc-anim>
                        <pc-anim-clip name="Walk" loop="false"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            step(2);
            step(2);

            const layer = anim.component!.baseLayer!;
            expect(layer.activeStateCurrentTime).toBe(layer.activeStateDuration);
            expect(bonePosition(app).y).toBeCloseTo(2, 5);

            // The engine reports no completion: the state holds and playing stays true
            expect(anim.component!.playing).toBe(true);
            step(2);
            expect(bonePosition(app).y).toBeCloseTo(2, 5);
        });
    });

    describe('inside pc-node', () => {
        it('reapplies clips when the hosting node rebinds after a model swap', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-asset id="m2" type="container" src="${animatedSrc('Jump')}"></pc-asset>
                <pc-model asset="m">
                    <pc-node name="bone">
                        <pc-anim>
                            <pc-anim-clip name="Run" asset="m"></pc-anim-clip>
                        </pc-anim>
                    </pc-node>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');
            expect(anim.clips).toEqual(['Run']);
            const firstComponent = anim.component!;

            get<ModelElement>('pc-model').setAttribute('asset', 'm2');

            // The node rebinds to the new hierarchy, cycling the host: the component is
            // recreated and the declared clips reapply to it
            await vi.waitFor(() => {
                expect(anim.component).toBeDefined();
                expect(anim.component).not.toBe(firstComponent);
                expect(anim.clips).toEqual(['Run']);
            });
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('clip validation', () => {
        it('warns and stays unassigned for a clip whose asset id resolves to nothing', async () => {
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Walk');
            clip.setAttribute('asset', 'nope');
            anim.appendChild(clip);
            await settleTask();

            warnings.expect("pc-anim-clip 'Walk' could not find asset 'nope' - clip not assigned");
            await expectNeverReady(clip);
        });

        it('warns and stays unassigned for a clip with no asset and no enclosing model', async () => {
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Walk');
            anim.appendChild(clip);
            await settleTask();

            warnings.expect("pc-anim-clip 'Walk' has no asset and no enclosing pc-model - clip not assigned");
            await expectNeverReady(clip);
        });

        it('rejects empty, dotted and duplicate clip names', async () => {
            const { get } = await bootApp(`
                ${WALK_RUN_IDLE}
                <pc-model asset="m">
                    <pc-anim>
                        <pc-anim-clip name="Walk"></pc-anim-clip>
                    </pc-anim>
                </pc-model>
            `);
            const anim = get<AnimComponentElement>('pc-anim');

            const unnamed = document.createElement('pc-anim-clip');
            const dotted = document.createElement('pc-anim-clip');
            dotted.setAttribute('name', 'a.b');
            const duplicate = document.createElement('pc-anim-clip');
            duplicate.setAttribute('name', 'Walk');
            anim.append(unnamed, dotted, duplicate);
            await settleTask();

            warnings.expect('pc-anim-clip must have a name - clip not assigned');
            warnings.expect("pc-anim-clip 'a.b' - '.' in a clip name is reserved for blend tree paths - clip not assigned");
            warnings.expect("pc-anim-clip 'Walk' - an earlier clip already uses this name - clip not assigned");
            expect(anim.clips).toEqual(['Walk']);
            await expectNeverReady(duplicate);
        });
    });

    describe('clip source races', () => {
        it("assigns only the newest source's track when a superseded load settles later", async () => {
            const { app, get } = await bootApp(`
                <pc-asset id="clip-a" type="animclip" src="clip-a.json" lazy></pc-asset>
                <pc-asset id="clip-b" type="animclip" src="clip-b.json" lazy></pc-asset>
                <pc-entity name="e"><pc-anim activate="false"></pc-anim></pc-entity>
            `);
            const parked = parkLoads(app);
            const anim = get<AnimComponentElement>('pc-anim');

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Move');
            clip.setAttribute('asset', 'clip-a');
            anim.appendChild(clip);
            await settleTask();
            expect(parked.has('clip-a.json'), 'the pending source started its load').toBe(true);

            clip.setAttribute('asset', 'clip-b');
            expect(parked.has('clip-b.json')).toBe(true);

            // B settles first, then A - the superseded source must not hand over its track
            const assign = vi.spyOn(anim.component!, 'assignAnimation');
            parked.get('clip-b.json')!(null, new AnimTrack('TrackB', 1, [], [], []));
            await readyWithin(clip);
            const afterB = assign.mock.calls.length;
            expect(afterB).toBeGreaterThan(0);
            expect((assign.mock.calls[afterB - 1][1] as AnimTrack).name, 'the newest source supplied the track').toBe('TrackB');

            parked.get('clip-a.json')!(null, new AnimTrack('TrackA', 1, [], [], []));
            expect(assign.mock.calls.length, 'the superseded source assigned nothing').toBe(afterB);
            expect(uncaught.seen).toEqual([]);
        });

        it('warns without throwing for a source whose load already failed', async () => {
            const { get } = await bootApp(`
                <pc-asset id="broken" type="container" src="broken.glb" lazy></pc-asset>
                <pc-entity name="e"><pc-anim></pc-anim></pc-entity>
            `);
            // The failed shape: the engine marks a failed load `loaded` with no resource
            get<AssetElement>('pc-asset').asset!.loaded = true;

            const anim = get<AnimComponentElement>('pc-anim');
            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'Walk');
            clip.setAttribute('asset', 'broken');
            anim.appendChild(clip);
            await settleTask();

            warnings.expect("pc-anim-clip 'Walk' - asset 'broken' failed to load - clip not assigned");
            await expectNeverReady(clip);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('teardown', () => {
        it('does not throw when a clip is added and removed within the same task', async () => {
            const { get } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'blip');
            anim.appendChild(clip);
            clip.remove();

            await settleTask();

            expect(uncaught.seen).toEqual([]);
        });

        it('does not throw when the whole app is removed while a clip is connecting', async () => {
            const { get, unmount } = await bootApp('<pc-entity name="e"><pc-anim></pc-anim></pc-entity>');
            const anim = get<AnimComponentElement>('pc-anim');

            const clip = document.createElement('pc-anim-clip');
            clip.setAttribute('name', 'blip');
            anim.appendChild(clip);
            unmount();

            await settleTask();

            expect(uncaught.seen).toEqual([]);
        });
    });
});
