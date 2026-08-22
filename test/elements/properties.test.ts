import { describe, expect, it } from 'vitest';

import type { PropertyTable } from '../../src/properties';
import {
    applyAttribute,
    attributeNames,
    defineProperties,
    enumProperty,
    numberProperty,
    stringProperty
} from '../../src/properties';
import { useGuard } from '../helpers/guard';

/**
 * The property-descriptor machinery, exercised through scratch elements rather than the
 * library's own. These pin the behaviors an element migration relies on but which no migrated
 * element demonstrates in isolation yet: tables merged across the constructor chain, the
 * attribute and property overrides, the split between the unset initial value and the
 * invalid-value fallback (pc-asset's texture options), and the apply hook for attributes with
 * presence-dependent side effects (pc-material's roughness). <pc-light>'s suite covers the same
 * dispatch through a real element.
 */

const baseProperties = defineProperties({
    alpha: numberProperty(1)
});

class PropertiesBaseElement extends HTMLElement {
    /** @internal */
    static properties: PropertyTable = baseProperties;

    static get observedAttributes() {
        return attributeNames(this);
    }

    private _alpha = baseProperties.alpha.initial();

    set alpha(value: number) {
        this._alpha = value;
    }

    get alpha() {
        return this._alpha;
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        applyAttribute(this, name, newValue);
    }
}

const derivedProperties = defineProperties({
    // pc-asset's texture-option shape: unset initially, but a malformed value falls back to a
    // declared constant rather than to unset
    mode: enumProperty(['fast', 'slow'], null, { invalid: 'fast' }),

    // an alias: the attribute name and the assigned property both differ from the key
    strength: numberProperty(0.5, { attribute: 'power', property: 'level' }),

    // pc-material roughness's shape: the parsed value plus the attribute's presence, applied by
    // hand instead of assigned
    boost: numberProperty(0.25, {
        property: 'output',
        apply: (element: PropertiesDerivedElement, value, raw) => {
            element.output = value;
            element.boosted = raw !== null;
        }
    }),

    label: stringProperty('none')
});

class PropertiesDerivedElement extends PropertiesBaseElement {
    /** @internal */
    static properties: PropertyTable = derivedProperties;

    private _mode = derivedProperties.mode.initial();

    private _level = derivedProperties.strength.initial();

    private _output = derivedProperties.boost.initial();

    private _label = derivedProperties.label.initial();

    boosted = false;

    set mode(value: 'fast' | 'slow' | null) {
        this._mode = value;
    }

    get mode() {
        return this._mode;
    }

    set level(value: number) {
        this._level = value;
    }

    get level() {
        return this._level;
    }

    set output(value: number) {
        this._output = value;
    }

    get output() {
        return this._output;
    }

    set label(value: string) {
        this._label = value;
    }

    get label() {
        return this._label;
    }
}

customElements.define('test-properties-base', PropertiesBaseElement);
customElements.define('test-properties-derived', PropertiesDerivedElement);

describe('property descriptors', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('test-properties-derived') as PropertiesDerivedElement;

    it('merges observedAttributes across the constructor chain, base class first', () => {
        expect(PropertiesBaseElement.observedAttributes).toEqual(['alpha']);
        expect(PropertiesDerivedElement.observedAttributes).toEqual(['alpha', 'mode', 'power', 'boost', 'label']);
    });

    it('dispatches an attribute declared by the base class on a derived element', () => {
        const element = create();

        element.setAttribute('alpha', '0.5');
        expect(element.alpha).toBe(0.5);

        element.removeAttribute('alpha');
        expect(element.alpha).toBe(1);
    });

    it('distinguishes the unset initial value from the invalid-value fallback', () => {
        const element = create();

        expect(element.mode, 'starts unset').toBeNull();

        element.setAttribute('mode', 'slow');
        expect(element.mode).toBe('slow');

        element.setAttribute('mode', 'medium');
        expect(element.mode, 'a malformed value falls back to the declared constant, not to unset').toBe('fast');
        warnings.expect("Invalid value 'medium' for attribute 'mode'. Valid values: fast, slow. Using 'fast'.");

        element.removeAttribute('mode');
        expect(element.mode, 'removal restores unset').toBeNull();
    });

    it('honors the attribute and property overrides', () => {
        const element = create();

        expect(element.level).toBe(0.5);

        element.setAttribute('power', '2');
        expect(element.level).toBe(2);

        element.removeAttribute('power');
        expect(element.level).toBe(0.5);
    });

    it('hands an apply hook the parsed value and the raw presence', () => {
        const element = create();

        element.setAttribute('boost', '4');
        expect(element.output).toBe(4);
        expect(element.boosted).toBe(true);

        element.removeAttribute('boost');
        expect(element.output, 'the hook receives the declared initial value on removal').toBe(0.25);
        expect(element.boosted).toBe(false);
    });

    it('accepts any string for a string property, without warning', () => {
        const element = create();

        element.setAttribute('label', 'anything at all');
        expect(element.label).toBe('anything at all');

        element.removeAttribute('label');
        expect(element.label).toBe('none');
    });
});
