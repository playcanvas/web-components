import { Color } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { CSS_COLORS } from '../../src/colors';

describe('CSS_COLORS', () => {
    const entries = Object.entries(CSS_COLORS);

    it('contains the full CSS named-colour set', () => {
        expect(entries).toHaveLength(148);
    });

    it('keys are lowercase letters only, so the toLowerCase() lookup in parseColor always hits', () => {
        const malformed = entries.map(([name]) => name).filter(name => !/^[a-z]+$/.test(name));
        expect(malformed).toEqual([]);
    });

    it('values are all 6-digit lowercase hex, which is what Color.fromString expects', () => {
        const malformed = entries.filter(([, hex]) => !/^#[0-9a-f]{6}$/.test(hex));
        expect(malformed).toEqual([]);
    });

    it('every value round-trips through Color.fromString without producing NaN', () => {
        const broken = entries.filter(([, hex]) => {
            const { r, g, b, a } = new Color().fromString(hex);
            return ![r, g, b, a].every(Number.isFinite);
        });
        expect(broken).toEqual([]);
    });

    it.for([
        ['aqua', 'cyan'],
        ['fuchsia', 'magenta'],
        ['gray', 'grey'],
        ['darkgray', 'darkgrey'],
        ['dimgray', 'dimgrey'],
        ['lightgray', 'lightgrey'],
        ['slategray', 'slategrey'],
        ['darkslategray', 'darkslategrey'],
        ['lightslategray', 'lightslategrey']
    ])('%s and %s are the same colour', ([first, second]) => {
        expect(CSS_COLORS[first]).toBe(CSS_COLORS[second]);
    });

    it.for([
        ['black', '#000000'],
        ['white', '#ffffff'],
        ['red', '#ff0000'],
        ['rebeccapurple', '#663399'],
        ['tomato', '#ff6347'],
        ['mediumspringgreen', '#00fa9a']
    ])('%s is %s', ([name, hex]) => {
        expect(CSS_COLORS[name]).toBe(hex);
    });

    it('omits transparent, which has no opaque hex equivalent', () => {
        expect(CSS_COLORS.transparent).toBeUndefined();
    });
});
