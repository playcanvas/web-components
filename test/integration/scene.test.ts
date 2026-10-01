import type { AppBase, GraphicsDevice } from 'playcanvas';
import { Color, Scene, Script, Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { ScriptInstanceElement } from '../../src/components/script-instance';
import type { SceneElement } from '../../src/scene';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * One row per scene setting the element writes: a label and how to read it from a scene. Gravity
 * is left out because the element writes it to the rigid body system rather than the scene.
 */
const settings: [label: string, read: (scene: Scene) => unknown][] = [
    ['exposure', (scene) => scene.exposure],
    ['fog.type', (scene) => scene.fog.type],
    ['fog.color', (scene) => scene.fog.color],
    ['fog.density', (scene) => scene.fog.density],
    ['fog.start', (scene) => scene.fog.start],
    ['fog.end', (scene) => scene.fog.end],
    ['gsplat.dither', (scene) => scene.gsplat.dither],
    ['gsplat.splatBudget', (scene) => scene.gsplat.splatBudget],
    ['gsplat.splatBudgetMode', (scene) => scene.gsplat.splatBudgetMode],
    ['gsplat.stochastic', (scene) => scene.gsplat.stochastic],
    ['gsplat.useFog', (scene) => scene.gsplat.useFog],
    ['gsplat.useTonemap', (scene) => scene.gsplat.useTonemap],
    ['lighting.maxLights', (scene) => scene.lighting.maxLights]
];

/**
 * One row per attribute the element observes: the attribute, how to read the engine value it
 * drives, a non-default value, what the engine must report for it, and the engine default that
 * omitting or removing it leaves in place.
 */
const cases: [attribute: string, read: (app: AppBase) => unknown, value: string, expected: unknown, restored: unknown][] = [
    ['exposure', (app) => app.scene.exposure, '2', 2, 1],
    ['fog', (app) => app.scene.fog.type, 'linear', 'linear', 'none'],
    ['fog-color', (app) => app.scene.fog.color, '1 0 0', new Color(1, 0, 0), new Color(0, 0, 0)],
    ['fog-density', (app) => app.scene.fog.density, '0.05', 0.05, 0],
    ['fog-start', (app) => app.scene.fog.start, '10', 10, 1],
    ['fog-end', (app) => app.scene.fog.end, '500', 500, 1000],
    ['gsplat-dither', (app) => app.scene.gsplat.dither, 'bayer4', 'bayer4', 'bluenoise'],
    ['gsplat-splat-budget', (app) => app.scene.gsplat.splatBudget, '250000', 250_000, 1_000_000],
    ['gsplat-splat-budget-mode', (app) => app.scene.gsplat.splatBudgetMode, 'limit', 'limit', 'target'],
    ['gsplat-stochastic', (app) => app.scene.gsplat.stochastic, '', true, false],
    ['gsplat-use-fog', (app) => app.scene.gsplat.useFog, 'false', false, true],
    ['gsplat-use-tonemap', (app) => app.scene.gsplat.useTonemap, 'false', false, true],
    ['gravity', (app) => app.systems.rigidbody!.gravity, '0 -5 0', new Vec3(0, -5, 0), new Vec3(0, -9.81, 0)],
    ['lighting-max-lights', (app) => app.scene.lighting.maxLights, '512', 512, 255]
];

/** Every attribute in {@link cases}, set to its non-default value. */
const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');

/**
 * Reads every value in {@link cases} from the engine, copying the ones the engine mutates in
 * place, so that what a test records at one moment cannot change under it later.
 *
 * @param app - The application to read.
 * @returns The values, keyed by attribute.
 */
const readAll = (app: AppBase) => {
    const values = new Map<string, unknown>();
    for (const [attribute, read] of cases) {
        const value = read(app);
        values.set(attribute, value instanceof Color || value instanceof Vec3 ? value.clone() : value);
    }
    return values;
};

describe('<pc-scene>', () => {
    const { warnings } = useGuard();

    describe('#scene', () => {
        it('matches the defaults of a scene the engine built itself', async () => {
            const { app, get } = await bootApp('<pc-scene></pc-scene>');
            const scene = get<SceneElement>('pc-scene').scene!;

            // Every setting the element writes, compared against a scene built from no data at
            // all, so a default drifting on either side shows up here. Engine 2.22.1 switched its
            // GSplat LOD mode default from error to distance (playcanvas/engine#9326) while the
            // element kept writing error, and the element wrote white fog starting at 0 over the
            // engine's black fog starting at 1. Nothing caught either.
            const bare = new Scene(app.graphicsDevice);
            // The GSplat component system gives the application's scene its GSplat parameters, so
            // the bare scene takes a fresh set of the same class
            const GSplatParams = scene.gsplat.constructor as new (device: GraphicsDevice) => Scene['gsplat'];
            bare.setGsplatParams(new GSplatParams(app.graphicsDevice));
            try {
                for (const [label, read] of settings) {
                    expect.soft(read(scene), label).toEqual(read(bare));
                }
            } finally {
                bare.destroy();
            }
        });
    });

    describe('GSplat LOD attributes', () => {
        it('uses the Engine defaults when omitted', async () => {
            const { app, get } = await bootApp('<pc-scene></pc-scene>');
            const scene = get<SceneElement>('pc-scene');

            expect(scene.gsplatSplatBudget).toBe(1_000_000);
            expect(scene.gsplatSplatBudgetMode).toBe('target');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
            expect(app.scene.gsplat.splatBudgetMode).toBe('target');
        });

        it('applies initial values and subsequent changes to the Engine scene', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-splat-budget="250000" gsplat-splat-budget-mode="limit"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            expect(app.scene.gsplat.splatBudget).toBe(250_000);
            expect(app.scene.gsplat.splatBudgetMode).toBe('limit');

            scene.setAttribute('gsplat-splat-budget', '500000');
            scene.setAttribute('gsplat-splat-budget-mode', 'target');
            expect(app.scene.gsplat.splatBudget).toBe(500_000);
            expect(app.scene.gsplat.splatBudgetMode).toBe('target');
        });

        it('restores the Engine defaults when removed', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-splat-budget="250000" gsplat-splat-budget-mode="limit"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            scene.removeAttribute('gsplat-splat-budget');
            scene.removeAttribute('gsplat-splat-budget-mode');

            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
            expect(app.scene.gsplat.splatBudgetMode).toBe('target');
        });

        it('falls back to defaults and warns for invalid values', async () => {
            const { app } = await bootApp(
                '<pc-scene gsplat-splat-budget="many" gsplat-splat-budget-mode="cap"></pc-scene>'
            );

            warnings.expect(
                "Invalid value 'many' for attribute 'gsplat-splat-budget'. Expected a finite number. Using '1000000'."
            );
            warnings.expect(
                "Invalid value 'cap' for attribute 'gsplat-splat-budget-mode'. Valid values: target, limit. Using 'target'."
            );
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
            expect(app.scene.gsplat.splatBudgetMode).toBe('target');
        });

        it('does not expose the removed LOD mode', async () => {
            expect((customElements.get('pc-scene') as typeof SceneElement).observedAttributes).not.toContain(
                'gsplat-lod-mode'
            );

            // The engine reports any write to its removed lodMode, which the guard would catch
            await bootApp('<pc-scene gsplat-lod-mode="error"></pc-scene>');
        });
    });

    describe('Exposure, fog, Gaussian splat, lighting and gravity attributes', () => {
        it('leaves the engine defaults in place when omitted', async () => {
            const { app } = await bootApp('<pc-scene></pc-scene>');

            for (const [attribute, read, , , restored] of cases) {
                expect.soft(read(app), attribute).toEqual(restored);
            }
        });

        it('applies every declarative attribute when the scene connects', async () => {
            const { app } = await bootApp(`<pc-scene ${markup}></pc-scene>`);

            for (const [attribute, read, , expected] of cases) {
                expect.soft(read(app), attribute).toEqual(expected);
            }
        });

        it('writes changes through and restores the engine default on removal', async () => {
            const { app, get } = await bootApp('<pc-scene></pc-scene>');
            const scene = get<SceneElement>('pc-scene');

            for (const [attribute, read, value, expected, restored] of cases) {
                scene.setAttribute(attribute, value);
                expect.soft(read(app), attribute).toEqual(expected);
                scene.removeAttribute(attribute);
                expect.soft(read(app), `${attribute} removed`).toEqual(restored);
            }
        });

        it('falls back to the engine fog defaults and warns for invalid values', async () => {
            const { app } = await bootApp('<pc-scene fog="linear" fog-color="murky" fog-start="near"></pc-scene>');

            warnings.expect(
                "Invalid value 'murky' for attribute 'fog-color'. Expected a CSS color name, a hex color or 3 or 4 " +
                    "space-separated numbers. Using '#000000'."
            );
            warnings.expect("Invalid value 'near' for attribute 'fog-start'. Expected a finite number. Using '1'.");
            expect(app.scene.fog.color).toEqual(new Color(0, 0, 0));
            expect(app.scene.fog.start).toBe(1);
        });

        it('rejects none as a Gaussian splat dither pattern, which the engine does not accept', async () => {
            const { app } = await bootApp('<pc-scene gsplat-stochastic gsplat-dither="none"></pc-scene>');

            warnings.expect(
                "Invalid value 'none' for attribute 'gsplat-dither'. Valid values: bayer2, bayer4, bayer8, bayer16, " +
                    "bluenoise, ignnoise. Using 'bluenoise'."
            );
            expect(app.scene.gsplat.dither).toBe('bluenoise');
        });
    });

    /**
     * A script reads the scene's settings in initialize(). The element used to apply them only once
     * the application was ready, but the application runs initialize() inside app.start(), before
     * that - so a script saw the engine defaults instead.
     */
    describe('before scripts initialize', () => {
        it.each([
            ['a direct child of pc-app', `<pc-scene ${markup}></pc-scene>`],
            ['nested inside a wrapper element', `<div><pc-scene ${markup}></pc-scene></div>`]
        ])('applies every attribute of a scene that is %s when the application boots', async (_, html) => {
            const handle = mount(`<pc-app backend="null">${html}</pc-app>`);
            const appElement = handle.get<AppElement>('pc-app');

            // The first progress event fires once the application exists, before it starts
            let seen = new Map<string, unknown>();
            appElement.addEventListener(
                'progress',
                () => {
                    const app = appElement.app!;
                    app.once('initialize', () => {
                        seen = readAll(app);
                    });
                },
                { once: true }
            );

            await readyWithin(appElement);
            await settle(handle.container);

            for (const [attribute, , , expected] of cases) {
                expect.soft(seen.get(attribute), attribute).toEqual(expected);
            }
        });

        it('applies every attribute of a scene inserted at runtime before its scripts initialize', async () => {
            const { app, appElement } = await bootApp();

            let seen = new Map<string, unknown>();
            class SceneProbe extends Script {
                static scriptName = 'sceneProbe';

                initialize() {
                    seen = readAll(this.app);
                }
            }
            app.scripts.add(SceneProbe);

            const scene = document.createElement('pc-scene');
            for (const [attribute, , value] of cases) {
                scene.setAttribute(attribute, value);
            }
            scene.innerHTML =
                '<pc-entity><pc-script><pc-script-instance name="sceneProbe"></pc-script-instance></pc-script></pc-entity>';
            appElement.appendChild(scene);

            // Applied by the insertion itself, before the entity elements below the scene connect.
            // The script initializes a few microtasks later, which the element used to beat only
            // because its own wait for the application was queued ahead of the script's.
            const inserted = readAll(app);

            await readyWithin(scene.querySelector<ScriptInstanceElement>('pc-script-instance')!);
            await settle(appElement);

            for (const [attribute, , , expected] of cases) {
                expect.soft(inserted.get(attribute), `${attribute} on insertion`).toEqual(expected);
                expect.soft(seen.get(attribute), `${attribute} in initialize()`).toEqual(expected);
            }
        });
    });
});
