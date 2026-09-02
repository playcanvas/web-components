import { BLEND_NONE, Color, CULLFACE_BACK, FRESNEL_SCHLICK, SPECOCC_AO, StandardMaterial, Vec2 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { MaterialElement } from '../../src/material';
import { useGuard } from '../helpers/guard';

const kebabToCamel = (name: string) => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

/** Attributes whose element property is not simply the camel-cased attribute name. */
const ALIASES: Record<string, string> = {
    // The engine keeps the initialism capitalized, so the mechanical conversion does not apply
    'enable-ggx-specular': 'enableGGXSpecular',
    roughness: 'gloss',
    'roughness-map': 'glossMap'
};

/**
 * Enum attributes, which the element exposes as a string union while the engine stores a numeric
 * (or, for dither, string) constant. `name` is the element's default, `engine` is the constant it
 * maps to, and `alt` is a different valid name used to exercise the round trip.
 */
const ENUMS: Record<string, { name: string; engine: unknown; alt: string }> = {
    'blend-type': { name: 'none', engine: BLEND_NONE, alt: 'normal' },
    cull: { name: 'back', engine: CULLFACE_BACK, alt: 'none' },
    'fresnel-model': { name: 'schlick', engine: FRESNEL_SCHLICK, alt: 'none' },
    'occlude-specular': { name: 'ao', engine: SPECOCC_AO, alt: 'gloss-dependent' },
    'opacity-dither': { name: 'none', engine: 'none', alt: 'bayer8' }
};

/**
 * Element defaults that deliberately differ from the engine's, with the reason. Anything not
 * listed here must match the engine exactly.
 */
const DIVERGENT: Record<string, { value: unknown; why: string }> = {
    'use-metalness': {
        value: true,
        why: 'the element is metal/rough by default so that metalness-map has any effect at all'
    },
    metalness: {
        value: 0,
        // Paired with use-metalness above: the engine's 1 is unreachable under its own useMetalness
        // of false, so adopting it alongside the workflow made every material fully metallic - no
        // diffuse lobe, albedo demoted to a specular tint, and nothing to reflect without a skybox
        why:
            "the engine default of 1 is a don't-care under its useMetalness of false, and would " +
            'make every material fully metallic once the workflow is enabled'
    }
};

// Attributes that name a pc-asset rather than carrying a value
const isTextureSlot = (attribute: string) => attribute.endsWith('-map');

describe('<pc-material>', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('pc-material') as MaterialElement;

    const attributes = MaterialElement.observedAttributes;

    const propertyOf = (attribute: string) => ALIASES[attribute] ?? kebabToCamel(attribute);

    const read = (element: MaterialElement, attribute: string) => {
        return (element as unknown as Record<string, unknown>)[propertyOf(attribute)];
    };

    it('observes a large, duplicate-free attribute surface', () => {
        expect(attributes.length).toBeGreaterThan(80);
        expect(new Set(attributes).size).toBe(attributes.length);
        expect([...attributes]).toEqual([...attributes].sort());
    });

    /**
     * The check that replaces a code generator: every default the element hands out has to be the
     * one a bare StandardMaterial would. An engine rename or a changed default fails here rather
     * than shipping a wrong default into the manifest and the editor tooling.
     */
    describe('engine default drift', () => {
        const engine = new StandardMaterial();

        it.for(attributes)('%s defaults to the engine value', (attribute) => {
            const property = propertyOf(attribute);
            const actual = read(create(), attribute);

            const divergent = DIVERGENT[attribute];
            if (divergent) {
                expect(actual, divergent.why).toEqual(divergent.value);
                return;
            }

            const engineValue = (engine as unknown as Record<string, unknown>)[property];

            if (isTextureSlot(attribute)) {
                // The element holds a pc-asset id; the engine holds the resolved Texture
                expect(actual).toBe('');
                expect(engineValue).toBeNull();
                return;
            }

            const enumeration = ENUMS[attribute];
            if (enumeration) {
                expect(actual).toBe(enumeration.name);
                expect(engineValue, `'${enumeration.name}' no longer maps to the engine default`).toBe(
                    enumeration.engine
                );
                return;
            }

            expect(actual).toEqual(engineValue);
        });

        it('covers every property the element writes', () => {
            // Guards against a typo turning a real property into a silently-ignored one
            const missing = attributes.filter((attribute) => !(propertyOf(attribute) in engine));
            expect(missing, 'attributes naming a property StandardMaterial does not have').toEqual([]);
        });
    });

    describe('attribute round trip', () => {
        /**
         * Derives a representative attribute value from the type of the element's default, so a
         * new attribute is covered the moment it is observed rather than when someone remembers to
         * add it to a table.
         *
         * @param attribute - The attribute name.
         * @param current - The element's default value for it.
         * @returns The markup value to set, and the property value it should produce.
         */
        const sample = (attribute: string, current: unknown): { value: string; expected: unknown } => {
            if (isTextureSlot(attribute)) {
                return { value: 'some-asset', expected: 'some-asset' };
            }
            const enumeration = ENUMS[attribute];
            if (enumeration) {
                return { value: enumeration.alt, expected: enumeration.alt };
            }
            if (typeof current === 'boolean') {
                return { value: String(!current), expected: !current };
            }
            if (typeof current === 'number') {
                return { value: '0.5', expected: 0.5 };
            }
            if (current instanceof Vec2) {
                return { value: '3 4', expected: new Vec2(3, 4) };
            }
            if (current instanceof Color) {
                return { value: '1 0 0', expected: new Color(1, 0, 0) };
            }
            // The remaining string-valued attributes are the map channels and the name
            return { value: 'r', expected: 'r' };
        };

        it.for(attributes)('%s parses its value and restores its default on removal', (attribute) => {
            const element = create();
            const initial = read(element, attribute);
            const { value, expected } = sample(attribute, initial);

            element.setAttribute(attribute, value);
            expect(read(element, attribute)).toEqual(expected);

            // Regression shape from #309: attributeChangedCallback receives null on removal, and
            // reactions on an upgraded element run in the caller's stack - so a parser that does
            // not handle null throws straight out of removeAttribute().
            expect(() => element.removeAttribute(attribute)).not.toThrow();
            expect(read(element, attribute)).toEqual(initial);
        });

        it('warns and keeps the default for an invalid enum value', () => {
            const element = create();
            element.setAttribute('cull', 'sideways');

            expect(element.cull).toBe('back');
            warnings.expect("Invalid value 'sideways' for attribute 'cull'");
        });

        it('does not touch a material it does not have', () => {
            // Every setter caches to a private field and only writes through once the material
            // exists, which is what makes this whole tier possible.
            const element = create();
            element.setAttribute('diffuse', '1 0 0');
            expect(element.material).toBeNull();
            expect(element.diffuse).toEqual(new Color(1, 0, 0));
        });
    });

    describe('[roughness] and [gloss]', () => {
        it('inverts gloss so the value reads as roughness', () => {
            const element = create();
            element.setAttribute('roughness', '0.8');

            expect(element.gloss).toBe(0.8);
            expect(element.roughness).toBe(0.8);
            expect(element.glossInvert).toBe(true);
        });

        it('restores the uninverted interpretation when the attribute is removed', () => {
            const element = create();
            element.setAttribute('roughness', '0.8');
            element.removeAttribute('roughness');

            expect(element.gloss).toBe(0.25);
            expect(element.glossInvert).toBe(false);
        });

        it('leaves gloss uninverted', () => {
            const element = create();
            element.setAttribute('gloss', '0.8');

            expect(element.gloss).toBe(0.8);
            expect(element.glossInvert).toBe(false);
        });

        it('warns when both families are used on one element', () => {
            const element = create();
            element.id = 'mixed';
            element.setAttribute('gloss-map', 'a');
            element.setAttribute('roughness-map', 'b');

            warnings.expect("sets both 'roughness-map' and 'gloss-map'");
        });

        it('does not warn for roughness alone', () => {
            const element = create();
            element.setAttribute('roughness-map', 'b');

            expect(element.glossMap).toBe('b');
        });

        it.for([
            ['gloss-map-tiling', '4 4'],
            ['gloss-map-offset', '0.5 0'],
            ['gloss-map-channel', 'r'],
            ['gloss-map-rotation', '90'],
            ['gloss-map-uv', '1']
        ])('does not warn when roughness-map is configured with [%s]', ([modifier, value]) => {
            // The gloss-map-* modifiers only configure the shared slot - they carry no opinion
            // about inversion - and since the roughness alias covers only the value-carrying
            // attributes, they are the supported way to configure a roughness map. Warning on them
            // would fire on the documented usage.
            //
            // The modifier is set FIRST on purpose: the check only sees attributes already present,
            // so the opposite order would pass no matter how broad the conflict set was.
            const element = create();
            element.id = 'rough';
            element.setAttribute(modifier, value);
            element.setAttribute('roughness-map', 'b');

            expect(element.glossInvert).toBe(true);
        });

        it('still warns when roughness-map meets gloss-invert', () => {
            const element = create();
            element.id = 'mixed';
            element.setAttribute('gloss-invert', 'false');
            element.setAttribute('roughness-map', 'b');

            warnings.expect("sets both 'roughness-map' and 'gloss-invert'");
        });

        it('warns in either attribute order', () => {
            // The check runs from both families, so neither ordering slips through.
            const glossFirst = create();
            glossFirst.id = 'gloss-first';
            glossFirst.setAttribute('gloss', '0.8');
            glossFirst.setAttribute('roughness', '0.5');
            warnings.expect("'gloss-first' sets both 'roughness' and 'gloss'");

            const roughnessFirst = create();
            roughnessFirst.id = 'roughness-first';
            roughnessFirst.setAttribute('roughness', '0.5');
            roughnessFirst.setAttribute('gloss', '0.8');
            warnings.expect("'roughness-first' sets both 'roughness' and 'gloss'");
        });
    });
});
