import type { GSplatComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { GSplatComponentElement } from '../../../src/components/gsplat-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (attributes = '') => `<pc-entity><pc-gsplat ${attributes}></pc-gsplat></pc-entity>`;

const cases: [attribute: string, property: keyof GSplatComponent, value: string, expected: number][] = [
    ['lod-falloff', 'lodFalloff', '2.5', 2.5],
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
            const { get } = await bootApp(scene('lod-falloff="fast" lod-range-min="fine"'));
            const component = get<GSplatComponentElement>('pc-gsplat').component!;

            warnings.expect("Invalid value 'fast' for attribute 'lod-falloff'. Expected a finite number. Using '1'.");
            warnings.expect("Invalid value 'fine' for attribute 'lod-range-min'. Expected a finite number. Using '0'.");
            expect(component.lodFalloff).toBe(1);
            expect(component.lodRangeMin).toBe(0);
        });

        it('does not expose the removed distance controls', async () => {
            expect(GSplatComponentElement.observedAttributes).not.toContain('lod-base-distance');
            expect(GSplatComponentElement.observedAttributes).not.toContain('lod-multiplier');

            const { get } = await bootApp(scene('lod-base-distance="20" lod-multiplier="6"'));
            const component = get<GSplatComponentElement>('pc-gsplat').component!;

            expect(component.lodFalloff).toBe(1);
        });
    });
});
