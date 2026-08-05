import { describe, expect, it } from 'vitest';

import { AssetElement } from '../../src/asset';
import { useGuard } from '../helpers/guard';

const kebabToCamel = (name: string) => name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

/**
 * The texture option attributes: a valid value for each, and the property value it parses to.
 * Every property defaults to `null`, meaning "unset - the engine decides" - deliberately unlike
 * the other elements, whose defaults mirror the engine's.
 */
const TEXTURE_OPTIONS: { attribute: string; value: string; expected: unknown }[] = [
    { attribute: 'address-u', value: 'clamp', expected: 'clamp' },
    { attribute: 'address-v', value: 'mirror', expected: 'mirror' },
    { attribute: 'anisotropy', value: '8', expected: 8 },
    { attribute: 'flip-y', value: 'true', expected: true },
    { attribute: 'mag-filter', value: 'nearest', expected: 'nearest' },
    { attribute: 'min-filter', value: 'linear-mip-nearest', expected: 'linear-mip-nearest' },
    { attribute: 'mipmaps', value: 'false', expected: false },
    { attribute: 'srgb', value: '', expected: true }
];

describe('<pc-asset>', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('pc-asset') as AssetElement;

    const read = (element: AssetElement, attribute: string) => {
        return (element as unknown as Record<string, unknown>)[kebabToCamel(attribute)];
    };

    it('observes a sorted, duplicate-free attribute surface', () => {
        const attributes = AssetElement.observedAttributes;
        expect(attributes).toEqual([...TEXTURE_OPTIONS.map(({ attribute }) => attribute), 'lazy'].sort());
        expect(new Set(attributes).size).toBe(attributes.length);
    });

    describe('texture options', () => {
        it.for(TEXTURE_OPTIONS)('$attribute defaults to null, meaning unset', ({ attribute }) => {
            expect(read(create(), attribute)).toBeNull();
        });

        it.for(TEXTURE_OPTIONS)('$attribute round trips through the property', ({ attribute, value, expected }) => {
            const element = create();

            element.setAttribute(attribute, value);
            expect.soft(read(element, attribute)).toEqual(expected);

            element.removeAttribute(attribute);
            expect.soft(read(element, attribute), 'removal returns the option to unset').toBeNull();
        });

        it('warns and falls back on an invalid address mode', () => {
            const element = create();

            element.setAttribute('address-u', 'clamp-to-edge');

            warnings.expect(
                "Invalid value 'clamp-to-edge' for attribute 'address-u'. " +
                    "Valid values: repeat, clamp, mirror. Using 'repeat'."
            );
            expect(element.addressU).toBe('repeat');
        });

        it('warns and falls back on an invalid min filter', () => {
            const element = create();

            element.setAttribute('min-filter', 'trilinear');

            warnings.expect(
                "Invalid value 'trilinear' for attribute 'min-filter'. Valid values: nearest, linear, " +
                    'nearest-mip-nearest, linear-mip-nearest, nearest-mip-linear, linear-mip-linear. ' +
                    "Using 'linear-mip-linear'."
            );
            expect(element.minFilter).toBe('linear-mip-linear');
        });

        it('rejects mip variants for the magnification filter', () => {
            // Magnification has no mip variants, so the valid set is deliberately smaller than
            // min-filter's
            const element = create();

            element.setAttribute('mag-filter', 'linear-mip-linear');

            warnings.expect(
                "Invalid value 'linear-mip-linear' for attribute 'mag-filter'. " +
                    "Valid values: nearest, linear. Using 'linear'."
            );
            expect(element.magFilter).toBe('linear');
        });

        it('warns and falls back on a non-numeric anisotropy', () => {
            const element = create();

            element.setAttribute('anisotropy', 'lots');

            warnings.expect("Invalid value 'lots' for attribute 'anisotropy'. Expected a finite number. Using '1'.");
            expect(element.anisotropy).toBe(1);
        });
    });
});
