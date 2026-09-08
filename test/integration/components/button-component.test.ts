import type { ButtonComponent } from 'playcanvas';
import { BUTTON_TRANSITION_MODE_SPRITE_CHANGE, BUTTON_TRANSITION_MODE_TINT, Color, Entity, Vec4 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ButtonComponentElement } from '../../../src/components/button-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

const scene = (buttonAttributes = '') =>
    `<pc-entity name="btn"><pc-button ${buttonAttributes}></pc-button></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: ButtonComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per plain-valued attribute: the attribute, the engine property behind it, a non-default
 * value, what the engine must report for it, and the default that removal must restore. Ordered
 * by `observedAttributes`. The asset references ([hover-sprite-asset] and friends) and the [image]
 * entity reference are covered below and in entity-reference.test.ts.
 *
 * Every `restored` value is the engine's own default. The three tints used to be white - a
 * button with no tint attributes gave no feedback at all - which is what `matches a button the
 * engine built itself` now holds them to.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['active', 'active', 'false', false, true],
    ['fade-duration', 'fadeDuration', '150', 150, 0],
    ['hit-padding', 'hitPadding', '1 2 3 4', new Vec4(1, 2, 3, 4), new Vec4(0, 0, 0, 0)],
    ['hover-sprite-frame', 'hoverSpriteFrame', '2', 2, 0],
    ['hover-tint', 'hoverTint', '1 0 0', new Color(1, 0, 0), new Color(0.75, 0.75, 0.75, 1)],
    ['inactive-sprite-frame', 'inactiveSpriteFrame', '3', 3, 0],
    ['inactive-tint', 'inactiveTint', '0 0 1', new Color(0, 0, 1), new Color(0.25, 0.25, 0.25, 1)],
    ['pressed-sprite-frame', 'pressedSpriteFrame', '4', 4, 0],
    ['pressed-tint', 'pressedTint', '0 1 0', new Color(0, 1, 0), new Color(0.5, 0.5, 0.5, 1)],
    ['transition-mode', 'transitionMode', 'sprite', BUTTON_TRANSITION_MODE_SPRITE_CHANGE, BUTTON_TRANSITION_MODE_TINT]
];

/**
 * The [image] entity reference is covered under its own heading. The resolution and reporting
 * contract is shared with every reference-resolving element and pinned once in
 * entity-reference.test.ts; those tests pin this element's wiring - which attribute resolves, the
 * own-entity default, and what an unresolved reference leaves behind.
 */
describe('<pc-button>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('creates the button component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<ButtonComponentElement>('pc-button').component!;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches a button the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<ButtonComponentElement>('pc-button').component!;

            // Every plain property the element writes, compared against a component built from
            // no data at all, so a default drifting on either side shows up here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('button') as ButtonComponent;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine button`)
                    .toEqual(engineValue(engine, property));
            }
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<ButtonComponentElement>('pc-button').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const button = get<ButtonComponentElement>('pc-button');

            for (const [attribute, property, value, expected] of cases) {
                button.setAttribute(attribute, value);
                expect.soft(engineValue(button.component!, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const button = get<ButtonComponentElement>('pc-button');

            for (const [attribute, property, value, , restored] of cases) {
                button.setAttribute(attribute, value);
                button.removeAttribute(attribute);
                expect.soft(engineValue(button.component!, property), attribute).toEqual(restored);
            }
        });
    });

    describe('[image]', () => {
        it("defaults the image entity to the button's own entity", async () => {
            const { app, get } = await bootApp('<pc-entity name="btn"><pc-button></pc-button></pc-entity>');
            const button = get<ButtonComponentElement>('pc-button');

            expect(button.component!.imageEntity).toBe(app.root.findByName('btn'));
        });

        it('resolves an explicit reference', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="btn"><pc-button image="#target-id"></pc-button></pc-entity>
                <pc-entity id="target-id" name="target"></pc-entity>
            `);
            const button = get<ButtonComponentElement>('pc-button');

            expect(button.component!.imageEntity).toBe(app.root.findByName('target'));
        });

        it('warns when the reference does not resolve, leaving the image entity unset', async () => {
            const { get } = await bootApp('<pc-entity name="btn"><pc-button image="#nope"></pc-button></pc-entity>');
            const button = get<ButtonComponentElement>('pc-button');

            warnings.expect(
                "pc-button could not resolve image '#nope' - nothing in the document matches it - reference ignored"
            );
            expect(button.component!.imageEntity).toBeNull();
        });

        it('keeps the current image entity when a reassigned reference does not resolve', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="btn"><pc-button image="#target-id"></pc-button></pc-entity>
                <pc-entity id="target-id" name="target"></pc-entity>
            `);
            const button = get<ButtonComponentElement>('pc-button');

            button.setAttribute('image', '#still-nope');

            warnings.expect("pc-button could not resolve image '#still-nope'");
            expect(button.image).toBe('#still-nope');
            expect(button.component!.imageEntity).toBe(app.root.findByName('target'));
        });
    });
});
