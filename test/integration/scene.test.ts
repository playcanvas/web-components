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
});
