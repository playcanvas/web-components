import type { GSplatComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { GSplatComponentElement } from '../../../src/components/gsplat-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (attributes = '') => `<pc-entity><pc-gsplat ${attributes}></pc-gsplat></pc-entity>`;

const cases: [attribute: string, property: keyof GSplatComponent, value: string, expected: number][] = [
    ['lod-base-distance', 'lodBaseDistance', '20', 20],
    ['lod-multiplier', 'lodMultiplier', '6', 6],
    ['lod-range-min', 'lodRangeMin', '2', 2],
    ['lod-range-max', 'lodRangeMax', '5', 5]
];

describe('<pc-gsplat>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('matches the LOD defaults of a component the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<GSplatComponentElement>('pc-gsplat').component!;

            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('gsplat') as GSplatComponent;

            for (const [, property] of cases) {
                expect.soft(element[property], property).toBe(engine[property]);
            }
        });
    });

    describe('LOD attributes', () => {
        it('applies initial values to the engine component', async () => {
            const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');
            const { get } = await bootApp(scene(markup));
            const gsplat = get<GSplatComponentElement>('pc-gsplat');

            for (const [attribute, property, , expected] of cases) {
                expect.soft(gsplat.component![property], attribute).toBe(expected);
            }
        });

        it('writes changes through and restores the engine defaults on removal', async () => {
            const { get } = await bootApp(scene());
            const gsplat = get<GSplatComponentElement>('pc-gsplat');

            for (const [attribute, property, value, expected] of cases) {
                const initial = gsplat.component![property];
                gsplat.setAttribute(attribute, value);
                expect.soft(gsplat.component![property], `${attribute} set`).toBe(expected);
                gsplat.removeAttribute(attribute);
                expect.soft(gsplat.component![property], `${attribute} removed`).toBe(initial);
            }
        });

        it('falls back to defaults and warns for invalid numbers', async () => {
            const { get } = await bootApp(scene('lod-base-distance="near" lod-multiplier="steep" lod-range-min="fine"'));
            const component = get<GSplatComponentElement>('pc-gsplat').component!;

            warnings.expect("Invalid value 'near' for attribute 'lod-base-distance'. Expected a finite number. Using '5'.");
            warnings.expect("Invalid value 'steep' for attribute 'lod-multiplier'. Expected a finite number. Using '3'.");
            warnings.expect("Invalid value 'fine' for attribute 'lod-range-min'. Expected a finite number. Using '0'.");
            expect(component.lodBaseDistance).toBe(5);
            expect(component.lodMultiplier).toBe(3);
            expect(component.lodRangeMin).toBe(0);
        });

        it('does not expose the removed falloff control', async () => {
            expect(GSplatComponentElement.observedAttributes).not.toContain('lod-falloff');

            // The engine reports any write to its removed lodFalloff, which the guard would catch
            const { get } = await bootApp(scene('lod-falloff="4"'));
            const component = get<GSplatComponentElement>('pc-gsplat').component!;

            expect(component.lodBaseDistance).toBe(5);
            expect(component.lodMultiplier).toBe(3);
        });
    });
});
