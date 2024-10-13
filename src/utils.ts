import { Color } from 'playcanvas';

/**
 * Parse a color string into a Color object. String can be in the format of '#rgb', '#rgba',
 * '#rrggbb', '#rrggbbaa', or a string of 3 or 4 comma-delimited numbers.
 *
 * @param {string} value - The color string to parse
 * @returns {Color} The parsed Color object
 */
export const parseColor = (value: string): Color => {
    if (value.startsWith('#')) {
        return new Color().fromString(value);
    }

    const components = value.split(',').map(Number);
    return new Color(components);
};
