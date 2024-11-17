import { Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import { CSS_COLORS } from './colors';

/**
 * Parse a color string into a Color object. String can be in the format of '#rgb', '#rgba',
 * '#rrggbb', '#rrggbbaa', or a string of 3 or 4 comma-delimited numbers.
 *
 * @param value - The color string to parse.
 * @returns The parsed Color object.
 */
export const parseColor = (value: string): Color => {
    // Check if it's a CSS color name first
    const hexColor = CSS_COLORS[value.toLowerCase()];
    if (hexColor) {
        return new Color().fromString(hexColor);
    }

    if (value.startsWith('#')) {
        return new Color().fromString(value);
    }

    const components = value.split(' ').map(Number);
    return new Color(components);
};

/**
 * Parse an Euler angles string into a Quat object. String can be in the format of 'x,y,z'.
 *
 * @param value - The Euler angles string to parse.
 * @returns The parsed Quat object.
 */
export const parseQuat = (value: string): Quat => {
    const [x, y, z] = value.split(' ').map(Number);
    const q = new Quat();
    q.setFromEulerAngles(x, y, z);
    return q;
};

/**
 * Parse a Vec2 string into a Vec2 object. String can be in the format of 'x,y'.
 *
 * @param value - The Vec2 string to parse.
 * @returns The parsed Vec2 object.
 */
export const parseVec2 = (value: string): Vec2 => {
    const components = value.split(' ').map(Number);
    return new Vec2(components);
};

/**
 * Parse a Vec3 string into a Vec3 object. String can be in the format of 'x,y,z'.
 *
 * @param value - The Vec3 string to parse.
 * @returns The parsed Vec3 object.
 */
export const parseVec3 = (value: string): Vec3 => {
    const components = value.split(' ').map(Number);
    return new Vec3(components);
};

/**
 * Parse a Vec4 string into a Vec4 object. String can be in the format of 'x,y,z,w'.
 *
 * @param value - The Vec4 string to parse.
 * @returns The parsed Vec4 object.
 */
export const parseVec4 = (value: string): Vec4 => {
    const components = value.split(' ').map(Number);
    return new Vec4(components);
};
