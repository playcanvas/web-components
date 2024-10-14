import { Color, Quat, Vec3 } from 'playcanvas';

/**
 * Parse a color string into a Color object. String can be in the format of '#rgb', '#rgba',
 * '#rrggbb', '#rrggbbaa', or a string of 3 or 4 comma-delimited numbers.
 *
 * @param value - The color string to parse.
 * @returns The parsed Color object.
 */
export const parseColor = (value: string): Color => {
    if (value.startsWith('#')) {
        return new Color().fromString(value);
    }

    const components = value.split(',').map(Number);
    return new Color(components);
};

export const parseVec3 = (value: string): Vec3 => {
    const components = value.split(',').map(Number);
    return new Vec3(components);
};
