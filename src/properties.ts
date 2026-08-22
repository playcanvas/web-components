/**
 * The property-descriptor machinery behind `attributeChangedCallback`. An element class declares
 * a static `properties` table of descriptors built by {@link defineProperties}; the base classes
 * derive `observedAttributes` from the merged tables of the constructor chain and route every
 * attribute change through {@link applyAttribute}. One descriptor is the single, authoritative
 * declaration of everything that used to be restated per attribute — the observed name, the
 * value type, and the defaults — and both runtime dispatch and the manifest tooling read it.
 *
 * The semantics every descriptor shares:
 *
 * - An absent or removed attribute assigns `initial()` — a fresh value each time, so a mutable
 *   default can never be aliased and mutated through.
 * - A malformed value warns (via the `parse` helpers) and assigns the `invalid` fallback, which
 *   is the initial value unless declared otherwise. `pc-asset`'s texture options are the split
 *   case: unset means "leave the engine's per-format default in force" (`initial: null`) while a
 *   malformed value falls back to the engine constant the warning names.
 * - The parse helpers therefore never see `null` here; removal is resolved before parsing.
 *
 * Escape hatches, for the attributes that are genuinely not plain mappings: `attribute` names an
 * attribute the kebab-cased property name cannot express, `property` retargets the assignment
 * (and the manifest's `fieldName`) for aliases, and `apply` replaces the assignment entirely for
 * attributes with presence-dependent side effects. Elements with non-property attributes keep an
 * `attributeChangedCallback` override chaining `super`, exactly as before.
 */

import type { Color } from 'playcanvas';

import { parseBool, parseColor, parseEnum, parseNumber } from './parse';

/**
 * Replaces the plain property assignment of a parsed attribute value, for attributes whose
 * effects go beyond one property — writing several, or reacting to the attribute's presence.
 *
 * @param element - The element whose attribute changed. Typed loosely so a hook can be declared
 * against its concrete element class.
 * @param value - The parsed value: `initial()` for a removed attribute, the parse result
 * otherwise.
 * @param raw - The raw attribute value (`null` when the attribute was removed), for
 * presence-dependent behavior.
 * @internal
 */
export type PropertyApply<T> = (element: any, value: T, raw: string | null) => void;

/**
 * The options every descriptor factory accepts.
 * @internal
 */
export type PropertyOptions<T> = {
    /**
     * The attribute name, when it is not simply the kebab-cased property name (an alias, or an
     * initialism the mechanical conversion would mangle).
     */
    attribute?: string;

    /**
     * The property the parsed value is assigned to (and the manifest's `fieldName`), when it is
     * not the table key — i.e. the attribute is an alias for another property.
     */
    property?: string;

    /**
     * The fallback for a malformed attribute value, when it differs from the initial value. A
     * factory, for a mutable value.
     */
    invalid?: T | (() => T);

    /** The assignment replacement — see {@link PropertyApply}. */
    apply?: PropertyApply<T>;
};

/**
 * One property's descriptor: how its attribute parses, and the defaults. Built by the factory
 * functions below, never by hand — the manifest tooling derives each attribute's type from the
 * factory's identity and its published default from the factory's arguments.
 * @internal
 */
export type PropertyDeclaration<T = unknown> = {
    attribute?: string;
    property?: string;
    apply?: PropertyApply<T>;

    /** Parses a present attribute value; `fallback` is only consulted for a malformed one. */
    parse: (value: string, fallback: T, attribute: string) => T;

    /** Creates the initial value — referenced by the backing field's initializer. */
    initial: () => T;

    /** Creates the malformed-value fallback. Defaults to {@link initial}. */
    invalid: () => T;
};

/**
 * An element class's own attribute schema, keyed by property name. Declared per class and merged
 * across the constructor chain at lookup time — a subclass never restates (or spreads) its base
 * class's table.
 * @internal
 */
export type PropertyTable = Record<string, PropertyDeclaration<any>>;

/** Normalizes an optional value-or-factory to a factory. */
const toFactory = <T>(value: T | (() => T)): (() => T) => {
    return typeof value === 'function' ? (value as () => T) : () => value;
};

const definition = <T>(
    parse: PropertyDeclaration<T>['parse'],
    initial: () => T,
    options?: PropertyOptions<T>
): PropertyDeclaration<T> => {
    return {
        parse,
        initial,
        invalid: options?.invalid === undefined ? initial : toFactory(options.invalid),
        attribute: options?.attribute,
        property: options?.property,
        apply: options?.apply
    };
};

/**
 * Declares a boolean property, with the standard boolean attribute rules (`'false'` is false;
 * any other present value, including a bare attribute's empty string, is true).
 *
 * @param initial - The initial value, or `null` for a property that starts unset.
 * @param options - The descriptor options.
 * @returns The descriptor.
 * @internal
 */
export function booleanProperty(initial: boolean, options?: PropertyOptions<boolean>): PropertyDeclaration<boolean>;
/** @internal */
export function booleanProperty(
    initial: null,
    options?: PropertyOptions<boolean | null>
): PropertyDeclaration<boolean | null>;
/** @internal */
export function booleanProperty(initial: boolean | null, options?: PropertyOptions<any>): PropertyDeclaration<any> {
    return definition(
        (value, fallback) => parseBool(value, fallback as boolean),
        () => initial,
        options
    );
}

/**
 * Declares a number property.
 *
 * @param initial - The initial value, or `null` for a property that starts unset.
 * @param options - The descriptor options.
 * @returns The descriptor.
 * @internal
 */
export function numberProperty(initial: number, options?: PropertyOptions<number>): PropertyDeclaration<number>;
/** @internal */
export function numberProperty(
    initial: null,
    options?: PropertyOptions<number | null>
): PropertyDeclaration<number | null>;
/** @internal */
export function numberProperty(initial: number | null, options?: PropertyOptions<any>): PropertyDeclaration<any> {
    return definition(parseNumber, () => initial, options);
}

/**
 * Declares a string property. Every string is a valid value, so this never warns and `invalid`
 * is meaningless.
 *
 * @param initial - The initial value.
 * @param options - The descriptor options.
 * @returns The descriptor.
 * @internal
 */
export const stringProperty = (initial: string, options?: PropertyOptions<string>): PropertyDeclaration<string> => {
    return definition(
        (value) => value,
        () => initial,
        options
    );
};

/**
 * Declares a {@link Color} property. The initial value is a factory, so each element (and each
 * removal) gets a fresh instance.
 *
 * @param initial - Creates the initial value.
 * @param options - The descriptor options.
 * @returns The descriptor.
 * @internal
 */
export const colorProperty = (initial: () => Color, options?: PropertyOptions<Color>): PropertyDeclaration<Color> => {
    return definition(parseColor, initial, options);
};

/**
 * Declares an enum property. The valid-name set is carried once, here: dispatch resolves values
 * against it, and the manifest tooling reads the published enum values from this call's argument.
 *
 * @param valid - The valid names: an array, or a map whose keys are the valid names.
 * @param initial - The initial value, or `null` for a property that starts unset.
 * @param options - The descriptor options.
 * @returns The descriptor.
 * @internal
 */
export function enumProperty<T extends string>(
    valid: readonly T[] | ReadonlyMap<T, unknown>,
    initial: T,
    options?: PropertyOptions<T>
): PropertyDeclaration<T>;
/** @internal */
export function enumProperty<T extends string>(
    valid: readonly T[] | ReadonlyMap<T, unknown>,
    initial: null,
    options?: PropertyOptions<T | null>
): PropertyDeclaration<T | null>;
/** @internal */
export function enumProperty<T extends string>(
    valid: readonly T[] | ReadonlyMap<T, unknown>,
    initial: T | null,
    options?: PropertyOptions<any>
): PropertyDeclaration<any> {
    return definition(
        (value, fallback, attribute) => parseEnum(value, valid, fallback as T, attribute),
        () => initial,
        options
    );
}

/**
 * Declares a class's own property table. An identity function: it gives the manifest tooling a
 * recognizable marker to read the table from. Deliberately unconstrained — a `PropertyTable`
 * bound would contextually type every entry as `PropertyDeclaration<any>`, collapsing the
 * literal-union inference of `enumProperty` to `string`. The table's shape is checked where the
 * class declares it instead: `static properties` is typed `PropertyTable` on each root class,
 * and a subclass's static must be assignable to its base's.
 *
 * @param properties - The descriptors, keyed by property name.
 * @returns The table, unchanged.
 * @internal
 */
export const defineProperties = <Table>(properties: Table): Table => {
    return properties;
};

const camelToKebab = (name: string): string => {
    return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
};

/**
 * Merged lookup tables (attribute name → target property and descriptor), built once per class
 * by walking the constructor chain base-first, so a derived class's entry shadows its base's.
 */
const tables = new WeakMap<object, Map<string, { property: string; entry: PropertyDeclaration<any> }>>();

const tableFor = (constructor: object) => {
    let table = tables.get(constructor);
    if (table) {
        return table;
    }

    const chain: PropertyTable[] = [];
    for (let current: object | null = constructor; current; current = Object.getPrototypeOf(current)) {
        if (Object.hasOwn(current, 'properties')) {
            chain.push((current as { properties: PropertyTable }).properties);
        }
    }

    table = new Map();
    for (const properties of chain.reverse()) {
        for (const [key, entry] of Object.entries(properties)) {
            table.set(entry.attribute ?? camelToKebab(key), { property: entry.property ?? key, entry });
        }
    }
    tables.set(constructor, table);
    return table;
};

/**
 * The attribute names observed by a class, merged across its constructor chain, for
 * `static get observedAttributes()`.
 *
 * @param constructor - The element class (`this`, in the static getter).
 * @returns The attribute names, base class's first.
 * @internal
 */
export const attributeNames = (constructor: object): string[] => {
    return [...tableFor(constructor).keys()];
};

/**
 * Generic `attributeChangedCallback` dispatch: resolves the changed attribute against the
 * element class's merged property table and assigns the parsed value through the target
 * property's accessor (or hands it to the descriptor's `apply` hook). An attribute the tables
 * do not know is ignored, so an element handling extra, non-property attributes overrides
 * `attributeChangedCallback` and chains `super` exactly as before.
 *
 * @param element - The element whose attribute changed.
 * @param name - The attribute name.
 * @param value - The new attribute value (`null` when the attribute was removed).
 * @internal
 */
export const applyAttribute = (element: HTMLElement, name: string, value: string | null): void => {
    const match = tableFor(element.constructor).get(name);
    if (!match) {
        return;
    }

    const { property, entry } = match;
    const parsed = value === null ? entry.initial() : entry.parse(value, entry.invalid(), name);

    if (entry.apply) {
        entry.apply(element, parsed, value);
        return;
    }

    (element as unknown as Record<string, unknown>)[property] = parsed;
};
