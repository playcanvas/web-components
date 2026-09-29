import type { AppBase } from 'playcanvas';
import { Color, Scene } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { SceneElement } from '../../src/scene';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

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
    ['gsplat.lodMode', (scene) => scene.gsplat.lodMode],
    ['gsplat.splatBudget', (scene) => scene.gsplat.splatBudget],
    ['gsplat.useFog', (scene) => scene.gsplat.useFog],
    ['gsplat.useTonemap', (scene) => scene.gsplat.useTonemap],
    ['lighting.maxLights', (scene) => scene.lighting.maxLights]
];

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

            expect(scene.gsplatLodMode).toBe('distance');
            expect(scene.gsplatSplatBudget).toBe(1_000_000);
            expect(app.scene.gsplat.lodMode).toBe('distance');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });

        it('applies initial values and subsequent changes to the Engine scene', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-lod-mode="error" gsplat-splat-budget="250000"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            expect(app.scene.gsplat.lodMode).toBe('error');
            expect(app.scene.gsplat.splatBudget).toBe(250_000);

            scene.setAttribute('gsplat-lod-mode', 'distance');
            scene.setAttribute('gsplat-splat-budget', '500000');
            expect(app.scene.gsplat.lodMode).toBe('distance');
            expect(app.scene.gsplat.splatBudget).toBe(500_000);
        });

        it('restores the Engine defaults when removed', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-lod-mode="error" gsplat-splat-budget="250000"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            scene.removeAttribute('gsplat-lod-mode');
            scene.removeAttribute('gsplat-splat-budget');

            expect(app.scene.gsplat.lodMode).toBe('distance');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });

        it('falls back to defaults and warns for invalid values', async () => {
            const { app } = await bootApp('<pc-scene gsplat-lod-mode="nearest" gsplat-splat-budget="many"></pc-scene>');

            warnings.expect(
                "Invalid value 'nearest' for attribute 'gsplat-lod-mode'. Valid values: error, distance. Using 'distance'."
            );
            warnings.expect(
                "Invalid value 'many' for attribute 'gsplat-splat-budget'. Expected a finite number. Using '1000000'."
            );
            expect(app.scene.gsplat.lodMode).toBe('distance');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });
    });

    describe('Fog, Gaussian splat and lighting attributes', () => {
        /**
         * One row per attribute: the attribute, how to read the engine value it drives, a
         * non-default value, what the engine must report for it, and the engine default that
         * omitting or removing it leaves in place.
         */
        const cases: [
            attribute: string,
            read: (app: AppBase) => unknown,
            value: string,
            expected: unknown,
            restored: unknown
        ][] = [
            ['fog', (app) => app.scene.fog.type, 'linear', 'linear', 'none'],
            ['fog-color', (app) => app.scene.fog.color, '1 0 0', new Color(1, 0, 0), new Color(0, 0, 0)],
            ['fog-density', (app) => app.scene.fog.density, '0.05', 0.05, 0],
            ['fog-start', (app) => app.scene.fog.start, '10', 10, 1],
            ['fog-end', (app) => app.scene.fog.end, '500', 500, 1000],
            ['gsplat-use-fog', (app) => app.scene.gsplat.useFog, 'false', false, true],
            ['gsplat-use-tonemap', (app) => app.scene.gsplat.useTonemap, 'false', false, true],
            ['lighting-max-lights', (app) => app.scene.lighting.maxLights, '512', 512, 255]
        ];

        it('leaves the engine defaults in place when omitted', async () => {
            const { app } = await bootApp('<pc-scene></pc-scene>');

            for (const [attribute, read, , , restored] of cases) {
                expect.soft(read(app), attribute).toEqual(restored);
            }
        });

        it('applies every declarative attribute when the scene connects', async () => {
            const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');
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
    });
});
