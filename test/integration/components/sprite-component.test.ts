import type { MeshInstance, SpriteComponent } from 'playcanvas';
import { AppBase, Color, Entity, LAYERID_WORLD, Sprite, Texture, TextureAtlasHandler } from 'playcanvas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../../src/asset';
import type { SpriteClipElement } from '../../../src/components/sprite-clip';
import type { SpriteComponentElement } from '../../../src/components/sprite-component';
import type { EntityElement } from '../../../src/entity';
import type { ModelElement } from '../../../src/model';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';
import { expectNeverReady, readyWithin } from '../../helpers/ready';

/** A 64 x 16 strip of four 16 x 16 frames, keyed `0` to `3` from left to right. */
const FRAMES = Object.fromEntries(
    [0, 1, 2, 3].map((index) => [String(index), { rect: [index * 16, 0, 16, 16], pivot: [0.5, 0.5], border: [0, 0, 0, 0] }])
);

/**
 * The atlas and the sprites cut from it: `strip` plays all four frames, `pair` the last two. jsdom
 * cannot decode the atlas image, so the atlas handler's load is replaced in `beforeEach` by one
 * that delivers a texture with the frames, as the engine's JSON atlas load does.
 */
const ASSETS = `
    <pc-asset id="atlas" type="textureatlas" src="atlas.png"></pc-asset>
    <pc-asset id="strip" type="sprite" atlas="atlas" frame-keys="0 1 2 3" pixels-per-unit="16"></pc-asset>
    <pc-asset id="pair" type="sprite" atlas="atlas" frame-keys="2 3" pixels-per-unit="16"></pc-asset>
`;

const scene = (spriteAttributes = '', clips = '') =>
    `${ASSETS}<pc-entity name="hero"><pc-sprite ${spriteAttributes}>${clips}</pc-sprite></pc-entity>`;

/** A looping four-frame walk at 4 fps (one second per loop) and a one-shot two-frame jump. */
const CLIPS = `
    <pc-sprite-clip name="walk" asset="strip" fps="4" loop></pc-sprite-clip>
    <pc-sprite-clip name="jump" asset="pair" fps="4"></pc-sprite-clip>
`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: SpriteComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute that needs no sprite asset to read back: the attribute, the engine
 * property behind it, a non-default value, what the engine must report for it, and the default
 * that removal must restore. Ordered by `observedAttributes`. [opacity] is covered on its own
 * below: the engine reports it as the color's alpha.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['color', 'color', '1 0 0', new Color(1, 0, 0, 1), new Color(1, 1, 1, 1)],
    ['flip-x', 'flipX', '', true, false],
    ['flip-y', 'flipY', '', true, false],
    ['height', 'height', '2', 2, 1],
    ['speed', 'speed', '2', 2, 1],
    ['type', 'type', 'animated', 'animated', 'simple'],
    ['width', 'width', '3', 3, 1]
];

/** The mesh instances the world layer draws. */
const worldMeshInstances = (app: AppBase): MeshInstance[] => app.scene.layers.getLayerById(LAYERID_WORLD)!.meshInstances;

/** The sprite component's mesh instance, which the engine creates once it has a frame to show. */
const meshInstance = (component: SpriteComponent) =>
    (component as unknown as { _meshInstance: MeshInstance | null })._meshInstance;

describe('<pc-sprite>', () => {
    const { uncaught, warnings } = useGuard();

    beforeEach(() => {
        vi.spyOn(TextureAtlasHandler.prototype, 'load').mockImplementation((_url, callback: (err: string | null, response?: unknown) => void) => {
            const texture = new Texture(AppBase.getApplication()!.graphicsDevice, { width: 64, height: 16 });
            queueMicrotask(() => callback(null, { texture, data: { frames: FRAMES } }));
        });
    });

    describe('#component', () => {
        it('creates the sprite component with the engine defaults', async () => {
            const { app, get } = await bootApp(scene());
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            // The engine assigns `type` from the creation data whether or not it is there, so a bare
            // sprite has to state the default to have one
            const engine = bare.addComponent('sprite', { type: 'simple' }) as SpriteComponent;

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
                expect.soft(engineValue(component, property), `${attribute} vs a bare engine sprite`).toEqual(engineValue(engine, property));
            }
            expect(component.opacity).toBe(engine.opacity);
            expect(component.frame).toBe(engine.frame);
            expect(component.spriteAsset).toBeNull();
            expect(component.sprite).toBeNull();
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases
                .map(([attribute, , value]) => (value === '' ? attribute : `${attribute}="${value}"`))
                .join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through and restores the default on removal', async () => {
            const { get } = await bootApp(scene());
            const sprite = get<SpriteComponentElement>('pc-sprite');

            for (const [attribute, property, value, expected, restored] of cases) {
                sprite.setAttribute(attribute, value);
                expect.soft(engineValue(sprite.component!, property), attribute).toEqual(expected);
                sprite.removeAttribute(attribute);
                expect.soft(engineValue(sprite.component!, property), `${attribute} removed`).toEqual(restored);
            }
        });

        it('writes opacity through, which the engine keeps in the color alpha', async () => {
            const { get } = await bootApp(scene('color="0 1 0" opacity="0.5"'));
            const sprite = get<SpriteComponentElement>('pc-sprite');

            expect(sprite.component!.opacity).toBe(0.5);
            expect(sprite.component!.color).toEqual(new Color(0, 1, 0, 0.5));

            sprite.removeAttribute('opacity');
            expect(sprite.component!.color).toEqual(new Color(0, 1, 0, 1));
        });
    });

    describe('[asset]', () => {
        it('renders the frame of the sprite asset it names', async () => {
            const { app, get } = await bootApp(scene('asset="strip" frame="2"'));
            const component = get<SpriteComponentElement>('pc-sprite').component!;
            const sprite = get<AssetElement>('pc-asset[id="strip"]').asset!.resource as Sprite;

            expect(sprite).toBeInstanceOf(Sprite);
            expect(component.sprite).toBe(sprite);
            expect(component.frame).toBe(2);
            expect(meshInstance(component)!.mesh).toBe(sprite.meshes[2]);
            expect(worldMeshInstances(app)).toContain(meshInstance(component));
        });

        it('renders a sprite whose atlas loads after the component exists', async () => {
            // Both lazy: the sprite loads when pc-sprite first uses it, and the atlas only then
            const { get } = await bootApp(scene('asset="strip"').replace(/><\/pc-asset>/g, ' lazy></pc-asset>'));
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            await vi.waitFor(() => expect(component.sprite?.atlas).toBeTruthy());
            expect(component.sprite).toBe(get<AssetElement>('pc-asset[id="strip"]').asset!.resource);
        });

        it('switches sprites at runtime, and clears the sprite on removal', async () => {
            const { app, get } = await bootApp(scene('asset="strip"'));
            const element = get<SpriteComponentElement>('pc-sprite');
            const component = element.component!;

            element.setAttribute('asset', 'pair');
            expect(component.sprite).toBe(get<AssetElement>('pc-asset[id="pair"]').asset!.resource);

            element.removeAttribute('asset');
            expect(component.sprite).toBeNull();
            expect(worldMeshInstances(app)).not.toContain(meshInstance(component));
        });

        it('warns once and clears the sprite for an id that names no asset', async () => {
            const { get } = await bootApp(scene('asset="strip"'));
            const element = get<SpriteComponentElement>('pc-sprite');

            element.setAttribute('asset', 'nope');
            warnings.expect("pc-sprite could not find asset 'nope' - sprite cleared");
            expect(element.component!.sprite).toBeNull();
        });

        it('clamps the frame to the frames the sprite has', async () => {
            const { get } = await bootApp(scene('asset="pair"'));
            const element = get<SpriteComponentElement>('pc-sprite');

            element.setAttribute('frame', '5');
            expect(element.component!.frame).toBe(1);
        });
    });

    describe('animated', () => {
        it('adds a clip for each child, with its rate, looping and sprite', async () => {
            const { get } = await bootApp(scene('type="animated"', CLIPS));
            const component = get<SpriteComponentElement>('pc-sprite').component!;
            const walk = get<SpriteClipElement>('pc-sprite-clip[name="walk"]');
            const jump = get<SpriteClipElement>('pc-sprite-clip[name="jump"]');

            expect(Object.keys(component.clips)).toEqual(['walk', 'jump']);
            expect(walk.spriteAnimationClip).toBe(component.clip('walk'));
            expect(walk.spriteAnimationClip!.fps).toBe(4);
            expect(walk.spriteAnimationClip!.loop).toBe(true);
            expect(walk.spriteAnimationClip!.sprite).toBe(get<AssetElement>('pc-asset[id="strip"]').asset!.resource);
            expect(jump.spriteAnimationClip!.loop).toBe(false);
            expect(jump.spriteAnimationClip!.sprite).toBe(get<AssetElement>('pc-asset[id="pair"]').asset!.resource);
        });

        it('plays the clip named by [clip], looping through its frames', async () => {
            const { get, step } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            expect(component.currentClip).toBe(component.clip('walk'));
            expect(component.currentClip.isPlaying).toBe(true);

            const frames = [];
            for (let i = 0; i < 4; i++) {
                step(0.3);
                frames.push(component.frame);
            }
            expect(frames, 'the fourth step wraps past the end of the one-second loop').toEqual([1, 2, 3, 0]);
        });

        it('plays nothing without a [clip]', async () => {
            const { get } = await bootApp(scene('type="animated"', CLIPS));
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            expect(component.clip('walk').isPlaying).toBe(false);
            expect(component.clip('jump').isPlaying).toBe(false);
        });

        it('switches clips when [clip] changes, and restarts an ended clip when set again', async () => {
            const { get, step } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');
            const component = element.component!;

            element.setAttribute('clip', 'jump');
            const jump = component.clip('jump');
            expect(component.currentClip).toBe(jump);
            expect(jump.isPlaying).toBe(true);
            expect(component.clip('walk').isPlaying).toBe(false);

            step(0.6);
            expect(jump.isPlaying, 'a one-shot clip stops at its end').toBe(false);
            expect(component.frame, 'and holds its last frame').toBe(1);

            element.clip = 'jump';
            expect(jump.isPlaying).toBe(true);
            expect(component.frame).toBe(0);
        });

        it('leaves the current clip playing when [clip] is removed', async () => {
            const { get } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');

            element.removeAttribute('clip');
            expect(element.component!.clip('walk').isPlaying).toBe(true);
        });

        it('plays a selected clip appended later, over the clip that is playing', async () => {
            const { get } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');

            const run = document.createElement('pc-sprite-clip');
            run.setAttribute('name', 'run');
            run.setAttribute('asset', 'strip');
            run.setAttribute('fps', '8');
            run.setAttribute('loop', '');
            element.appendChild(run);
            element.setAttribute('clip', 'run');
            await readyWithin(run);

            const component = element.component!;
            expect(component.currentClip).toBe(run.spriteAnimationClip);
            expect(component.currentClip.isPlaying).toBe(true);
        });

        it('stops and hides a playing clip whose element is removed', async () => {
            const { app, get } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const component = get<SpriteComponentElement>('pc-sprite').component!;
            const walk = get<SpriteClipElement>('pc-sprite-clip[name="walk"]');
            const engineClip = walk.spriteAnimationClip!;
            expect(worldMeshInstances(app)).toContain(meshInstance(component));

            walk.remove();

            expect(component.clip('walk')).toBeUndefined();
            expect(engineClip.isPlaying).toBe(false);
            expect(engineClip.sprite).toBeNull();
            expect(walk.spriteAnimationClip).toBeNull();
            expect(worldMeshInstances(app)).not.toContain(meshInstance(component));
        });

        it('re-keys a clip that is renamed', async () => {
            const { get } = await bootApp(scene('type="animated"', CLIPS));
            const component = get<SpriteComponentElement>('pc-sprite').component!;
            const walk = get<SpriteClipElement>('pc-sprite-clip[name="walk"]');

            walk.setAttribute('name', 'stride');

            expect(Object.keys(component.clips).sort()).toEqual(['jump', 'stride']);
            expect(component.clip('stride')).toBe(walk.spriteAnimationClip);
            await readyWithin(walk);
        });

        it('writes clip attribute changes through', async () => {
            const { get } = await bootApp(scene('type="animated"', CLIPS));
            const walk = get<SpriteClipElement>('pc-sprite-clip[name="walk"]');
            const engineClip = walk.spriteAnimationClip!;

            walk.setAttribute('fps', '12');
            walk.removeAttribute('loop');
            walk.setAttribute('asset', 'pair');

            expect(engineClip.fps).toBe(12);
            expect(engineClip.loop).toBe(false);
            expect(engineClip.sprite).toBe(get<AssetElement>('pc-asset[id="pair"]').asset!.resource);

            walk.removeAttribute('asset');
            expect(engineClip.sprite).toBeNull();
        });

        it('rejects a duplicate name until the clip holding it leaves', async () => {
            const { get } = await bootApp(scene('type="animated"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');
            const original = get<SpriteClipElement>('pc-sprite-clip[name="walk"]');

            const duplicate = document.createElement('pc-sprite-clip');
            duplicate.setAttribute('name', 'walk');
            duplicate.setAttribute('asset', 'pair');
            element.appendChild(duplicate);
            await vi.waitFor(() =>
                warnings.expect("pc-sprite-clip 'walk' - an earlier clip already uses this name - clip not added")
            );
            await expectNeverReady(duplicate);

            original.remove();
            await readyWithin(duplicate);
            expect(element.component!.clip('walk')).toBe(duplicate.spriteAnimationClip);
        });

        it('warns about a clip without a name', async () => {
            const { get } = await bootApp(scene('type="animated"'));

            const clip = document.createElement('pc-sprite-clip');
            get('pc-sprite').appendChild(clip);
            await vi.waitFor(() => warnings.expect('pc-sprite-clip must have a name - clip not added'));
            await expectNeverReady(clip);
        });

        it('waits for its entity to be enabled before playing', async () => {
            const { get } = await bootApp(scene('type="animated" clip="walk"', CLIPS).replace('name="hero"', 'name="hero" enabled="false"'));
            const component = get<SpriteComponentElement>('pc-sprite').component!;

            expect(component.clip('walk').isPlaying).toBe(false);

            get<EntityElement>('pc-entity').removeAttribute('enabled');
            expect(component.clip('walk').isPlaying).toBe(true);
        });

        it('plays the selected clip again when it is re-enabled', async () => {
            const { get } = await bootApp(scene('type="animated" clip="walk"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');

            element.setAttribute('enabled', 'false');
            expect(element.component!.clip('walk').isPlaying).toBe(false);

            element.removeAttribute('enabled');
            expect(element.component!.clip('walk').isPlaying).toBe(true);
        });

        it('starts the selected clip when the type switches to animated', async () => {
            const { get } = await bootApp(scene('clip="walk"', CLIPS));
            const element = get<SpriteComponentElement>('pc-sprite');
            const component = element.component!;

            expect(component.clip('walk').isPlaying, 'a simple sprite plays no clips').toBe(false);

            element.setAttribute('type', 'animated');
            expect(component.currentClip).toBe(component.clip('walk'));
            expect(component.currentClip.isPlaying).toBe(true);
        });
    });

    describe('inside pc-node', () => {
        it('re-adds its clips when the hosting node rebinds after a model swap', async () => {
            const model = (generator: string) =>
                `data:application/json,${encodeURIComponent(JSON.stringify({
                    asset: { version: '2.0', generator },
                    scene: 0,
                    scenes: [{ nodes: [0] }],
                    nodes: [{ name: 'socket' }]
                }))}`;
            const { get } = await bootApp(`
                ${ASSETS}
                <pc-asset id="m" type="container" src="${model('first')}"></pc-asset>
                <pc-asset id="m2" type="container" src="${model('second')}"></pc-asset>
                <pc-model asset="m">
                    <pc-node name="socket">
                        <pc-sprite type="animated" clip="walk">${CLIPS}</pc-sprite>
                    </pc-node>
                </pc-model>
            `);
            const element = get<SpriteComponentElement>('pc-sprite');
            const first = element.component!;

            get<ModelElement>('pc-model').setAttribute('asset', 'm2');

            await vi.waitFor(() => {
                expect(element.component).toBeTruthy();
                expect(element.component).not.toBe(first);
            });
            const component = element.component!;
            expect(Object.keys(component.clips)).toEqual(['walk', 'jump']);
            expect(get<SpriteClipElement>('pc-sprite-clip[name="walk"]').spriteAnimationClip).toBe(component.clip('walk'));
            expect(component.currentClip).toBe(component.clip('walk'));
            expect(component.currentClip.isPlaying).toBe(true);
            expect(uncaught.seen).toEqual([]);
        });
    });
});
