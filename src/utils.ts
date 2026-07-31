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
 * Parse a tags attribute value. The expected format is a comma-separated list of tag names
 * (e.g. 'enemy, flying'). Surrounding whitespace is trimmed from each name and empty names are
 * discarded, so a trailing comma or a doubled separator does not produce a blank tag. Returns a
 * copy of `defaultValue` when the attribute is absent or removed (`null`).
 *
 * Every value is valid, so this never warns.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or removed.
 * @returns The parsed tag names.
 */
export const parseTags = (value: string | null, defaultValue: string[] = []): string[] => {
    if (value === null) {
        // Copied for the same reason cloneDefault exists: a parsed result must never alias the
        // caller's default, or a later mutation would write back through it.
        return [...defaultValue];
    }
    return value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
};

/**
 * Splits an attribute value into exactly `count` numeric components. Returns `null` when the
 * value does not consist of exactly `count` whitespace-separated finite numbers.
 *
 * @param value - The value to split.
 * @param count - The required number of components.
 * @returns The parsed components, or `null`.
 * @ignore
 */
export const parseComponents = (value: string, count: number): number[] | null => {
    const components = value.trim().split(/\s+/).map(Number);
    if (components.length !== count || components.some(component => !Number.isFinite(component))) {
        return null;
    }
    return components;
};

/**
 * Clones a math-type default so parsed results never alias the caller's default instance. This
 * is what makes it safe to pass the engine's shared frozen constants (e.g. `Vec3.ZERO`,
 * `Color.WHITE`) as defaults.
 *
 * @param value - The default value to clone (`null` is passed through).
 * @returns The cloned value.
 */
const cloneDefault = <T extends Color | Quat | Vec2 | Vec3 | Vec4 | null>(value: T): T => {
    return (value === null ? null : value.clone()) as T;
};

/**
 * Parse a color attribute value. The expected format is a CSS color name (e.g. 'rebeccapurple'),
 * a hex color (e.g. '#ff0000' or '#f00'), or 3 or 4 space-separated numbers in the range 0 to 1
 * (e.g. '1 0.5 0.5' or '1 0.5 0.5 0.5'). Returns `defaultValue` (cloned, when it is a color)
 * when the attribute is absent (`null`), or when the value is malformed — the latter also logs
 * a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed Color object.
 */
export const parseColor = <T extends Color | null>(value: string | null, defaultValue: T, attribute: string): Color | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }

    // A CSS color name (e.g. 'rebeccapurple')
    const hexColor = CSS_COLORS[value.toLowerCase()];
    if (hexColor) {
        return new Color().fromString(hexColor);
    }

    // A hex color (e.g. '#ff0000'), expanding short forms (e.g. '#f00') for Color.fromString
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
        let hex = value.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            hex = hex.split('').map(char => char + char).join('');
        }
        return new Color().fromString(`#${hex}`);
    }

    // 3 or 4 space-separated components (e.g. '1 0.5 0.5')
    const components = parseComponents(value, 4) ?? parseComponents(value, 3);
    if (components) {
        return new Color(components);
    }

    console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected a CSS color name, a hex color or 3 or 4 space-separated numbers. Using '${defaultValue}'.`);
    return cloneDefault(defaultValue);
};

/**
 * Parse an Euler-angles attribute value into a quaternion. The expected format is 3
 * space-separated angles in degrees (e.g. '0 90 0'). Returns `defaultValue` (cloned, when it is
 * a quaternion) when the attribute is absent (`null`), or when the value is malformed — the
 * latter also logs a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed Quat object.
 */
export const parseQuat = <T extends Quat | null>(value: string | null, defaultValue: T, attribute: string): Quat | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 3);
    if (!components) {
        console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected 3 space-separated numbers. Using '${defaultValue}'.`);
        return cloneDefault(defaultValue);
    }
    return new Quat().setFromEulerAngles(components[0], components[1], components[2]);
};

/**
 * Parse a Vec2 attribute value. The expected format is 2 space-separated numbers (e.g. '1 2').
 * Returns `defaultValue` (cloned, when it is a vector) when the attribute is absent (`null`),
 * or when the value is malformed — the latter also logs a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed Vec2 object.
 */
export const parseVec2 = <T extends Vec2 | null>(value: string | null, defaultValue: T, attribute: string): Vec2 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 2);
    if (!components) {
        console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected 2 space-separated numbers. Using '${defaultValue}'.`);
        return cloneDefault(defaultValue);
    }
    return new Vec2(components);
};

/**
 * Parse a Vec3 attribute value. The expected format is 3 space-separated numbers (e.g. '1 2 3').
 * Returns `defaultValue` (cloned, when it is a vector) when the attribute is absent (`null`),
 * or when the value is malformed — the latter also logs a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed Vec3 object.
 */
export const parseVec3 = <T extends Vec3 | null>(value: string | null, defaultValue: T, attribute: string): Vec3 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 3);
    if (!components) {
        console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected 3 space-separated numbers. Using '${defaultValue}'.`);
        return cloneDefault(defaultValue);
    }
    return new Vec3(components);
};

/**
 * Parse a Vec4 attribute value. The expected format is 4 space-separated numbers
 * (e.g. '1 2 3 4'). Returns `defaultValue` (cloned, when it is a vector) when the attribute is
 * absent (`null`), or when the value is malformed — the latter also logs a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed Vec4 object.
 */
export const parseVec4 = <T extends Vec4 | null>(value: string | null, defaultValue: T, attribute: string): Vec4 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 4);
    if (!components) {
        console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected 4 space-separated numbers. Using '${defaultValue}'.`);
        return cloneDefault(defaultValue);
    }
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
 * Parses a number attribute value. Returns the parsed number when the value is a finite number.
 * Returns `defaultValue` when the attribute is absent (`null`), or when the value is not a
 * finite number — the latter also logs a warning.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The parsed number.
 */
export const parseNumber = <T extends number | null>(value: string | null, defaultValue: T, attribute: string): number | T => {
    if (value === null) {
        return defaultValue;
    }
    const number = value.trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(number)) {
        console.warn(`Invalid value '${value}' for attribute '${attribute}'. Expected a finite number. Using '${defaultValue}'.`);
        return defaultValue;
    }
    return number;
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
