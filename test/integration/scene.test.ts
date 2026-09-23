import type { AppBase } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { SceneElement } from '../../src/scene';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

describe('<pc-scene>', () => {
    const { warnings } = useGuard();

    describe('GSplat LOD attributes', () => {
        it('uses the Engine 2.22 defaults when omitted', async () => {
            const { app, get } = await bootApp('<pc-scene></pc-scene>');
            const scene = get<SceneElement>('pc-scene');

            expect(scene.gsplatLodMode).toBe('error');
            expect(scene.gsplatSplatBudget).toBe(1_000_000);
            expect(app.scene.gsplat.lodMode).toBe('error');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });

        it('applies initial values and subsequent changes to the Engine scene', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-lod-mode="distance" gsplat-splat-budget="250000"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            expect(app.scene.gsplat.lodMode).toBe('distance');
            expect(app.scene.gsplat.splatBudget).toBe(250_000);

            scene.setAttribute('gsplat-lod-mode', 'error');
            scene.setAttribute('gsplat-splat-budget', '500000');
            expect(app.scene.gsplat.lodMode).toBe('error');
            expect(app.scene.gsplat.splatBudget).toBe(500_000);
        });

        it('restores the Engine defaults when removed', async () => {
            const { app, get } = await bootApp(
                '<pc-scene gsplat-lod-mode="distance" gsplat-splat-budget="250000"></pc-scene>'
            );
            const scene = get<SceneElement>('pc-scene');

            scene.removeAttribute('gsplat-lod-mode');
            scene.removeAttribute('gsplat-splat-budget');

            expect(app.scene.gsplat.lodMode).toBe('error');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });

        it('falls back to defaults and warns for invalid values', async () => {
            const { app } = await bootApp('<pc-scene gsplat-lod-mode="nearest" gsplat-splat-budget="many"></pc-scene>');

            warnings.expect(
                "Invalid value 'nearest' for attribute 'gsplat-lod-mode'. Valid values: error, distance. Using 'error'."
            );
            warnings.expect(
                "Invalid value 'many' for attribute 'gsplat-splat-budget'. Expected a finite number. Using '1000000'."
            );
            expect(app.scene.gsplat.lodMode).toBe('error');
            expect(app.scene.gsplat.splatBudget).toBe(1_000_000);
        });
    });

    describe('Gaussian splat, lighting and physics attributes', () => {
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
            ['gsplat-use-fog', (app) => app.scene.gsplat.useFog, 'false', false, true],
            ['gsplat-use-tonemap', (app) => app.scene.gsplat.useTonemap, 'false', false, true],
            ['lighting-max-lights', (app) => app.scene.lighting.maxLights, '512', 512, 255],
            ['physics-time-scale', (app) => app.systems.rigidbody!.timeScale, '0.5', 0.5, 1]
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
    });
});
