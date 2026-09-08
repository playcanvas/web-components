import type { SoundComponent } from 'playcanvas';
import { DISTANCE_INVERSE, DISTANCE_LINEAR, Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { SoundComponentElement } from '../../../src/components/sound-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (soundAttributes = '') => `<pc-entity name="sound"><pc-sound ${soundAttributes}></pc-sound></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: SoundComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute: the attribute, the engine property behind it, a non-default value, what
 * the engine must report for it, and the default that removal must restore. Ordered by
 * `observedAttributes`. The slots are `<pc-sound-slot>` children and covered in their own suite.
 *
 * Every `restored` value is the engine's own default. positional used to default to false, which
 * is what `matches a sound component the engine built itself` below now holds it to.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['distance-model', 'distanceModel', 'inverse', DISTANCE_INVERSE, DISTANCE_LINEAR],
    ['max-distance', 'maxDistance', '50', 50, 10000],
    ['pitch', 'pitch', '1.5', 1.5, 1],
    ['positional', 'positional', 'false', false, true],
    ['ref-distance', 'refDistance', '2', 2, 1],
    ['roll-off-factor', 'rollOffFactor', '0.5', 0.5, 1],
    ['volume', 'volume', '0.25', 0.25, 1]
];

describe('<pc-sound>', () => {
    useGuard();

    describe('#component', () => {
        it('creates the sound component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<SoundComponentElement>('pc-sound').component!;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches a sound component the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<SoundComponentElement>('pc-sound').component!;

            // Every property the element writes, compared against a component built from no data
            // at all, so a default drifting on either side shows up here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('sound') as SoundComponent;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine sound component`)
                    .toEqual(engineValue(engine, property));
            }
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<SoundComponentElement>('pc-sound').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const sound = get<SoundComponentElement>('pc-sound');

            for (const [attribute, property, value, expected] of cases) {
                sound.setAttribute(attribute, value);
                expect.soft(engineValue(sound.component!, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const sound = get<SoundComponentElement>('pc-sound');

            for (const [attribute, property, value, , restored] of cases) {
                sound.setAttribute(attribute, value);
                sound.removeAttribute(attribute);
                expect.soft(engineValue(sound.component!, property), attribute).toEqual(restored);
            }
        });
    });
});
