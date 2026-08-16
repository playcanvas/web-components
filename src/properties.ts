/**
 * The property-table machinery behind `attributeChangedCallback`. An element class declares a
 * static `properties` table mapping each property to how its attribute parses; the base classes
 * derive `observedAttributes` from the table and route every attribute change through
 * {@link applyAttribute}. One table entry replaces what used to be restated per attribute: the
 * entry in `observedAttributes` and the `case` in the dispatch switch.
 *
 * Defaults are deliberately absent from the table. Custom element reactions never run
 * mid-constructor, so by the first `attributeChangedCallback` every field initializer has run;
 * snapshotting the element's properties then captures exactly the initializer values, and an
 * absent, removed or invalid attribute falls back to that snapshot. A default therefore lives in
 * one place only — the backing field's initializer — and the manifest tooling reads it from
 * there rather than from a restated literal.
 */

import { Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import { parseEnum } from './parse';

/**
 * Converts an attribute value into the value assigned to the element property. The parse helpers
 * in `parse.ts` all have this shape; `defaultValue` is `any` so their narrower per-type
 * signatures remain assignable.
 *
 * @param value - The attribute value (`null` when the attribute is absent or removed).
 * @param defaultValue - The value to fall back to, from the element's defaults snapshot.
 * @param attribute - The attribute name, used in warning messages.
 * @returns The value to assign to the property.
 * @internal
 */
export type AttributeParser = (value: string | null, defaultValue: any, attribute: string) => unknown;

/**
 * One property's entry in a {@link PropertyTable}.
 * @internal
 */
export type PropertyDefinition = {
    /**
     * The attribute name, when it is not simply the kebab-cased property name (an alias, or an
     * initialism the mechanical conversion would mangle).
     */
    attribute?: string;

    /** The parse helper converting the attribute value for this property. */
    parse: AttributeParser;
};

/**
 * An element class's attribute schema, keyed by property name. A subclass extends its base
 * class's schema by spreading it (`{ ...ComponentElement.properties, intensity: ... }`), so the
 * table on any class always describes that element's full attribute surface.
 * @internal
 */
export type PropertyTable = Record<string, PropertyDefinition>;

/**
 * The attribute name observed for a property: an explicit `attribute` override, or the
 * kebab-cased property name.
 *
 * @param property - The property name.
 * @param definition - The property's table entry.
 * @returns The attribute name.
 */
const attributeOf = (property: string, definition: PropertyDefinition): string => {
    return definition.attribute ?? property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
};

/**
 * Reverse indexes (attribute name → property and definition), built once per table. Tables are
 * class statics, so this caches per class, not per element.
 */
const indexes = new WeakMap<PropertyTable, Map<string, { property: string; definition: PropertyDefinition }>>();

const indexOf = (table: PropertyTable) => {
    let index = indexes.get(table);
    if (!index) {
        index = new Map();
        for (const [property, definition] of Object.entries(table)) {
            index.set(attributeOf(property, definition), { property, definition });
        }
        indexes.set(table, index);
    }
    return index;
};

/**
 * The attribute names a table observes, for `static get observedAttributes()`.
 *
 * @param table - The property table.
 * @returns The attribute names.
 * @internal
 */
export const attributeNames = (table: PropertyTable): string[] => {
    return [...indexOf(table).keys()];
};

/**
 * Clones a snapshot value, so the recorded default can never alias a live property value that a
 * later parse result (or an in-place mutation) would write through. Math types are the mutable
 * ones the parse helpers produce; arrays cover `parseTags`.
 *
 * @param value - The property value to record.
 * @returns The value to store in the snapshot.
 */
const cloneValue = (value: unknown): unknown => {
    if (
        value instanceof Color ||
        value instanceof Quat ||
        value instanceof Vec2 ||
        value instanceof Vec3 ||
        value instanceof Vec4
    ) {
        return value.clone();
    }
    return Array.isArray(value) ? [...value] : value;
};

/** Per-element snapshots of every table property's pre-attribute value. */
const defaults = new WeakMap<HTMLElement, Record<string, unknown>>();

const snapshotDefaults = (element: HTMLElement, table: PropertyTable): Record<string, unknown> => {
    const snapshot: Record<string, unknown> = {};
    for (const property of Object.keys(table)) {
        snapshot[property] = cloneValue((element as unknown as Record<string, unknown>)[property]);
    }
    return snapshot;
};

/**
 * Generic `attributeChangedCallback` dispatch: resolves the changed attribute against the
 * element class's property table and assigns the parsed value through the property's accessor.
 * An attribute the table does not know is ignored, so an element handling extra, non-property
 * attributes overrides `attributeChangedCallback` and chains `super` exactly as before.
 *
 * @param element - The element whose attribute changed.
 * @param name - The attribute name.
 * @param value - The new attribute value (`null` when the attribute was removed).
 * @internal
 */
export const applyAttribute = (element: HTMLElement, name: string, value: string | null): void => {
    const table = (element.constructor as unknown as { properties: PropertyTable }).properties;
    const match = indexOf(table).get(name);
    if (!match) {
        return;
    }

    let snapshot = defaults.get(element);
    if (!snapshot) {
        snapshot = snapshotDefaults(element, table);
        defaults.set(element, snapshot);
    }

    (element as unknown as Record<string, unknown>)[match.property] = match.definition.parse(
        value,
        snapshot[match.property],
        name
    );
};

/**
 * Binds `parseEnum` to its set of valid names. The set is carried once, here: dispatch resolves
 * values against it, and the manifest tooling reads the published enum values from this call's
 * argument.
 *
 * @param valid - The valid names: an array, or a map whose keys are the valid names.
 * @returns The bound parser.
 * @internal
 */
export const enumOf = <T extends string>(valid: readonly T[] | ReadonlyMap<T, unknown>): AttributeParser => {
    return (value, defaultValue, attribute) => parseEnum(value, valid, defaultValue, attribute);
};
