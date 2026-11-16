/**
 * Declares an element's attributes once. An attribute that only caches a value and writes it
 * through to an engine object is otherwise written out five times - a private field, an entry in
 * the data the engine object is created with, an accessor pair, an `observedAttributes` name and
 * an `attributeChangedCallback` branch - and nothing but review keeps the five in step.
 *
 * A schema names each property and the parser for its attribute. Where the engine takes something
 * other than the parsed value, or keeps it under another name, the entry says so with `to` and
 * `as`. {@link defineAttributes} turns the schema into the accessors, and the element's base class
 * reads the rest from it: {@link attributeNames} for `observedAttributes`, {@link applyAttribute}
 * for `attributeChangedCallback` and {@link engineData} for the data the engine object is created
 * with.
 *
 * The class still declares each property, with `declare`, so that its type and its documentation
 * are where the compiler, the API reference and the custom elements manifest look for them.
 * `defineAttributes` checks each declaration against what the schema parses to.
 *
 * The attribute's default is the only default there is: a property that has never been written
 * holds what its parser returns for an absent attribute.
 */

import type { BoundingBox, Color, Plane, Vec2, Vec4 } from 'playcanvas';

import {
    parseBool,
    parseBoundingBox,
    parseColor,
    parseEnum,
    parseNumber,
    parsePlanes,
    parseVec2,
    parseVec4
} from './parse';

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
    readonly parse: (value: string | null, attribute: string) => T;

    /**
     * Converts the value to what the engine takes. Absent where the engine takes it as it is.
     */
    readonly toEngine?: (value: T) => E;

    /**
     * The engine property the value is written to. Absent where it has the element property's name.
     */
    readonly engine?: string;

    /**
     * Names the engine property, where it is not the element property's name.
     *
     * @param engine - The engine property.
     * @returns The attribute, written to that property.
     */
    as(engine: string): AttributeSpec<T, E>;

    /**
     * Converts the value to what the engine takes, where that is not the value itself.
     *
     * @param toEngine - The conversion.
     * @returns The attribute, converted on its way to the engine.
     */
    to<C>(toEngine: (value: T) => C): AttributeSpec<T, C>;
};

/**
 * The attributes of an element, keyed by property name. The attribute is the same name in
 * kebab-case.
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

const spec = <T, E = T>(
    parse: (value: string | null, attribute: string) => T,
    toEngine?: (value: T) => E,
    engine?: string
): AttributeSpec<T, E> => ({
    parse,
    toEngine,
    engine,
    as: (name) => spec(parse, toEngine, name),
    to: (convert) => spec(parse, convert, engine)
});

function oneOf<const T extends string>(valid: readonly T[], defaultValue: NoInfer<T>): AttributeSpec<T>;
function oneOf<T extends string, E>(valid: ReadonlyMap<T, E>, defaultValue: NoInfer<T>): AttributeSpec<T, E>;
function oneOf<T extends string, E>(
    valid: readonly T[] | ReadonlyMap<T, E>,
    defaultValue: T
): AttributeSpec<T, T | E | undefined> {
    const parse = (value: string | null, attribute: string) => parseEnum(value, valid, defaultValue, attribute);
    if (Array.isArray(valid)) {
        return spec(parse);
    }
    const names = valid as ReadonlyMap<T, E>;
    return spec(parse, (value) => names.get(value) ?? names.get(defaultValue));
}

/**
 * The kinds of attribute, each taking the default of an absent attribute. They mirror the parsers
 * in `parse.ts`, which the manifest plugin relies on to publish each attribute's type.
 *
 * @internal
 */
export const attr = {
    bool: (defaultValue: boolean) => spec((value) => parseBool(value, defaultValue)),

    boundingBox: <T extends BoundingBox | null>(defaultValue: T) =>
        spec((value, attribute) => parseBoundingBox(value, defaultValue, attribute)),

    color: <T extends Color | null>(defaultValue: T) =>
        spec((value, attribute) => parseColor(value, defaultValue, attribute)),

    number: (defaultValue: number) => spec((value, attribute) => parseNumber(value, defaultValue, attribute)),

    /**
     * One of a set of names: an array where the engine takes the name itself, or a map from each
     * name to what the engine takes for it.
     */
    oneOf,

    /** A list of planes, which has no default but the empty list. */
    planes: () => spec((value, attribute): Plane[] => parsePlanes(value, attribute)),

    vec2: <T extends Vec2 | null>(defaultValue: T) =>
        spec((value, attribute) => parseVec2(value, defaultValue, attribute)),

    vec4: <T extends Vec4 | null>(defaultValue: T) =>
        spec((value, attribute) => parseVec4(value, defaultValue, attribute))
};

type Entry = {
    attribute: string;
    property: string;
    engine: string;
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

const read = (element: object, { attribute, property, spec: { parse } }: Entry) => {
    const store = storeOf(element);
    if (!(property in store)) {
        store[property] = parse(null, attribute);
    }
    return store[property];
};

const convert = ({ spec: { toEngine } }: Entry, value: unknown) => (toEngine ? toEngine(value) : value);

/**
 * Gives a class the accessors for a schema of attributes. A property holds what was last written
 * to it and, once `target` returns the engine object behind the element, writes through to it.
 * Call it before the class is registered as a custom element, which is when the browser reads
 * `observedAttributes`.
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

    for (const [property, attribute] of Object.entries<AttributeSpec<unknown, unknown>>(schema)) {
        const entry: Entry = {
            attribute: camelToKebab(property),
            property,
            engine: attribute.engine ?? property,
            spec: attribute
        };
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
                    engine[entry.engine] = convert(entry, value);
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
        data[entry.engine] = convert(entry, read(element, entry));
    }
    return data;
};
