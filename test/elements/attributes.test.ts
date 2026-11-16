import { BoundingBox, Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyAttribute, attr, attributeNames, defineAttributes, engineData } from '../../src/attributes';
import { useGuard } from '../helpers/guard';

/**
 * The schema an element declares its attributes in. Element tier: the elements here are the test's
 * own, so that each rule is exercised on its own rather than through whichever library element
 * happens to rely on it, and the engine object is a plain stand-in.
 */

const MODES = new Map<'low' | 'high', number>([
    ['low', 10],
    ['high', 20]
]);

const DEFAULT_TINT = new Color(0.2, 0.4, 0.6);

/** Stands in for an engine object: a property for each thing the element writes through. */
class Engine {
    caption = '';

    doubled = 0;

    limit = 0;

    mode = 0;

    owner: Element | null = null;

    shape = '';

    size = 0;

    tint = new Color();

    visible = false;
}

/** The conversions that have run, and the elements the after-write function was called with. */
const converted: string[] = [];
const written: Element[] = [];

class Gadget extends HTMLElement {
    declare label: string;

    declare limit: number | null;

    declare mode: 'low' | 'high';

    declare shape: 'round' | 'square';

    declare size: number;

    declare tint: Color;

    declare twice: number;

    declare visible: boolean;

    declare watcher: string;

    engine: Engine | null = null;

    static get observedAttributes() {
        return attributeNames(this);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        applyAttribute(this, name, newValue);
    }
}

defineAttributes(
    Gadget,
    'engine',
    {
        label: attr.string('untitled').as('caption'),
        limit: attr.number(null).to((value) => value ?? -1),
        mode: attr.oneOf(MODES, 'low'),
        shape: attr.oneOf(['round', 'square'], 'round'),
        size: attr.number(1),
        tint: attr.color(DEFAULT_TINT),
        twice: attr
            .number(2)
            .to((value) => value * 2)
            .as('doubled'),
        visible: attr.bool(true),
        watcher: attr
            .string('')
            .to((value, element) => {
                converted.push(value);
                return element;
            })
            .as('owner')
    },
    (element) => written.push(element)
);

customElements.define('test-gadget', Gadget);

/** A class below one that has a schema, with a schema of its own. */
class DerivedEngine extends Engine {
    extra = 0;
}

class Derived extends Gadget {
    declare extra: number;

    declare engine: DerivedEngine | null;
}

defineAttributes(Derived, 'engine', { extra: attr.number(0) });

customElements.define('test-derived', Derived);

/** A class with two schemas, only one of which is given a function to call after a write. */
class PairEngine {
    loud = 0;

    quiet = '';
}

const heard: Element[] = [];

class Pair extends HTMLElement {
    declare loud: number;

    declare quiet: string;

    engine: PairEngine | null = null;
}

defineAttributes(Pair, 'engine', { quiet: attr.string('') });
defineAttributes(Pair, 'engine', { loud: attr.number(0) }, (element) => heard.push(element));

customElements.define('test-pair', Pair);

/** Property names with a run of capitals in them, which is where a derived name goes wrong. */
class Initials extends HTMLElement {
    declare angularLimitsX: number;

    declare aoMapUv: number;

    declare enableGGXSpecular: boolean;

    engine: { angularLimitsX: number; aoMapUv: number; enableGGXSpecular: boolean } | null = null;
}

defineAttributes(Initials, 'engine', {
    angularLimitsX: attr.number(0),
    aoMapUv: attr.number(0),
    enableGGXSpecular: attr.bool(false)
});

class Plain extends HTMLElement {}

customElements.define('test-plain', Plain);

const gadget = () => document.createElement('test-gadget') as Gadget;

const gadgetWithEngine = () => {
    const element = gadget();
    element.engine = new Engine();
    return element as Gadget & { engine: Engine };
};

/**
 * The compiler's half of the contract, held by `npm run type-check:test`: every call marked below
 * must fail to compile, or its marker is itself an error. The function is never run.
 */
const mustNotCompile = () => {
    class Undeclared extends HTMLElement {
        engine: { size: number } | null = null;
    }
    // @ts-expect-error - the class does not declare size
    defineAttributes(Undeclared, 'engine', { size: attr.number(0) });

    class Mistyped extends HTMLElement {
        declare size: string;

        engine: { size: number } | null = null;
    }
    // @ts-expect-error - the class declares a string, and the attribute parses to a number
    defineAttributes(Mistyped, 'engine', { size: attr.number(0) });

    class Narrow extends HTMLElement {
        declare size: number;

        engine: { size: number } | null = null;
    }
    // @ts-expect-error - the attribute can be null, and the declaration cannot
    defineAttributes(Narrow, 'engine', { size: attr.number(null).to((value) => value ?? 0) });

    class NoSuchProperty extends HTMLElement {
        declare size: number;

        engine: { extent: number } | null = null;
    }
    // @ts-expect-error - the engine object has no size
    defineAttributes(NoSuchProperty, 'engine', { size: attr.number(0) });
    // @ts-expect-error - nor an extents, though it has an extent
    defineAttributes(NoSuchProperty, 'engine', { size: attr.number(0).as('extents') });
    // @ts-expect-error - and the element has no motor to hold an engine object
    defineAttributes(NoSuchProperty, 'motor', { size: attr.number(0).as('extent') });

    class WrongValue extends HTMLElement {
        declare size: number;

        engine: { size: string } | null = null;
    }
    // @ts-expect-error - the engine's size takes a string, and the attribute gives a number
    defineAttributes(WrongValue, 'engine', { size: attr.number(0) });

    // The same class with each of those put right compiles
    defineAttributes(NoSuchProperty, 'engine', { size: attr.number(0).as('extent') });
    defineAttributes(WrongValue, 'engine', { size: attr.number(0).to((value) => String(value)) });
};

describe('attributes', () => {
    const { warnings } = useGuard();

    beforeEach(() => {
        converted.length = 0;
        written.length = 0;
        heard.length = 0;
    });

    describe('attributeNames', () => {
        it('names each attribute after its property, in kebab-case and in the order of the schema', () => {
            expect(attributeNames(Gadget)).toEqual([
                'label',
                'limit',
                'mode',
                'shape',
                'size',
                'tint',
                'twice',
                'visible',
                'watcher'
            ]);
        });

        it('treats a run of capitals as one word', () => {
            // enable-g-g-x-specular is what a capital-by-capital conversion makes of the third,
            // which renamed a public attribute of pc-material without failing a test
            expect(attributeNames(Initials)).toEqual(['angular-limits-x', 'ao-map-uv', 'enable-ggx-specular']);
        });

        it('adds the attributes of a derived class to those of its base', () => {
            expect(attributeNames(Derived)).toEqual([...attributeNames(Gadget), 'extra']);
        });

        it('leaves the base class with its own attributes alone', () => {
            expect(attributeNames(Gadget)).not.toContain('extra');
        });

        it('is empty for a class that has no schema', () => {
            expect(attributeNames(Plain)).toEqual([]);
        });
    });

    describe('a property', () => {
        it('holds the default of an absent attribute until it is written', () => {
            const element = gadget();

            expect(element.label).toBe('untitled');
            expect(element.limit).toBeNull();
            expect(element.mode).toBe('low');
            expect(element.shape).toBe('round');
            expect(element.size).toBe(1);
            expect(element.tint).toEqual(DEFAULT_TINT);
            expect(element.twice).toBe(2);
            expect(element.visible).toBe(true);
            expect(element.watcher).toBe('');
        });

        it('holds a default of its own, shared with no other element and not with the schema', () => {
            const first = gadget();
            const second = gadget();

            expect(first.tint).not.toBe(second.tint);
            expect(first.tint).not.toBe(DEFAULT_TINT);

            first.tint.set(1, 1, 1);

            expect(second.tint).toEqual(new Color(0.2, 0.4, 0.6));
            expect(DEFAULT_TINT).toEqual(new Color(0.2, 0.4, 0.6));
        });

        it('returns the very value it was given', () => {
            const element = gadget();
            const tint = new Color(1, 0, 0);

            element.tint = tint;

            expect(element.tint).toBe(tint);
        });

        it('is an accessor of the class, so an element has no property of its own to shadow it', () => {
            const element = gadget();

            element.size = 3;

            expect('size' in element).toBe(true);
            expect(Object.getOwnPropertyNames(element)).not.toContain('size');
            expect(Object.getOwnPropertyDescriptor(Gadget.prototype, 'size')?.set).toBeTypeOf('function');
        });
    });

    describe('an attribute', () => {
        it('is parsed and assigned to its property', () => {
            const element = gadget();

            element.setAttribute('label', 'named');
            element.setAttribute('limit', '8');
            element.setAttribute('mode', 'high');
            element.setAttribute('size', '4.5');
            element.setAttribute('tint', '1 0 0');
            element.setAttribute('visible', 'false');

            expect(element.label).toBe('named');
            expect(element.limit).toBe(8);
            expect(element.mode).toBe('high');
            expect(element.size).toBe(4.5);
            expect(element.tint).toEqual(new Color(1, 0, 0));
            expect(element.visible).toBe(false);
        });

        it('restores the default when it is removed', () => {
            const element = gadget();
            element.setAttribute('limit', '8');
            element.setAttribute('size', '4.5');
            element.setAttribute('tint', '1 0 0');

            element.removeAttribute('limit');
            element.removeAttribute('size');
            element.removeAttribute('tint');

            expect(element.limit).toBeNull();
            expect(element.size).toBe(1);
            expect(element.tint).toEqual(DEFAULT_TINT);
        });

        it('falls back to the default, with a warning, when its value does not parse', () => {
            const element = gadget();
            element.size = 9;

            element.setAttribute('size', 'big');

            expect(element.size).toBe(1);
            warnings.expect("Invalid value 'big' for attribute 'size'. Expected a finite number. Using '1'.");
        });

        it('is reported as the schema’s own, and one the schema does not declare is not', () => {
            const element = gadget();

            expect(applyAttribute(element, 'size', '6')).toBe(true);
            expect(element.size).toBe(6);

            expect(applyAttribute(element, 'title', 'elsewhere')).toBe(false);
            expect(applyAttribute(element, 'caption', 'the engine name')).toBe(false);
            expect(element.label).toBe('untitled');
        });
    });

    describe('writing through', () => {
        it('writes a property to the engine object', () => {
            const element = gadgetWithEngine();

            element.size = 7;
            element.visible = false;

            expect(element.engine.size).toBe(7);
            expect(element.engine.visible).toBe(false);
        });

        it('writes a changed attribute to the engine object', () => {
            const element = gadgetWithEngine();

            element.setAttribute('size', '7');
            expect(element.engine.size).toBe(7);

            element.removeAttribute('size');
            expect(element.engine.size).toBe(1);
        });

        it('keeps the value, and touches nothing else, while there is no engine object', () => {
            const element = gadget();

            element.size = 7;
            element.watcher = 'anyone';

            expect(element.size).toBe(7);
            expect(written).toEqual([]);
        });

        it('gives the engine a name it takes as it is', () => {
            const element = gadgetWithEngine();

            element.shape = 'square';

            expect(element.engine.shape).toBe('square');
        });

        it('gives the engine the value a map has for a name', () => {
            const element = gadgetWithEngine();

            element.mode = 'high';

            expect(element.engine.mode).toBe(20);
        });

        it('gives the engine the default’s value for a name the map lacks', () => {
            const element = gadgetWithEngine();
            element.mode = 'high';

            // Only script can assign such a name: the attribute's parser rejects it
            (element as unknown as { mode: string }).mode = 'medium';

            expect(element.engine.mode).toBe(10);
        });

        it('converts a value on its way to the engine, and keeps the property as it was given', () => {
            const element = gadgetWithEngine();

            element.twice = 3;

            expect(element.engine.doubled).toBe(6);
            expect(element.twice).toBe(3);
        });

        it('writes to the engine property an entry names, not to one of its own name', () => {
            const element = gadgetWithEngine();

            element.label = 'named';

            expect(element.engine.caption).toBe('named');
            expect('label' in element.engine).toBe(false);
        });

        it('hands a conversion the element as well as the value', () => {
            const element = gadgetWithEngine();

            element.watcher = 'anyone';

            expect(converted).toEqual(['anyone']);
            expect(element.engine.owner).toBe(element);
        });

        it('runs a conversion only when there is an engine object to write to', () => {
            const element = gadget();

            // A conversion can resolve a reference and warn when it does not resolve, which must
            // not happen for an element that has nothing to give the result to
            element.watcher = 'no one yet';
            expect(converted).toEqual([]);

            element.engine = new Engine();
            element.watcher = 'someone';
            expect(converted).toEqual(['someone']);
        });

        it('calls the function it was given after each write, with the element', () => {
            const element = gadgetWithEngine();

            element.size = 7;
            element.setAttribute('visible', 'false');

            expect(written).toEqual([element, element]);
        });
    });

    describe('engineData', () => {
        it('carries every value as the engine takes it, under the engine’s names', () => {
            const element = gadget();
            element.label = 'named';
            element.mode = 'high';
            element.twice = 5;

            expect(engineData(element)).toEqual({
                caption: 'named',
                doubled: 10,
                limit: -1,
                mode: 20,
                owner: element,
                shape: 'round',
                size: 1,
                tint: DEFAULT_TINT,
                visible: true
            });
        });

        it('needs no engine object, since it is what one is created with', () => {
            const element = gadget();

            expect(element.engine).toBeNull();
            expect(engineData(element)).toHaveProperty('size', 1);
        });

        it('is empty for an element whose class has no schema', () => {
            expect(engineData(document.createElement('test-plain'))).toEqual({});
        });
    });

    describe('a derived class', () => {
        it('has the properties and attributes of its base class as well as its own', () => {
            const element = document.createElement('test-derived') as Derived;
            element.engine = new DerivedEngine();

            element.setAttribute('size', '7');
            element.setAttribute('extra', '2');

            expect(element.size).toBe(7);
            expect(element.extra).toBe(2);
            expect(element.engine.size).toBe(7);
            expect(element.engine.extra).toBe(2);
            expect(engineData(element)).toMatchObject({ extra: 2, size: 7 });
        });
    });

    describe('a class with more than one schema', () => {
        it('has the attributes of each', () => {
            expect(attributeNames(Pair)).toEqual(['quiet', 'loud']);
        });

        it('calls a schema’s function after a write to one of its own properties only', () => {
            const element = document.createElement('test-pair') as Pair;
            element.engine = new PairEngine();

            element.quiet = 'a label';
            expect(element.engine.quiet).toBe('a label');
            expect(heard).toEqual([]);

            element.loud = 11;
            expect(element.engine.loud).toBe(11);
            expect(heard).toEqual([element]);
        });
    });

    describe('the kinds', () => {
        /**
         * One row per kind: what it makes of an attribute's text, and its default. The parsers
         * have a suite of their own in test/unit/parse.test.ts; this holds each kind to the right
         * parser and to the default it was given.
         */
        const FLAGS = new Map([
            ['a', 1],
            ['b', 2],
            ['c', 4]
        ]);
        const kinds: [
            kind: string,
            spec: { parse: (value: string | null, attribute: string) => unknown },
            text: string,
            parsed: unknown,
            absent: unknown
        ][] = [
            ['bool', attr.bool(false), '', true, false],
            [
                'boundingBox',
                attr.boundingBox(null),
                '0 2 0 5 2 5',
                new BoundingBox(new Vec3(0, 2, 0), new Vec3(5, 2, 5)),
                null
            ],
            ['color', attr.color(Color.WHITE), '#ff0000', new Color(1, 0, 0), new Color(1, 1, 1)],
            ['flags', attr.flags(FLAGS, 'a b'), 'a c', 5, 3],
            ['number', attr.number(7), '2.5', 2.5, 7],
            ['number, with no default', attr.number(null), '2.5', 2.5, null],
            ['oneOf, of names', attr.oneOf(['round', 'square'], 'round'), 'square', 'square', 'round'],
            ['oneOf, of a map', attr.oneOf(MODES, 'low'), 'high', 'high', 'low'],
            ['quat', attr.quat(Quat.IDENTITY), '0 90 0', new Quat().setFromEulerAngles(0, 90, 0), new Quat()],
            ['string', attr.string('unset'), 'set', 'set', 'unset'],
            ['vec2', attr.vec2(Vec2.ZERO), '1 2', new Vec2(1, 2), new Vec2()],
            ['vec3', attr.vec3(Vec3.ONE), '1 2 3', new Vec3(1, 2, 3), new Vec3(1, 1, 1)],
            ['vec4', attr.vec4(Vec4.ZERO), '1 2 3 4', new Vec4(1, 2, 3, 4), new Vec4()]
        ];

        it.for(kinds)('%s parses its attribute, and defaults when it is absent', ([, spec, text, parsed, absent]) => {
            expect(spec.parse(text, 'attribute')).toEqual(parsed);
            expect(spec.parse(null, 'attribute')).toEqual(absent);
        });

        it('planes parses a list of planes, and defaults to none', () => {
            const planes = attr.planes().parse('0 1 0 2, 1 0 0 0', 'attribute');

            expect(planes).toHaveLength(2);
            expect(planes[0].normal).toEqual(new Vec3(0, 1, 0));
            expect(planes[0].distance).toBe(2);
            expect(attr.planes().parse(null, 'attribute')).toEqual([]);
        });

        it('hands out a copy of a default that is an object, never the default itself', () => {
            expect(attr.vec3(Vec3.ONE).parse(null, 'attribute')).not.toBe(Vec3.ONE);
            expect(attr.color(DEFAULT_TINT).parse(null, 'attribute')).not.toBe(DEFAULT_TINT);
        });
    });

    describe('the compiler', () => {
        it('rejects a schema that disagrees with the class or with the engine object', () => {
            // The assertions are the @ts-expect-error markers in mustNotCompile, above
            expect(mustNotCompile).toBeTypeOf('function');
        });
    });
});
