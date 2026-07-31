import { Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import {
    parseBool,
    parseColor,
    parseComponents,
    parseEnum,
    parseNumber,
    parseQuat,
    parseTags,
    parseVec2,
    parseVec3,
    parseVec4
} from '../../src/utils';
import { useGuard } from '../helpers/guard';

/**
 * The exact warning text is asserted at this tier, because the message is what a user actually
 * sees, and because the interpolated default is rendered by the engine's own toString():
 * Vec2 '[x, y]', Vec3 '[x, y, z]', Vec4 and Quat '[x, y, z, w]', Color '#rrggbb'.
 *
 * getEntity() is the one export that touches the DOM, so it is covered by
 * test/elements/get-entity.test.ts rather than here.
 */
describe('utils', () => {
    const { warnings } = useGuard();

    describe('parseBool', () => {
        it.for([
            [null, true, true],
            [null, false, false],
            ['false', true, false],
            ['true', false, true],
            // A bare boolean attribute, e.g. <pc-light cast-shadows>
            ['', false, true],
            // Case sensitive: only the exact string 'false' is falsy
            ['False', false, true],
            ['FALSE', false, true],
            // Not truthiness - '0' is a non-'false' string, so it is true
            ['0', false, true],
            // Not trimmed either
            [' false ', true, true],
            ['no', false, true]
        ] as [string | null, boolean, boolean][])('parses %o against default %o as %o', ([value, defaultValue, expected]) => {
            expect(parseBool(value, defaultValue)).toBe(expected);
        });

        it('never warns, because every value is valid', () => {
            parseBool('nonsense', false);
            expect(warnings.seen).toEqual([]);
        });
    });

    describe('parseTags', () => {
        it.for([
            ['enemy', ['enemy']],
            ['enemy,flying', ['enemy', 'flying']],
            // Whitespace around each name is trimmed
            ['enemy, flying ,boss', ['enemy', 'flying', 'boss']],
            ['  enemy  ', ['enemy']],
            // Empty names are discarded, so a trailing comma or a doubled separator does not
            // produce a blank tag. This is what makes the two call sites in entity.ts agree.
            ['enemy,', ['enemy']],
            [',enemy', ['enemy']],
            ['enemy,,flying', ['enemy', 'flying']],
            ['', []],
            ['   ', []],
            [',', []],
            [',,,', []],
            // Duplicates are passed through - the engine's Tags.add dedupes
            ['enemy,enemy', ['enemy', 'enemy']],
            // Internal whitespace is preserved: only the ends are trimmed
            ['big enemy', ['big enemy']]
        ] as [string, string[]][])('parses %o as %o', ([value, expected]) => {
            expect(parseTags(value)).toEqual(expected);
        });

        it('returns an empty array by default when the attribute is absent', () => {
            expect(parseTags(null)).toEqual([]);
        });

        it('returns the supplied default when the attribute is absent', () => {
            expect(parseTags(null, ['fallback'])).toEqual(['fallback']);
        });

        it('never returns the caller default instance, so the result cannot alias it', () => {
            const defaultValue = ['fallback'];
            const result = parseTags(null, defaultValue);

            expect(result).not.toBe(defaultValue);
            result.push('mutated');
            expect(defaultValue).toEqual(['fallback']);
        });

        it('never warns, because every value is valid', () => {
            parseTags('');
            parseTags(',,,');
            parseTags('anything at all');
            expect(warnings.seen).toEqual([]);
        });
    });

    describe('parseComponents', () => {
        it.for([
            ['1 2 3', 3, [1, 2, 3]],
            ['  1   2   3  ', 3, [1, 2, 3]],
            ['1\t2\n3', 3, [1, 2, 3]],
            ['.5 -2 +3', 3, [0.5, -2, 3]],
            ['1e3 2 3', 3, [1000, 2, 3]],
            // Number() accepts hex, so this is parsed rather than rejected
            ['0x10 2 3', 3, [16, 2, 3]],
            // Wrong arity in both directions
            ['1 2', 3, null],
            ['1 2 3 4', 3, null],
            // Non-finite values are rejected, not passed through
            ['1 Infinity 3', 3, null],
            ['1 NaN 3', 3, null],
            ['1,5', 1, null],
            ['', 3, null],
            // ''.trim().split(/\s+/) is [''], and Number('') is 0, so a single component parses
            // as [0]. No caller asks for one component, so this documents rather than endorses.
            ['', 1, [0]]
        ] as [string, number, number[] | null][])('splits %o into %o components as %o', ([value, count, expected]) => {
            expect(parseComponents(value, count)).toEqual(expected);
        });

        it('never warns, because reporting is left to the caller', () => {
            parseComponents('nonsense', 3);
            expect(warnings.seen).toEqual([]);
        });
    });

    describe('parseNumber', () => {
        it.for([
            ['42', 42],
            ['  7  ', 7],
            ['-0.5', -0.5],
            ['1e3', 1000],
            ['0x10', 16]
        ] as [string, number][])('parses %o as %o', ([value, expected]) => {
            expect(parseNumber(value, 0, 'fov')).toBe(expected);
        });

        it('returns the default when the attribute is absent, without warning', () => {
            expect(parseNumber(null, 45, 'fov')).toBe(45);
            expect(warnings.seen).toEqual([]);
        });

        it('falls back for an empty string, which Number would otherwise coerce to 0', () => {
            expect(parseNumber('', 45, 'fov')).toBe(45);
            warnings.expect('Invalid value \'\' for attribute \'fov\'. Expected a finite number. Using \'45\'.');
        });

        it('falls back for whitespace only', () => {
            expect(parseNumber('   ', 45, 'fov')).toBe(45);
            warnings.expect('Invalid value \'   \' for attribute \'fov\'. Expected a finite number. Using \'45\'.');
        });

        it.for(['abc', 'Infinity', '-Infinity', 'NaN', '1,5'])('falls back and warns for %o', (value) => {
            expect(parseNumber(value, 45, 'fov')).toBe(45);
            warnings.expect(`Invalid value '${value}' for attribute 'fov'. Expected a finite number. Using '45'.`);
        });

        it('renders a null default in the warning', () => {
            expect(parseNumber('abc', null, 'duration')).toBeNull();
            warnings.expect('Invalid value \'abc\' for attribute \'duration\'. Expected a finite number. Using \'null\'.');
        });
    });

    describe('parseEnum', () => {
        const projections = ['perspective', 'orthographic'] as const;

        it('returns the value when it is valid', () => {
            expect(parseEnum('orthographic', projections, 'perspective', 'projection')).toBe('orthographic');
        });

        it('returns the default when the attribute is absent, without warning', () => {
            expect(parseEnum(null, projections, 'perspective', 'projection')).toBe('perspective');
            expect(warnings.seen).toEqual([]);
        });

        it('accepts a ReadonlyMap and validates against its keys', () => {
            const tonemaps = new Map([['none', 0], ['filmic', 2], ['aces', 4]]);
            expect(parseEnum('filmic', tonemaps, 'none', 'tonemap')).toBe('filmic');
        });

        it('lists a map\'s keys in insertion order when the value is invalid', () => {
            const tonemaps = new Map([['none', 0], ['filmic', 2], ['aces', 4]]);
            expect(parseEnum('bogus', tonemaps, 'none', 'tonemap')).toBe('none');
            warnings.expect('Invalid value \'bogus\' for attribute \'tonemap\'. Valid values: none, filmic, aces. Using \'none\'.');
        });

        it('warns for an empty string, which is not the same as an absent attribute', () => {
            expect(parseEnum('', projections, 'perspective', 'projection')).toBe('perspective');
            warnings.expect('Invalid value \'\' for attribute \'projection\'. Valid values: perspective, orthographic. Using \'perspective\'.');
        });

        it('is case sensitive', () => {
            expect(parseEnum('Orthographic', projections, 'perspective', 'projection')).toBe('perspective');
            warnings.expect('Invalid value \'Orthographic\' for attribute \'projection\'.');
        });
    });

    describe('parseColor', () => {
        it.for([
            // CSS colour names, matched case insensitively via toLowerCase()
            ['red', [1, 0, 0, 1]],
            ['REBECCAPURPLE', [0.4, 0.2, 0.6, 1]],
            // Hex, including the 3- and 4-digit short forms
            ['#f00', [1, 0, 0, 1]],
            ['#f008', [1, 0, 0, 136 / 255]],
            ['#ff0000', [1, 0, 0, 1]],
            ['#FF0000', [1, 0, 0, 1]],
            ['#ff000080', [1, 0, 0, 128 / 255]],
            // 3 or 4 space-separated components
            ['1 0.5 0.25', [1, 0.5, 0.25, 1]],
            ['1 0.5 0.25 0.5', [1, 0.5, 0.25, 0.5]],
            // Out-of-range components are not clamped. Pinned, not endorsed.
            ['2 2 2', [2, 2, 2, 1]]
        ] as [string, [number, number, number, number]][])('parses %o', ([value, [r, g, b, a]]) => {
            const color = parseColor(value, Color.WHITE, 'diffuse');
            expect(color.r).toBeCloseTo(r, 5);
            expect(color.g).toBeCloseTo(g, 5);
            expect(color.b).toBeCloseTo(b, 5);
            expect(color.a).toBeCloseTo(a, 5);
        });

        it('returns the default when the attribute is absent, without warning', () => {
            expect(parseColor(null, Color.WHITE, 'diffuse')).toEqual(Color.WHITE);
            expect(warnings.seen).toEqual([]);
        });

        it.for([
            'notacolor',
            // CSS functional syntax is deliberately not supported
            'rgb(255,0,0)',
            '#ff',
            '#12345',
            '1 2',
            '1 2 3 4 5'
        ])('falls back and warns for %o', (value) => {
            expect(parseColor(value, Color.WHITE, 'diffuse')).toEqual(Color.WHITE);
            warnings.expect(
                `Invalid value '${value}' for attribute 'diffuse'. ` +
                'Expected a CSS color name, a hex color or 3 or 4 space-separated numbers. ' +
                'Using \'#ffffff\'.'
            );
        });

        it('renders a non-white default in the warning as a hex string', () => {
            // pc-camera's real clear-color default. Math.round(0.75 * 255) is 191, i.e. 0xbf.
            const clearColor = new Color(0.75, 0.75, 0.75, 1);
            expect(parseColor('nope', clearColor, 'clear-color')).toEqual(clearColor);
            warnings.expect('Using \'#bfbfbf\'.');
        });
    });

    describe('parseVec2', () => {
        it('parses 2 components', () => {
            expect(parseVec2('1 2', Vec2.ZERO, 'anchor')).toEqual(new Vec2(1, 2));
        });

        it.for(['1', '1 2 3', 'bad'])('falls back and warns for %o', (value) => {
            expect(parseVec2(value, Vec2.ZERO, 'anchor')).toEqual(Vec2.ZERO);
            warnings.expect(
                `Invalid value '${value}' for attribute 'anchor'. Expected 2 space-separated numbers. Using '[0, 0]'.`
            );
        });
    });

    describe('parseVec3', () => {
        it('parses 3 components', () => {
            expect(parseVec3('1 2 3', Vec3.ZERO, 'position')).toEqual(new Vec3(1, 2, 3));
        });

        it('returns the default when the attribute is absent, without warning', () => {
            expect(parseVec3(null, Vec3.ONE, 'scale')).toEqual(Vec3.ONE);
            expect(warnings.seen).toEqual([]);
        });

        it.for(['1 2', '1 2 3 4', 'bad'])('falls back and warns for %o', (value) => {
            expect(parseVec3(value, Vec3.ZERO, 'position')).toEqual(Vec3.ZERO);
            warnings.expect(
                `Invalid value '${value}' for attribute 'position'. Expected 3 space-separated numbers. Using '[0, 0, 0]'.`
            );
        });

        it('passes a null default through', () => {
            expect(parseVec3(null, null, 'position')).toBeNull();
        });
    });

    describe('parseVec4', () => {
        it('parses 4 components', () => {
            expect(parseVec4('1 2 3 4', Vec4.ZERO, 'rect')).toEqual(new Vec4(1, 2, 3, 4));
        });

        it.for(['1 2 3', '1 2 3 4 5', 'bad'])('falls back and warns for %o', (value) => {
            expect(parseVec4(value, Vec4.ONE, 'rect')).toEqual(Vec4.ONE);
            warnings.expect(
                `Invalid value '${value}' for attribute 'rect'. Expected 4 space-separated numbers. Using '[1, 1, 1, 1]'.`
            );
        });
    });

    describe('parseQuat', () => {
        it('interprets 3 components as Euler angles in degrees', () => {
            const expected = new Quat().setFromEulerAngles(0, 90, 0);
            const actual = parseQuat('0 90 0', Quat.IDENTITY, 'rotation') as Quat;
            expect(actual.x).toBeCloseTo(expected.x, 5);
            expect(actual.y).toBeCloseTo(expected.y, 5);
            expect(actual.z).toBeCloseTo(expected.z, 5);
            expect(actual.w).toBeCloseTo(expected.w, 5);
        });

        it('round-trips through getEulerAngles', () => {
            const euler = (parseQuat('10 20 30', Quat.IDENTITY, 'rotation') as Quat).getEulerAngles();
            expect(euler.x).toBeCloseTo(10, 4);
            expect(euler.y).toBeCloseTo(20, 4);
            expect(euler.z).toBeCloseTo(30, 4);
        });

        it.for(['0 90', '0 90 0 1', 'bad'])('falls back and warns for %o', (value) => {
            expect(parseQuat(value, Quat.IDENTITY, 'rotation')).toEqual(Quat.IDENTITY);
            warnings.expect(
                `Invalid value '${value}' for attribute 'rotation'. Expected 3 space-separated numbers. Using '[0, 0, 0, 1]'.`
            );
        });
    });

    /**
     * cloneDefault is module private, so it is exercised through the parsers. The engine's shared
     * math constants are Object.freeze'd, which turns the aliasing invariant into a proof rather
     * than an approximation: if a parser returned the default by reference, writing to the result
     * would throw in strict mode.
     */
    describe('cloneDefault', () => {
        it('confirms the engine constants really are frozen, so the proof below holds', () => {
            expect(Object.isFrozen(Vec3.ZERO)).toBe(true);
            expect(Object.isFrozen(Color.WHITE)).toBe(true);
        });

        it('never returns the caller default instance, on the absent path', () => {
            expect(parseVec3(null, Vec3.ZERO, 'position')).not.toBe(Vec3.ZERO);
        });

        it('never returns the caller default instance, on the invalid path', () => {
            expect(parseVec3('bad', Vec3.ZERO, 'position')).not.toBe(Vec3.ZERO);
            warnings.expect('Expected 3 space-separated numbers');
        });

        it('returns a distinct instance on every call', () => {
            const first = parseVec3(null, Vec3.ZERO, 'position');
            const second = parseVec3(null, Vec3.ZERO, 'position');
            expect(first).not.toBe(second);
        });

        it('returns a writable clone of a frozen engine constant', () => {
            const result = parseVec3(null, Vec3.ZERO, 'position') as Vec3;
            expect(() => {
                result.x = 5;
            }).not.toThrow();
            expect(result.x).toBe(5);
            expect(Vec3.ZERO.x).toBe(0);
        });

        it.for([
            ['parseVec2', () => parseVec2(null, Vec2.ZERO, 'anchor'), Vec2.ZERO],
            ['parseVec4', () => parseVec4(null, Vec4.ONE, 'rect'), Vec4.ONE],
            ['parseQuat', () => parseQuat(null, Quat.IDENTITY, 'rotation'), Quat.IDENTITY],
            ['parseColor', () => parseColor(null, Color.WHITE, 'diffuse'), Color.WHITE]
        ] as [string, () => object, object][])('applies to %s too', ([, parse, constant]) => {
            const result = parse();
            expect(result).not.toBe(constant);
            expect(result).toEqual(constant);
        });
    });
});
