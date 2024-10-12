import { Color } from 'playcanvas';

/**
 * Parse a color string into a Color object. String can be in the format of
 * '#rgb', '#rgba', '#rrggbb', '#rrggbbaa', or 3 or 4 comma-delimited numbers.
 *
 * @param {string} value - The color string to parse
 * @returns {Color} The parsed Color object
 */
export const parseColor = (value) => {
    if (typeof value === 'string' && value.startsWith('#')) {
        return new Color().fromString(value);
    } else if (Array.isArray(value)) {
        return new Color(value);
    }
};
