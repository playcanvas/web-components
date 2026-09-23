import type { ElementComponent } from 'playcanvas';
import { Color, Entity, Vec2, Vec4 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ElementComponentElement } from '../../../src/components/element-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * An image element: the engine only reports color, opacity, mask and sprite frame through an
 * image or text element, and a text element needs a font before it exists. Text-only attributes
 * (auto-width, font-size, wrap-lines, ...) are therefore not in the table.
 */
const scene = (elementAttributes = '') =>
    `<pc-entity name="el"><pc-element type="image" ${elementAttributes}></pc-element></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: ElementComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute an image element reports: the attribute, the engine property behind it,
 * a non-default value, what the engine must report for it, and the default that removal must
 * restore. Ordered by `observedAttributes`.
 *
 * Every `restored` value is the engine's own default. The anchor and pivot used to default to the
 * center and the size to zero - the Editor's conventions - which is what `matches an element the
 * engine built itself` below now holds them to.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    // A point anchor rather than a split one: split anchors size the element from the parent, which
    // would override the width and height rows when every attribute is applied at once
    ['anchor', 'anchor', '1 1 1 1', new Vec4(1, 1, 1, 1), new Vec4(0, 0, 0, 0)],
    ['color', 'color', '1 0 0', new Color(1, 0, 0), new Color(1, 1, 1, 1)],
    ['fit-mode', 'fitMode', 'contain', 'contain', 'stretch'],
    ['height', 'height', '50', 50, 32],
    ['mask', 'mask', '', true, false],
    // [opacity] is covered on its own below: the engine reports it as the color's alpha, so a row
    // here would change what the color row reads back
    ['pivot', 'pivot', '0.5 1', new Vec2(0.5, 1), new Vec2(0, 0)],
    ['sprite-frame', 'spriteFrame', '2', 2, 0],
    ['use-input', 'useInput', '', true, false],
    ['width', 'width', '80', 80, 32]
];

/** A text element, for the attributes the engine only reports through its text element. */
const textScene = (elementAttributes = '') =>
    `<pc-entity name="el"><pc-element type="text" ${elementAttributes}></pc-element></pc-entity>`;

/**
 * The text-only attributes, in the same shape as `cases`. The engine keeps them on its text element,
 * which exists as soon as the type is text - no font is needed to read them back.
 */
const textCases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['alignment', 'alignment', '0 1', new Vec2(0, 1), new Vec2(0.5, 0.5)],
    ['justify', 'justify', '', true, false],
    // The engine reports "no limit" as -1 however it was set
    ['max-lines', 'maxLines', '3', 3, -1],
    ['outline-color', 'outlineColor', '1 0 0', new Color(1, 0, 0), new Color(0, 0, 0, 1)],
    ['outline-thickness', 'outlineThickness', '0.5', 0.5, 0],
    ['shadow-color', 'shadowColor', '0 0 1', new Color(0, 0, 1), new Color(0, 0, 0, 1)],
    ['shadow-offset', 'shadowOffset', '0.25 -0.25', new Vec2(0.25, -0.25), new Vec2(0, 0)],
    ['spacing', 'spacing', '1.5', 1.5, 1]
];

describe('<pc-element>', () => {
    useGuard();

    describe('#component', () => {
        it('creates the element component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<ElementComponentElement>('pc-element').component!;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);
            expect(component.type).toBe('image');

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches an element the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<ElementComponentElement>('pc-element').component!;

            // Every property the element writes, compared against a component built from nothing
            // but its type, so a default drifting on either side shows up here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('element', { type: 'image' }) as ElementComponent;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine element`)
                    .toEqual(engineValue(engine, property));
            }
        });

        it('defaults to a group element', async () => {
            const { get } = await bootApp('<pc-entity name="el"><pc-element></pc-element></pc-entity>');

            expect(get<ElementComponentElement>('pc-element').component!.type).toBe('group');
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases
                .map(([attribute, , value]) => (value === '' ? attribute : `${attribute}="${value}"`))
                .join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<ElementComponentElement>('pc-element').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const element = get<ElementComponentElement>('pc-element');

            for (const [attribute, property, value, expected] of cases) {
                element.setAttribute(attribute, value);
                expect.soft(engineValue(element.component!, property), attribute).toEqual(expected);
            }
        });

        it('restores the default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const element = get<ElementComponentElement>('pc-element');

            for (const [attribute, property, value, , restored] of cases) {
                element.setAttribute(attribute, value);
                element.removeAttribute(attribute);
                expect.soft(engineValue(element.component!, property), attribute).toEqual(restored);
            }
        });

        it('writes opacity through, which the engine mirrors in the color alpha', async () => {
            const { get } = await bootApp(scene('opacity="0.5"'));
            const element = get<ElementComponentElement>('pc-element');

            expect(element.component!.opacity).toBe(0.5);
            expect(element.component!.color.a, 'the image color carries the opacity').toBe(0.5);

            element.removeAttribute('opacity');
            expect(element.component!.opacity).toBe(1);
            expect(element.component!.color).toEqual(new Color(1, 1, 1, 1));
        });
    });
    describe('text attributes', () => {
        it('creates the text element with the engine defaults', async () => {
            const { app, get } = await bootApp(textScene());
            const element = get<ElementComponentElement>('pc-element').component!;

            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('element', { type: 'text' }) as ElementComponent;

            for (const [attribute, property, , , restored] of textCases) {
                expect.soft(engineValue(element, property), attribute).toEqual(restored);
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine element`)
                    .toEqual(engineValue(engine, property));
            }
        });

        it('applies every declarative attribute through the initial component data', async () => {
            const markup = textCases
                .map(([attribute, , value]) => (value === '' ? attribute : `${attribute}="${value}"`))
                .join(' ');
            const { get } = await bootApp(textScene(markup));
            const component = get<ElementComponentElement>('pc-element').component!;

            for (const [attribute, property, , expected] of textCases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through and restores the default on removal', async () => {
            const { get } = await bootApp(textScene());
            const element = get<ElementComponentElement>('pc-element');

            for (const [attribute, property, value, expected, restored] of textCases) {
                element.setAttribute(attribute, value);
                expect.soft(engineValue(element.component!, property), attribute).toEqual(expected);
                element.removeAttribute(attribute);
                expect.soft(engineValue(element.component!, property), `${attribute} removed`).toEqual(restored);
            }
        });
    });
});
