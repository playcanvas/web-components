/**
 * Converts HTML attribute values into the values the engine expects. Every element's
 * `attributeChangedCallback` funnels through this module.
 *
 * The parsers share one contract:
 *
 * - A `null` value means the attribute is absent or was removed, and yields the supplied default.
 * - A malformed value yields the same default and logs exactly one `console.warn` naming the
 *   attribute, so misuse is reported rather than thrown — nothing here throws or rejects.
 * - A math-type default is cloned on the way out, which is what makes it safe to pass the engine's
 *   shared frozen constants (`Vec3.ZERO`, `Color.WHITE`) as defaults.
 * - `parseBool` and `parseTags` take no attribute name, because every value is valid for them and
 *   so they never warn.
 *
 * `findEntityElement` and `getEntity` are the exceptions: they resolve a reference rather than
 * parsing a literal, and return `null` instead of falling back to a default. An exact entity-name
 * match resolves lexically through the entity hierarchy first; otherwise the reference is
 * interpreted against the document as a CSS selector, element id or entity name. They also do not
 * warn - what an unresolved reference means depends on the element holding it - so elements
 * report through `resolveEntity`, which takes that meaning as parameters.
 */

import type { Entity } from 'playcanvas';
import { Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import { CSS_COLORS } from './colors';

/**
 * Splits an attribute value into exactly `count` numeric components. Returns `null` when the
 * value does not consist of exactly `count` whitespace-separated finite numbers.
 *
 * @param value - The value to split.
 * @param count - The required number of components.
 * @returns The parsed components, or `null`.
 * @internal
 */
export const parseComponents = (value: string, count: number): number[] | null => {
    const components = value.trim().split(/\s+/).map(Number);
    if (components.length !== count || components.some((component) => !Number.isFinite(component))) {
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
 * @internal
 */
export const parseBool = (value: string | null, defaultValue: boolean): boolean => {
    return value === null ? defaultValue : value !== 'false';
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
 * @internal
 */
export const parseColor = <T extends Color | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): Color | T => {
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
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        return new Color().fromString(`#${hex}`);
    }

    // 3 or 4 space-separated components (e.g. '1 0.5 0.5')
    const components = parseComponents(value, 4) ?? parseComponents(value, 3);
    if (components) {
        return new Color(components);
    }

    console.warn(
        `Invalid value '${value}' for attribute '${attribute}'. Expected a CSS color name, a hex color or 3 or 4 space-separated numbers. Using '${defaultValue}'.`
    );
    return cloneDefault(defaultValue);
};

/**
 * Resolves an enum attribute value against its set of valid names. Returns the value when it is
 * one of the valid names. Returns `defaultValue` when the attribute is absent (`null`), or when
 * the value is invalid — the latter also logs a warning listing the valid names.
 *
 * @param value - The attribute value to parse (`null` when the attribute is absent).
 * @param valid - The valid names: an array, or a map whose keys are the valid names. Only the keys
 * are read, so the map's value type is unconstrained - engine enums are mostly numeric constants,
 * but some (e.g. `SCALEMODE_BLEND`) are strings.
 * @param defaultValue - The value to use when the attribute is absent or invalid.
 * @param attribute - The attribute name, used in the warning message.
 * @returns The resolved enum name.
 * @internal
 */
export const parseEnum = <T extends string>(
    value: string | null,
    valid: readonly T[] | ReadonlyMap<T, unknown>,
    defaultValue: T,
    attribute: string
): T => {
    if (value === null) {
        return defaultValue;
    }
    const names: readonly T[] = Array.isArray(valid) ? valid : [...valid.keys()];
    if (names.includes(value as T)) {
        return value as T;
    }
    console.warn(
        `Invalid value '${value}' for attribute '${attribute}'. Valid values: ${names.join(', ')}. Using '${defaultValue}'.`
    );
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
 * @internal
 */
export const parseNumber = <T extends number | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): number | T => {
    if (value === null) {
        return defaultValue;
    }
    const number = value.trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(number)) {
        console.warn(
            `Invalid value '${value}' for attribute '${attribute}'. Expected a finite number. Using '${defaultValue}'.`
        );
        return defaultValue;
    }
    return number;
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
 * @internal
 */
export const parseQuat = <T extends Quat | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): Quat | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 3);
    if (!components) {
        console.warn(
            `Invalid value '${value}' for attribute '${attribute}'. Expected 3 space-separated numbers. Using '${defaultValue}'.`
        );
        return cloneDefault(defaultValue);
    }
    return new Quat().setFromEulerAngles(components[0], components[1], components[2]);
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
 * @internal
 */
export const parseTags = (value: string | null, defaultValue: string[] = []): string[] => {
    if (value === null) {
        // Copied for the same reason cloneDefault exists: a parsed result must never alias the
        // caller's default, or a later mutation would write back through it.
        return [...defaultValue];
    }
    return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '');
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
 * @internal
 */
export const parseVec2 = <T extends Vec2 | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): Vec2 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 2);
    if (!components) {
        console.warn(
            `Invalid value '${value}' for attribute '${attribute}'. Expected 2 space-separated numbers. Using '${defaultValue}'.`
        );
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
 * @internal
 */
export const parseVec3 = <T extends Vec3 | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): Vec3 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 3);
    if (!components) {
        console.warn(
            `Invalid value '${value}' for attribute '${attribute}'. Expected 3 space-separated numbers. Using '${defaultValue}'.`
        );
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
 * @internal
 */
export const parseVec4 = <T extends Vec4 | null>(
    value: string | null,
    defaultValue: T,
    attribute: string
): Vec4 | T => {
    if (value === null) {
        return cloneDefault(defaultValue);
    }
    const components = parseComponents(value, 4);
    if (!components) {
        console.warn(
            `Invalid value '${value}' for attribute '${attribute}'. Expected 4 space-separated numbers. Using '${defaultValue}'.`
        );
        return cloneDefault(defaultValue);
    }
    return new Vec4(components);
};

/**
 * Runs querySelector, absorbing the SyntaxError an unparseable selector throws - references are
 * arbitrary author text, so a lookup must fail to `null`, never throw.
 *
 * @param selector - The selector to query.
 * @returns The matched element, or `null`.
 */
const query = (selector: string): Element | null => {
    try {
        return document.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * Runs a lookup against one scope, checking the scope element itself before its subtree — a
 * reference deep in a cloned prefab must be able to name the prefab's root. Absorbs the
 * SyntaxError of an invalid selector like {@link query}: escaping quotes and backslashes does not
 * make arbitrary text a valid CSS string (a reference containing a newline still throws), so a
 * lookup must fail to `null`, never throw.
 *
 * @param scope - The element whose inclusive subtree to search.
 * @param selector - The selector to query.
 * @returns The matched element, or `null`.
 */
const queryScope = (scope: Element, selector: string): Element | null => {
    try {
        return scope.matches(selector) ? scope : scope.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * Reads the entity a resolved element is backing, through the `entity` accessor every
 * entity-fronting element exposes. `null` for no element, and for an element backing nothing.
 *
 * @param element - The element to read, or `null`.
 * @returns The backing entity, or `null`.
 */
const entityOf = (element: Element | null): Entity | null => {
    return (element as { entity?: Entity } | null)?.entity ?? null;
};

/**
 * The elements that front an entity: what a bare name can resolve to, and the scopes of the
 * lexical name lookup.
 */
const ENTITY_KINDS = ['pc-entity', 'pc-model', 'pc-node'] as const;

/**
 * The entity-fronting elements as one selector, for the scope walk.
 */
const ENTITY_SCOPES = ENTITY_KINDS.join(', ');

/**
 * Resolves a reference string to the element it names. The reference can be a CSS selector (e.g.
 * `#my-id`, `pc-entity[name="Foo"]`), a bare element id, or the bare name of an entity-fronting
 * element (`<pc-entity>`, `<pc-model>` or `<pc-node>` — for a node, the glTF node name it binds).
 *
 * When `from` is supplied, an exact name match resolves lexically first: the closest
 * entity-fronting ancestor's inclusive subtree, then each outer entity-fronting ancestor, then the
 * containing `<pc-app>`. This is what lets a `<template>` prefab reference its own entities by
 * name — every clone resolves within itself before the document-wide lookup below could reach an
 * earlier clone — provided the prefab has a single entity-fronting root to be the enclosing scope.
 * Otherwise (and as the fallback) the reference is interpreted against the document as a CSS
 * selector, then an element id, then a name.
 *
 * Separate from {@link getEntity} so a caller reporting a failure can tell the causes apart
 * ({@link unresolvedCause} words them): nothing in the document matches the reference, or
 * something matches but is not backing an entity (yet, or ever).
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference, whose entity-fronting ancestors scope the
 * name lookup. Omitted, the lookup is document-wide only.
 * @returns The matched element, or `null`.
 * @internal
 */
export const findEntityElement = (ref: string, from?: Element): Element | null => {
    if (!ref) {
        return null;
    }

    // The name lands inside a quoted CSS string, so its quotes and backslashes are escaped -
    // a name like `say "hi"` must resolve, not turn the lookup into a SyntaxError.
    const escaped = ref.replace(/["\\]/g, '\\$&');
    const nameSelector = ENTITY_KINDS.map(kind => `${kind}[name="${escaped}"]`).join(', ');

    if (from) {
        let scope = from.parentElement?.closest(ENTITY_SCOPES);
        while (scope) {
            const element = queryScope(scope, nameSelector);
            if (element) {
                return element;
            }
            scope = scope.parentElement?.closest(ENTITY_SCOPES);
        }

        const app = from.parentElement?.closest('pc-app');
        if (app) {
            const element = queryScope(app, nameSelector);
            if (element) {
                return element;
            }
        }
    }

    // Try the reference as a CSS selector. An invalid selector (e.g. a bare name containing
    // spaces) falls through to the id/name lookups below.
    let element = query(ref);

    if (!element) {
        element = document.getElementById(ref) ?? query(nameSelector);
    }

    return element;
};

/**
 * Resolves a reference string to the {@link Entity} backing an entity-fronting element
 * (`<pc-entity>`, `<pc-model>` or `<pc-node>`). The reference can be a CSS selector (e.g.
 * `#my-id`, `pc-entity[name="Foo"]`), a bare element id, or a bare name — an exact name match
 * resolves lexically through the entity hierarchy first when `from` is supplied
 * ({@link findEntityElement} details the order). Returns `null` if no matching element (or
 * backing entity) is found.
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference, whose entity-fronting ancestors scope the
 * name lookup. Omitted, the lookup is document-wide only.
 * @returns The resolved entity, or `null`.
 * @internal
 */
export const getEntity = (ref: string, from?: Element): Entity | null => {
    return entityOf(findEntityElement(ref, from));
};

/**
 * Describes why a non-empty reference did not resolve, for a warning. Three causes, because they
 * have three different fixes: nothing matches (usually a typo), the matched element is not backing
 * an entity yet (usually timing - a `pc-node` whose asset has not loaded - so resolving again
 * later can work), or the matched element can never back one (the reference points at the wrong
 * element, so only correcting it can). Capability is the `entity` accessor every entity-backing
 * element inherits from EntityBaseElement.
 *
 * @param element - The element the reference matched, or `null` when nothing did.
 * @returns The cause, phrased to follow `could not resolve ... -`.
 * @internal
 */
export const unresolvedCause = (element: Element | null): string => {
    if (!element) {
        return 'nothing in the document matches it';
    }
    const tag = `<${element.tagName.toLowerCase()}>`;
    return 'entity' in element
        ? `${tag} matches it but is not backing an entity yet`
        : `${tag} matches it but cannot back an entity`;
};

/**
 * Resolves a reference string to the {@link Entity} backing an entity-fronting element, scoped to
 * the resolving element ({@link findEntityElement} details the order) and warning when a
 * non-empty reference does not resolve - otherwise the reference fails silently, invisible
 * except through the behavior it should have driven. The message names which of the three causes
 * ({@link unresolvedCause}) it hit, and advises reassigning later only when that can work.
 *
 * An empty reference stays silent: it is the unset state of an optional attribute, and on some
 * elements (`pc-joint` `entity-b`, `pc-button` `image`) a documented value of its own.
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference; scopes the lookup and names the message.
 * @param attribute - The attribute being resolved, for the message.
 * @param consequence - What the unresolved reference means for the element, for the message.
 * @returns The resolved entity, or `null`.
 * @internal
 */
export const resolveEntity = (ref: string, from: Element, attribute: string, consequence: string): Entity | null => {
    if (!ref) {
        return null;
    }

    const element = findEntityElement(ref, from);
    const entity = entityOf(element);
    if (!entity) {
        const advice =
            element && !('entity' in element)
                ? `Point ${attribute} at a pc-entity instead.`
                : `Assign ${attribute} again once the entity exists.`;
        console.warn(
            `${from.tagName.toLowerCase()} could not resolve ${attribute} '${ref}' - ${unresolvedCause(element)} - ${consequence}. ${advice}`
        );
    }
    return entity;
};
