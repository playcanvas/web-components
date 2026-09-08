import type { LayoutGroupComponent } from 'playcanvas';
import {
    Entity,
    FITTING_NONE,
    FITTING_SHRINK,
    FITTING_STRETCH,
    ORIENTATION_HORIZONTAL,
    ORIENTATION_VERTICAL,
    Vec2,
    Vec4
} from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { LayoutGroupComponentElement } from '../../../src/components/layout-group-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (groupAttributes = '') =>
    `<pc-entity name="group"><pc-layout-group ${groupAttributes}></pc-layout-group></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: LayoutGroupComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute: the attribute, the engine property behind it, a non-default value, what
 * the engine must report for it, and the default that removal must restore. Ordered by
 * `observedAttributes`.
 *
 * Every `restored` value is the engine's own default. reverse-y used to default to false, which
 * is what `matches a layout group the engine built itself` below now holds it to.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['orientation', 'orientation', 'vertical', ORIENTATION_VERTICAL, ORIENTATION_HORIZONTAL],
    ['reverse-x', 'reverseX', '', true, false],
    ['reverse-y', 'reverseY', 'false', false, true],
    ['alignment', 'alignment', '0.5 0.5', new Vec2(0.5, 0.5), new Vec2(0, 1)],
    ['padding', 'padding', '1 2 3 4', new Vec4(1, 2, 3, 4), new Vec4(0, 0, 0, 0)],
    ['spacing', 'spacing', '5 6', new Vec2(5, 6), new Vec2(0, 0)],
    ['width-fitting', 'widthFitting', 'stretch', FITTING_STRETCH, FITTING_NONE],
    ['height-fitting', 'heightFitting', 'shrink', FITTING_SHRINK, FITTING_NONE],
    ['wrap', 'wrap', '', true, false]
];

describe('<pc-layout-group>', () => {
    useGuard();

    describe('#component', () => {
        it('creates the layout group component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<LayoutGroupComponentElement>('pc-layout-group').component!;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches a layout group the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<LayoutGroupComponentElement>('pc-layout-group').component!;

            // Every property the element writes, compared against a component built from no data
            // at all, so a default drifting on either side shows up here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('layoutgroup') as LayoutGroupComponent;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine layout group`)
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
            const component = get<LayoutGroupComponentElement>('pc-layout-group').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const group = get<LayoutGroupComponentElement>('pc-layout-group');

            for (const [attribute, property, value, expected] of cases) {
                group.setAttribute(attribute, value);
                expect.soft(engineValue(group.component!, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const group = get<LayoutGroupComponentElement>('pc-layout-group');

            for (const [attribute, property, value, , restored] of cases) {
                group.setAttribute(attribute, value);
                group.removeAttribute(attribute);
                expect.soft(engineValue(group.component!, property), attribute).toEqual(restored);
            }
        });
    });
});
