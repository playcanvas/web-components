import type { ElementComponent } from 'playcanvas';
import { Color, Entity, Vec2, Vec3, Vec4 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ElementComponentElement } from '../../../src/components/element-component';
import type { EntityElement } from '../../../src/entity';
import { bootApp } from '../../helpers/app';
import type { BootedApp } from '../../helpers/app';
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

/**
 * Elements whose entities place them, each exposed to a different way the engine's element setup
 * can move them. The engine positions an element from its margins, which a new component seeds
 * with its own defaults rather than from its entity - and a `<pc-entity>` is always positioned
 * before its element is added.
 */
const placed: [name: string, element: string][] = [
    // The default 32 x 32 size is the engine's own, so writing it syncs nothing from the position
    ['image', '<pc-element type="image"></pc-element>'],
    // Fit mode applies the margins before a text element first sizes itself
    ['text', '<pc-element type="text" pivot="0.5 0.5"></pc-element>'],
    // A fixed width syncs the horizontal margins, leaving only the vertical ones to lose
    ['wrapped', '<pc-element type="text" auto-width="false" width="100" wrap-lines></pc-element>']
];

/** The `placed` elements, each on an entity at `10 20 3`. */
const placedEntities = placed
    .map(([name, element]) => `<pc-entity name="${name}" position="10 20 3">${element}</pc-entity>`)
    .join('');

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

    describe('placement', () => {
        /** Asserts that every `placed` element is still where its entity was positioned. */
        const expectPlaced = ({ app, get }: BootedApp) => {
            // As the first frame does: syncing the hierarchy re-derives a screen element's size, and
            // with it the position, from its margins
            app.root.syncHierarchy();

            for (const [name] of placed) {
                const entity = get<EntityElement>(`pc-entity[name="${name}"]`).entity!;
                expect.soft(entity.getLocalPosition(), name).toEqual(new Vec3(10, 20, 3));
            }
        };

        it('keeps world-space elements where their entities are positioned', async () => {
            expectPlaced(await bootApp(placedEntities));
        });

        it('keeps screen elements where their entities are positioned', async () => {
            expectPlaced(
                await bootApp(`<pc-entity name="screen"><pc-screen screen-space></pc-screen>${placedEntities}</pc-entity>`)
            );
        });

        it('places a stretched axis from its margins and a point axis from the position', async () => {
            const { get } = await bootApp(`
                <pc-entity name="screen">
                    <pc-screen screen-space></pc-screen>
                    <pc-entity name="el" position="10 20 3">
                        <pc-element type="image" anchor="0 0.5 1 0.5"></pc-element>
                    </pc-entity>
                </pc-entity>
            `);
            const component = get<ElementComponentElement>('pc-element').component!;

            expect(component.margin.x, 'the stretched axis keeps the default margin').toBe(0);
            expect(component.entity.getLocalPosition().y).toBe(20);
        });

        it('lets authored margins place the element instead', async () => {
            const { get } = await bootApp(`
                <pc-entity name="screen">
                    <pc-screen screen-space></pc-screen>
                    <pc-entity name="el" position="10 20 3">
                        <pc-element type="image" anchor="0 0 1 1" margin="4 5 6 7"></pc-element>
                    </pc-entity>
                </pc-entity>
            `);

            expect(get<ElementComponentElement>('pc-element').component!.margin).toEqual(new Vec4(4, 5, 6, 7));
        });
    });
});
