/**
 * Declares an element's attributes once. An attribute that only caches a value and writes it
 * through to an engine object is otherwise written out five times - a private field, an entry in
 * the data the engine object is created with, an accessor pair, an `observedAttributes` name and
 * an `attributeChangedCallback` branch - and nothing but review keeps the five in step.
 *
 * A schema names each property, the parser for its attribute and, where the engine takes something
 * other than the parsed value, the conversion. {@link defineAttributes} turns it into the
 * accessors, and the element's base class reads the rest from it: {@link attributeNames} for
 * `observedAttributes`, {@link applyAttribute} for `attributeChangedCallback` and
 * {@link engineData} for the data the engine object is created with.
 *
 * The class still declares each property, with `declare`, so that its type and its documentation
 * are where the compiler, the API reference and the custom elements manifest look for them.
 * `defineAttributes` checks each declaration against what the schema parses to.
 *
 * The attribute's default is the only default there is: a property that has never been written
 * holds what its parser returns for an absent attribute.
 */

import type { BoundingBox, Color } from 'playcanvas';

import { parseBool, parseBoundingBox, parseColor, parseEnum, parseNumber } from './parse';

// Keep `export` on these declarations, as asset-binding.ts does: with `stripInternal`, a separate
// `export { ... }` statement would outlive the declarations it names.

/**
 * How one attribute is read, and what the engine is given for it.
 *
 * @internal
 */
export type AttributeSpec<T, E = T> = {
    /**
     * Parses the attribute's text. `null` is the absent attribute, which yields the default.
     */
    parse: (value: string | null, attribute: string) => T;

    /**
     * Converts the value to what the engine takes. Omitted where the engine takes it as it is.
     */
    toEngine?: (value: T) => E;
};

/**
 * The attributes of an element, keyed by property name. The attribute is the same name in
 * kebab-case, and the engine property is the same name unchanged.
 *
 * @internal
 */
export type AttributeSchema = Record<string, AttributeSpec<any, any>>;

type ValueOf<S> = S extends AttributeSpec<infer T, unknown> ? T : never;

/**
 * The schema's properties that the class does not declare with the type the attribute parses to.
 */
type Undeclared<E, S extends AttributeSchema> = {
    [K in keyof S]: K extends keyof E ? ([E[K], ValueOf<S[K]>] extends [ValueOf<S[K]>, E[K]] ? never : K) : K;
}[keyof S];

/**
 * Resolves to nothing further when every property agrees with its declaration, and otherwise to a
 * type no schema satisfies, whose name is the error message.
 */
type Declared<E, S extends AttributeSchema> = [Undeclared<E, S>] extends [never]
    ? unknown
    : `'${Undeclared<E, S> & string}' is not declared on the class with the type its attribute parses to`;

function oneOf<const T extends string>(valid: readonly T[], defaultValue: NoInfer<T>): AttributeSpec<T>;
function oneOf<T extends string, E>(valid: ReadonlyMap<T, E>, defaultValue: NoInfer<T>): AttributeSpec<T, E>;
function oneOf<T extends string, E>(
    valid: readonly T[] | ReadonlyMap<T, E>,
    defaultValue: T
): AttributeSpec<T, T | E | undefined> {
    const parse = (value: string | null, attribute: string) => parseEnum(value, valid, defaultValue, attribute);
    if (Array.isArray(valid)) {
        return { parse };
    }
    const names = valid as ReadonlyMap<T, E>;
    return { parse, toEngine: (value) => names.get(value) ?? names.get(defaultValue) };
}

/**
 * The kinds of attribute, each taking the default of an absent attribute. They mirror the parsers
 * in `parse.ts`, which the manifest plugin relies on to publish each attribute's type.
 *
 * @internal
 */
export const attr = {
    bool: (defaultValue: boolean): AttributeSpec<boolean> => ({
        parse: (value) => parseBool(value, defaultValue)
    }),

    boundingBox: <T extends BoundingBox | null>(defaultValue: T): AttributeSpec<BoundingBox | T> => ({
        parse: (value, attribute) => parseBoundingBox(value, defaultValue, attribute)
    }),

    color: <T extends Color | null>(defaultValue: T): AttributeSpec<Color | T> => ({
        parse: (value, attribute) => parseColor(value, defaultValue, attribute)
    }),

    number: (defaultValue: number): AttributeSpec<number> => ({
        parse: (value, attribute) => parseNumber(value, defaultValue, attribute)
    }),

    /**
     * One of a set of names: an array where the engine takes the name itself, or a map from each
     * name to what the engine takes for it.
     */
    oneOf
};

type Entry = {
    attribute: string;
    property: string;
    spec: AttributeSpec<unknown, unknown>;
};

/** Each class's attributes, its ancestors' included, keyed by attribute name. */
const schemas = new WeakMap<object, Map<string, Entry>>();

/** The values written to each element's properties, keyed by property name. */
const stores = new WeakMap<object, Record<string, unknown>>();

const camelToKebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const schemaOf = (ctor: object | null): Map<string, Entry> | undefined => {
    for (let current = ctor; current; current = Object.getPrototypeOf(current)) {
        const schema = schemas.get(current);
        if (schema) {
            return schema;
        }
    }
    return undefined;
};

const storeOf = (element: object) => {
    let store = stores.get(element);
    if (!store) {
        store = {};
        stores.set(element, store);
    }
    return store;
};

const read = (element: object, { attribute, property, spec }: Entry) => {
    const store = storeOf(element);
    if (!(property in store)) {
        store[property] = spec.parse(null, attribute);
    }
    return store[property];
};

const convert = ({ spec }: Entry, value: unknown) => (spec.toEngine ? spec.toEngine(value) : value);

/**
 * Gives a class the accessors for a schema of attributes. A property holds what was last written
 * to it and, once `target` returns the engine object behind the element, writes through to the
 * property of the same name there. Call it before the class is registered as a custom element,
 * which is when the browser reads `observedAttributes`.
 *
 * @param ctor - The element class.
 * @param schema - The attributes, keyed by property name.
 * @param target - Returns the engine object the element's properties write through to, or `null`
 * while there is none.
 * @internal
 */
export const defineAttributes = <E extends object, S extends AttributeSchema>(
    ctor: abstract new (...args: any[]) => E,
    schema: S & Declared<E, S>,
    target: (element: E) => object | null
) => {
    const entries = new Map(schemaOf(ctor));

    for (const [property, spec] of Object.entries<AttributeSpec<unknown, unknown>>(schema)) {
        const entry: Entry = { attribute: camelToKebab(property), property, spec };
        entries.set(entry.attribute, entry);

        Object.defineProperty(ctor.prototype, property, {
            configurable: true,
            get(this: E) {
                return read(this, entry);
            },
            set(this: E, value: unknown) {
                storeOf(this)[property] = value;
                const engine = target(this) as Record<string, unknown> | null;
                if (engine) {
                    engine[property] = convert(entry, value);
                }
            }
        });
    }

    schemas.set(ctor, entries);
};

/**
 * Returns the attribute names of a class's schema, for its `observedAttributes`.
 *
 * @param ctor - The element class.
 * @returns The attribute names, in the order the schema declares them.
 * @internal
 */
export const attributeNames = (ctor: object): string[] => [...(schemaOf(ctor)?.keys() ?? [])];

/**
 * Parses a changed attribute and assigns it to its property, for `attributeChangedCallback`.
 *
 * @param element - The element.
 * @param name - The attribute name.
 * @param value - The attribute's new text, or `null` when it was removed.
 * @returns Whether the attribute is one of the schema's.
 * @internal
 */
export const applyAttribute = (element: object, name: string, value: string | null): boolean => {
    const entry = schemaOf(element.constructor)?.get(name);
    if (!entry) {
        return false;
    }
    // Through the accessor, as a write from script goes
    (element as Record<string, unknown>)[entry.property] = entry.spec.parse(value, name);
    return true;
};

/**
 * Returns the current value of every attribute as the engine takes it, keyed by engine property:
 * the data an engine object is created with.
 *
 * @param element - The element.
 * @returns The engine data.
 * @internal
 */
export const engineData = (element: object): Record<string, unknown> => {
    const data: Record<string, unknown> = {};
    for (const entry of schemaOf(element.constructor)?.values() ?? []) {
        data[entry.property] = convert(entry, read(element, entry));
    }
    return data;
};
