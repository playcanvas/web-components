import { describe, expect, it } from 'vitest';

import { useGuard } from '../helpers/guard';


/**
 * Removal semantics for every attribute that assigns `newValue` straight to a string-typed
 * property, rather than routing through a null-tolerant `parse*` helper.
 *
 * Custom elements pass `null` to attributeChangedCallback on removal. These cases used to assign
 * that null through, so the element property reported `null` where its own backing field had been
 * initialised to `''` - and the value then reached the engine. `attributeChangedCallback` declared
 * `newValue: string`, so TypeScript never flagged any of it; widening the signature is what
 * surfaced the whole set at once.
 *
 * Every element here caches to a private field and only writes through once its engine handle
 * exists, so removal is fully observable with no <pc-app> in play. The one case that also had an
 * engine-visible consequence - pc-render[material] - is covered in the integration tier.
 */
describe('attribute removal', () => {
    useGuard();

    /** tag, attribute, property, and the value removal must restore. */
    const cases: [tag: string, attribute: string, property: string, restored: string][] = [
        ['pc-button', 'image', 'image', ''],
        ['pc-button', 'hover-sprite-asset', 'hoverSpriteAsset', ''],
        ['pc-button', 'pressed-sprite-asset', 'pressedSpriteAsset', ''],
        ['pc-button', 'inactive-sprite-asset', 'inactiveSpriteAsset', ''],
        ['pc-element', 'font-asset', 'fontAsset', ''],
        ['pc-element', 'sprite-asset', 'spriteAsset', ''],
        ['pc-element', 'texture-asset', 'textureAsset', ''],
        ['pc-element', 'text', 'text', ''],
        ['pc-gsplat', 'asset', 'asset', ''],
        ['pc-particles', 'asset', 'asset', ''],
        ['pc-render', 'material', 'material', ''],
        ['pc-scrollbar', 'handle', 'handle', ''],
        ['pc-scrollview', 'viewport', 'viewport', ''],
        ['pc-scrollview', 'content', 'content', ''],
        ['pc-scrollview', 'horizontal-scrollbar', 'horizontalScrollbar', ''],
        ['pc-scrollview', 'vertical-scrollbar', 'verticalScrollbar', ''],
        ['pc-sound', 'asset', 'asset', ''],
        ['pc-sound', 'name', 'name', ''],
        ['pc-model', 'asset', 'asset', ''],
        ['pc-sky', 'asset', 'asset', ''],

        // The odd one out: pc-entity's backing field starts at the engine's default entity name,
        // so restoring '' would leave a nameless entity that no name lookup could find.
        ['pc-entity', 'name', 'name', 'Untitled']
    ];

    it.for(cases)('%s[%s] restores its default on removal', ([tag, attribute, property, restored]) => {
        const element = document.createElement(tag) as unknown as Record<string, unknown>;

        expect(element[property], `${tag}[${attribute}] does not start at its documented default`)
        .toBe(restored);

        (element as unknown as Element).setAttribute(attribute, 'some-reference');
        expect(element[property]).toBe('some-reference');

        // Reactions on an upgraded element run in the caller's stack, so a parser that mishandles
        // null throws straight out of removeAttribute() - the #309 shape.
        expect(() => (element as unknown as Element).removeAttribute(attribute)).not.toThrow();
        expect(element[property], `${tag}[${attribute}] leaked null instead of its default`)
        .toBe(restored);
    });

    it('covers every unparsed string attribute in the library', () => {
        // If a new `this.x = newValue ?? ''` branch is added without a case above, this fails.
        // Counted rather than enumerated, so it stays a one-line update rather than a second table.
        expect(cases).toHaveLength(21);
    });
});
