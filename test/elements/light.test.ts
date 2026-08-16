import { Color } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { LightComponentElement } from '../../src/components/light-component';
import { useGuard } from '../helpers/guard';

/**
 * <pc-light> is the pilot of the static property-descriptor table (src/properties.ts), so beyond
 * the element's own attribute surface these tests pin the machinery itself: observedAttributes
 * merged across the constructor chain, dispatch through the shared attributeChangedCallback, and
 * the descriptor's declared initial value - restored on removal, and named in the warning as the
 * fallback of an invalid value, regardless of any earlier programmatic writes. The element caches
 * every property to a private field and only writes through once its engine component exists, so
 * all of it is observable with no <pc-app> in play.
 */
describe('<pc-light>', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('pc-light') as LightComponentElement;

    it('observes every attribute of the property table', () => {
        expect([...LightComponentElement.observedAttributes].sort()).toEqual([
            'cast-shadows',
            'color',
            'enabled',
            'inner-cone-angle',
            'intensity',
            'normal-offset-bias',
            'outer-cone-angle',
            'penumbra-falloff',
            'penumbra-size',
            'range',
            'shadow-bias',
            'shadow-blocker-samples',
            'shadow-distance',
            'shadow-intensity',
            'shadow-resolution',
            'shadow-samples',
            'shadow-type',
            'type',
            'vsm-bias',
            'vsm-blur-size'
        ]);
    });

    it('parses a number attribute and restores the default on removal', () => {
        const element = create();

        expect(element.intensity).toBe(1);

        element.setAttribute('intensity', '2.5');
        expect(element.intensity).toBe(2.5);

        element.removeAttribute('intensity');
        expect(element.intensity).toBe(1);
    });

    it('falls back to the declared default on an invalid number, naming it in the warning', () => {
        const element = create();

        element.setAttribute('shadow-bias', '0.5');
        expect(element.shadowBias).toBe(0.5);

        element.setAttribute('shadow-bias', 'steep');
        expect(element.shadowBias, 'an invalid value falls back to the default, not the previous value').toBe(0.2);
        warnings.expect("Invalid value 'steep' for attribute 'shadow-bias'. Expected a finite number. Using '0.2'.");
    });

    it('restores the declared default, not an earlier programmatic write', () => {
        const element = create();

        // A property written before the element's first attribute reaction must not shift what
        // removal (or an invalid value) restores
        element.intensity = 7;

        element.setAttribute('intensity', '2');
        expect(element.intensity).toBe(2);

        element.removeAttribute('intensity');
        expect(element.intensity).toBe(1);

        element.intensity = 7;
        element.setAttribute('intensity', 'garbage');
        expect(element.intensity).toBe(1);
        warnings.expect("Invalid value 'garbage' for attribute 'intensity'. Expected a finite number. Using '1'.");
    });

    it('parses a boolean attribute with the standard rules', () => {
        const element = create();

        expect(element.castShadows).toBe(false);

        // A bare boolean attribute (e.g. <pc-light cast-shadows>) arrives as the empty string
        element.setAttribute('cast-shadows', '');
        expect(element.castShadows).toBe(true);

        element.setAttribute('cast-shadows', 'false');
        expect(element.castShadows).toBe(false);

        element.setAttribute('cast-shadows', 'true');
        expect(element.castShadows).toBe(true);

        element.removeAttribute('cast-shadows');
        expect(element.castShadows).toBe(false);
    });

    it('parses a color attribute and restores the default on removal', () => {
        const element = create();

        expect(element.color).toEqual(new Color(1, 1, 1));

        element.setAttribute('color', 'red');
        expect(element.color).toEqual(new Color(1, 0, 0));

        element.setAttribute('color', 'not-a-color');
        expect(element.color).toEqual(new Color(1, 1, 1));
        warnings.expect(/Invalid value 'not-a-color' for attribute 'color'/);

        element.removeAttribute('color');
        expect(element.color).toEqual(new Color(1, 1, 1));
    });

    it('creates a fresh default on every removal', () => {
        const element = create();

        element.setAttribute('color', 'red');
        element.removeAttribute('color');

        // Mutate the restored value in place; the declared default must not be written through
        element.color.r = 0.25;

        element.setAttribute('color', 'blue');
        element.removeAttribute('color');
        expect(element.color).toEqual(new Color(1, 1, 1));
    });

    it('resolves an enum attribute against a constant map', () => {
        const element = create();

        expect(element.shadowType).toBe('pcf3-32f');

        element.setAttribute('shadow-type', 'vsm-16f');
        expect(element.shadowType).toBe('vsm-16f');

        // The fallback is the declared default, not the previous value
        element.setAttribute('shadow-type', 'soft');
        expect(element.shadowType).toBe('pcf3-32f');
        warnings.expect(
            "Invalid value 'soft' for attribute 'shadow-type'. Valid values: pcf1-16f, pcf1-32f, " +
                "pcf3-16f, pcf3-32f, pcf5-16f, pcf5-32f, vsm-16f, vsm-32f, pcss-32f. Using 'pcf3-32f'."
        );

        element.setAttribute('shadow-type', 'pcss-32f');
        element.removeAttribute('shadow-type');
        expect(element.shadowType).toBe('pcf3-32f');
    });

    it('resolves an enum attribute against an inline array', () => {
        const element = create();

        expect(element.type).toBe('directional');

        element.setAttribute('type', 'spot');
        expect(element.type).toBe('spot');

        element.setAttribute('type', 'point');
        expect(element.type).toBe('directional');
        warnings.expect(
            "Invalid value 'point' for attribute 'type'. Valid values: directional, omni, spot. Using 'directional'."
        );

        element.removeAttribute('type');
        expect(element.type).toBe('directional');
    });

    it('handles the enabled attribute inherited from ComponentElement', () => {
        const element = create();

        expect(element.enabled).toBe(true);

        element.setAttribute('enabled', 'false');
        expect(element.enabled).toBe(false);

        element.removeAttribute('enabled');
        expect(element.enabled).toBe(true);
    });

    it('leaves the accessors as the programmatic surface', () => {
        const element = create();

        element.intensity = 7;
        expect(element.intensity).toBe(7);
        expect(element.hasAttribute('intensity'), 'properties do not reflect back to attributes').toBe(false);
    });
});
