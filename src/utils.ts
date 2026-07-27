import { Color, Entity, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import { CSS_COLORS } from './colors';

/**
 * Parse a boolean attribute value. The same rules apply to every boolean attribute:
 *
 * - Attribute absent (or removed): the supplied default is used.
 * - Attribute set to the string 'false': `false`.
 * - Attribute present with any other value, including the empty string of a bare boolean
 *   attribute (e.g. `<pc-light cast-shadows>`): `true`.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or removed.
 * @returns The parsed boolean.
 */
export const parseBool = (value: string | null, defaultValue: boolean): boolean => {
    return value === null ? defaultValue : value !== 'false';
};

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

/**
 * Resolves an enum attribute value against its set of valid names. Returns the value when it is
 * one of the valid names. Returns `defaultValue` when the attribute is absent (`null`), or when
 * the value is invalid — the latter also logs a warning listing the valid names.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param valid - The valid names: an array, or a map whose keys are the valid names.
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The resolved enum name.
 */
export const parseEnum = <T extends string>(
    value: string | null,
    valid: readonly T[] | ReadonlyMap<T, number>,
    defaultValue: T,
    attribute: string
): T => {
    if (value === null) {
        return defaultValue;
    }
    const names = Array.isArray(valid) ? valid : [...(valid as ReadonlyMap<T, number>).keys()];
    if (names.includes(value as T)) {
        return value as T;
    }
    console.warn(`Invalid value '${value}' for attribute '${attribute}'. Valid values: ${names.join(', ')}. Using '${defaultValue}'.`);
    return defaultValue;
};

/**
 * Resolves a reference string to the {@link Entity} backing a `<pc-entity>` element. The reference
 * can be a CSS selector (e.g. `#my-id`, `pc-entity[name="Foo"]`), a bare element id, or a bare
 * entity name. Returns `null` if no matching element (or backing entity) is found.
 *
 * @param ref - The reference string to resolve.
 * @returns The resolved entity, or `null`.
 */
export const getEntity = (ref: string): Entity | null => {
    if (!ref) {
        return null;
    }

    let element: Element | null = null;

    // Try the reference as a CSS selector. An invalid selector (e.g. a bare name containing
    // spaces) throws, in which case we fall back to id/name lookups below.
    try {
        element = document.querySelector(ref);
    } catch {
        element = null;
    }

    if (!element) {
        element = document.getElementById(ref) ?? document.querySelector(`pc-entity[name="${ref}"]`);
    }

    return (element as { entity?: Entity } | null)?.entity ?? null;
};
