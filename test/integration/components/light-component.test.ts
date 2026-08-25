import type { LightComponent } from 'playcanvas';
import { Color, Entity, SHADOW_PCF1_32F, SHADOW_PCF3_32F, SHADOW_VSM_16F } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { LightComponentElement } from '../../../src/components/light-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (lightAttributes = '') => `<pc-entity name="light"><pc-light ${lightAttributes}></pc-light></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: LightComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute: the attribute, the engine property behind it, a non-default value, what
 * the engine must report for it, and the default that removal must restore. Ordered by
 * `observedAttributes` - the source of truth.
 *
 * Every `restored` value is the engine's own default. The four shadow-tuning ones used to differ,
 * which is what `matches a light the engine built itself` below now holds them to.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['cascade-blend', 'cascadeBlend', '0.1', 0.1, 0],
    ['cascade-distribution', 'cascadeDistribution', '0.7', 0.7, 0.5],
    ['cast-shadows', 'castShadows', '', true, false],
    ['color', 'color', '1 0 0', new Color(1, 0, 0), new Color(1, 1, 1)],
    ['inner-cone-angle', 'innerConeAngle', '20', 20, 40],
    ['intensity', 'intensity', '2', 2, 1],
    ['normal-offset-bias', 'normalOffsetBias', '0.1', 0.1, 0],
    ['num-cascades', 'numCascades', '4', 4, 1],
    ['outer-cone-angle', 'outerConeAngle', '30', 30, 45],
    ['penumbra-falloff', 'penumbraFalloff', '5', 5, 1],
    ['penumbra-size', 'penumbraSize', '0.5', 0.5, 1],
    ['range', 'range', '25', 25, 10],
    ['shadow-bias', 'shadowBias', '0.1', 0.1, 0.05],
    ['shadow-blocker-samples', 'shadowBlockerSamples', '8', 8, 16],
    ['shadow-distance', 'shadowDistance', '60', 60, 40],
    ['shadow-intensity', 'shadowIntensity', '0.6', 0.6, 1],
    ['shadow-resolution', 'shadowResolution', '2048', 2048, 1024],
    ['shadow-samples', 'shadowSamples', '8', 8, 16],
    ['shadow-type', 'shadowType', 'pcf1-32f', SHADOW_PCF1_32F, SHADOW_PCF3_32F],
    ['type', 'type', 'omni', 'omni', 'directional'],
    ['vsm-bias', 'vsmBias', '0.01', 0.01, 0.0025],
    ['vsm-blur-size', 'vsmBlurSize', '5', 5, 11]
];

describe('<pc-light>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('creates the light component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<LightComponentElement>('pc-light').component;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches a light the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<LightComponentElement>('pc-light').component;

            // Every property the element writes, compared against a component built from no data
            // at all. Catches a default drifting on either side, including the properties the
            // element does not expose but does not touch either.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('light') as LightComponent;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine light`)
                    .toEqual(engineValue(engine, property));
            }
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases
                .map(([attribute, , value]) => (value === '' ? attribute : `${attribute}="${value}"`))
                .join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<LightComponentElement>('pc-light').component;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const light = get<LightComponentElement>('pc-light');

            for (const [attribute, property, value, expected] of cases) {
                light.setAttribute(attribute, value);
                expect.soft(engineValue(light.component, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const light = get<LightComponentElement>('pc-light');

            for (const [attribute, property, value, , restored] of cases) {
                light.setAttribute(attribute, value);
                light.removeAttribute(attribute);
                expect.soft(engineValue(light.component, property), attribute).toEqual(restored);
            }
        });

        it('falls back to the default and warns once per invalid value', async () => {
            const { get } = await bootApp(
                scene('type="area" shadow-type="pcf7-32f" intensity="bright" shadow-bias="soft"')
            );
            const component = get<LightComponentElement>('pc-light').component;

            warnings.expect(
                "Invalid value 'area' for attribute 'type'. Valid values: directional, omni, spot. Using 'directional'."
            );
            warnings.expect(
                "Invalid value 'pcf7-32f' for attribute 'shadow-type'. Valid values: pcf1-16f, pcf1-32f, pcf3-16f, pcf3-32f, pcf5-16f, pcf5-32f, vsm-16f, vsm-32f, pcss-32f. Using 'pcf3-32f'."
            );
            warnings.expect("Invalid value 'bright' for attribute 'intensity'. Expected a finite number. Using '1'.");
            warnings.expect(
                "Invalid value 'soft' for attribute 'shadow-bias'. Expected a finite number. Using '0.05'."
            );

            expect(component.type).toBe('directional');
            expect(component.shadowType).toBe(SHADOW_PCF3_32F);
            expect(component.intensity).toBe(1);
            expect(component.shadowBias).toBe(0.05);
        });

        it('maps each PCF shadow type name to its own engine constant', async () => {
            const { get } = await bootApp(scene());
            const light = get<LightComponentElement>('pc-light');

            // The PCF family is not device-gated, so these reach the component unchanged. VSM and
            // PCSS are covered by the downgrade test below.
            const names = ['pcf1-16f', 'pcf1-32f', 'pcf3-16f', 'pcf3-32f', 'pcf5-16f', 'pcf5-32f'] as const;

            const values = names.map((name) => {
                light.setAttribute('shadow-type', name);
                return light.component.shadowType;
            });

            expect(new Set(values).size, 'each name resolves to its own constant').toBe(names.length);
            expect(values[names.indexOf('pcf3-32f')]).toBe(SHADOW_PCF3_32F);
        });

        it('lets the engine downgrade a shadow type the device cannot render', async () => {
            const { get } = await bootApp(scene());
            const light = get<LightComponentElement>('pc-light');

            // Light#shadowType downgrades by device capability, and the two paths differ: the null
            // device renders half-float but not float, so 32-bit VSM drops one step to 16-bit
            // while PCSS drops all the way to PCF3. The element keeps the request either way -
            // this divergence is the engine's, not the element's, and is pinned so a change to
            // either side shows up here.
            light.setAttribute('shadow-type', 'vsm-32f');
            expect(light.shadowType, 'the element keeps the request').toBe('vsm-32f');
            expect(light.component.shadowType, '32-bit VSM falls to 16-bit').toBe(SHADOW_VSM_16F);

            light.setAttribute('shadow-type', 'pcss-32f');
            expect(light.component.shadowType, 'PCSS falls to PCF3').toBe(SHADOW_PCF3_32F);
        });
    });
});
