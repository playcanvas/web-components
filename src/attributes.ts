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

import type { BoundingBox, Color, Plane, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import {
    parseBool,
    parseBoundingBox,
    parseColor,
    parseEnum,
    parseFlags,
    parseNumber,
    parsePlanes,
    parseQuat,
    parseVec2,
    parseVec3,
    parseVec4
} from './parse';

// Keep `export` on these declarations, as asset-binding.ts does: with `stripInternal`, a separate
// `export { ... }` statement would outlive the declarations it names.

/**
 * How one attribute is read, and what the engine is given for it.
 *
 * @internal
 */
export type AttributeSpec<T, E = T, N extends string | undefined = undefined> = {
    /**
     * Parses the attribute's text. `null` is the absent attribute, which yields the default.
     */
    readonly parse: (value: string | null, attribute: string) => T;

    /**
     * Converts the value to what the engine takes. Absent where the engine takes it as it is.
     */
    readonly toEngine?: (value: T, element: Element) => E;

    /**
     * The engine property the value is written to, or `undefined` where it has the element
     * property's name.
     */
    readonly engine: N;

    /**
     * Names the engine property, where it is not the element property's name.
     *
     * @param engine - The engine property.
     * @returns The attribute, written to that property.
     */
    as<M extends string>(engine: M): AttributeSpec<T, E, M>;

    /**
     * Converts the value to what the engine takes, where that is not the value itself. The
     * conversion runs only when there is an engine object to write to, and is given the element,
     * which a reference to another element resolves against.
     *
     * @param toEngine - The conversion.
     * @returns The attribute, converted on its way to the engine.
     */
    to<C>(toEngine: (value: T, element: Element) => C): AttributeSpec<T, C, N>;
};

/**
 * The attributes of an element, keyed by property name. The attribute is the same name in
 * kebab-case.
 *
 * @internal
 */
export type AttributeSchema = Record<string, AttributeSpec<any, any, any>>;

// Each is read off the one member that carries it. Inferring the three from AttributeSpec as a
// whole does not survive its methods, which return it again.

type ValueOf<A> = A extends { readonly parse: (value: string | null, attribute: string) => infer T } ? T : never;

type EngineValueOf<A> = A extends { readonly toEngine?: (value: any, element: Element) => infer E } ? E : never;

type EngineNameOf<A, K> = A extends { readonly engine: infer N } ? (N extends string ? N : K) : never;

/**
 * The schema's properties that the class does not declare with the type the attribute parses to.
 */
type Undeclared<El, S extends AttributeSchema> = {
    [K in keyof S]: K extends keyof El ? ([El[K], ValueOf<S[K]>] extends [ValueOf<S[K]>, El[K]] ? never : K) : K;
}[keyof S];

/**
 * The schema's properties that the engine object cannot be given: it has no property of the name,
 * or one that does not take the value. A hand-written setter fails to compile on either, and so
 * must this - an engine release that renames a property would otherwise go unnoticed.
 */
type Unwritable<G, S extends AttributeSchema> = {
    [K in keyof S]: EngineNameOf<S[K], K> extends keyof G
        ? [EngineValueOf<S[K]>] extends [G[EngineNameOf<S[K], K>]]
            ? never
            : K
        : K;
}[keyof S];

/**
 * Resolves to nothing further when every property agrees with its declaration and with the engine
 * object, and otherwise to a type no schema satisfies, whose name is the error message.
 */
type Checked<El, G, S extends AttributeSchema> = [Undeclared<El, S>] extends [never]
    ? [Unwritable<G, S>] extends [never]
        ? unknown
        : `'${Unwritable<G, S> & string}' has no engine property of its name that takes its value`
    : `'${Undeclared<El, S> & string}' is not declared on the class with the type its attribute parses to`;

const spec = <T, E = T, N extends string | undefined = undefined>(
    parse: (value: string | null, attribute: string) => T,
    toEngine?: (value: T, element: Element) => E,
    engine?: N
): AttributeSpec<T, E, N> => ({
    parse,
    toEngine,
    engine: engine as N,
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

    /**
     * Any of a set of names, separated by spaces, as the bitmask of the flags they map to. The
     * default is written as the attribute would be.
     */
    flags: <T extends string>(flags: ReadonlyMap<T, number>, defaultValue: string) =>
        spec((value, attribute) => parseFlags(value, flags, defaultValue, attribute)),

    number: <T extends number | null>(defaultValue: T) =>
        spec((value, attribute) => parseNumber(value, defaultValue, attribute)),

    /**
     * One of a set of names: an array where the engine takes the name itself, or a map from each
     * name to what the engine takes for it.
     */
    oneOf,

    /** A list of planes, which has no default but the empty list. */
    planes: () => spec((value, attribute): Plane[] => parsePlanes(value, attribute)),

    quat: <T extends Quat | null>(defaultValue: T) =>
        spec((value, attribute) => parseQuat(value, defaultValue, attribute)),

    /** The attribute's text as it is, which every value is valid for. */
    string: (defaultValue: string) => spec((value) => value ?? defaultValue),

    vec2: <T extends Vec2 | null>(defaultValue: T) =>
        spec((value, attribute) => parseVec2(value, defaultValue, attribute)),

    vec3: <T extends Vec3 | null>(defaultValue: T) =>
        spec((value, attribute) => parseVec3(value, defaultValue, attribute)),

    vec4: <T extends Vec4 | null>(defaultValue: T) =>
        spec((value, attribute) => parseVec4(value, defaultValue, attribute))
};

type Entry = {
    attribute: string;
    property: string;
    engine: string;
    spec: AttributeSpec<unknown, unknown, string | undefined>;
};

/** Each class's attributes, its ancestors' included, keyed by attribute name. */
const schemas = new WeakMap<object, Map<string, Entry>>();

/** The values written to each element's properties, keyed by property name. */
const stores = new WeakMap<object, Record<string, unknown>>();

/**
 * Names the attribute of a property. A run of capitals is one word, so `enableGGXSpecular` is
 * `enable-ggx-specular`. The manifest plugin derives the same names, and must do it the same way.
 *
 * @param name - The property name.
 * @returns The attribute name.
 */
const camelToKebab = (name: string) =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();

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

const convert = ({ spec: { toEngine } }: Entry, value: unknown, element: Element) =>
    toEngine ? toEngine(value, element) : value;

/**
 * Gives a class the accessors for a schema of attributes. A property holds what was last written
 * to it and, once the element has its engine object, writes through to it. Call it before the
 * class is registered as a custom element, which is when the browser reads `observedAttributes`.
 * A class can be given more than one schema, where its attributes do not all write through the
 * same way.
 *
 * The engine object is named rather than returned from a callback so that its type is known
 * before the schema is checked against it.
 *
 * @param ctor - The element class.
 * @param target - The element's property holding the engine object its attributes write through
 * to, which is `null` while there is none.
 * @param schema - The attributes, keyed by property name.
 * @param written - Called after a property has been written through to the engine object, for an
 * element that has something to do then.
 * @internal
 */
export const defineAttributes = <El extends Element, P extends keyof El, S extends AttributeSchema>(
    ctor: abstract new (...args: any[]) => El,
    target: P,
    schema: S & Checked<El, NonNullable<El[P]>, S>,
    written?: (element: El) => void
) => {
    const entries = new Map(schemaOf(ctor));

    for (const [property, attribute] of Object.entries<Entry['spec']>(schema)) {
        const entry: Entry = {
            attribute: camelToKebab(property),
            property,
            engine: attribute.engine ?? property,
            spec: attribute
        };
        entries.set(entry.attribute, entry);

        Object.defineProperty(ctor.prototype, property, {
            configurable: true,
            get(this: El) {
                return read(this, entry);
            },
            set(this: El, value: unknown) {
                storeOf(this)[property] = value;
                const engine = this[target] as Record<string, unknown> | null;
                if (engine) {
                    engine[entry.engine] = convert(entry, value, this);
                    written?.(this);
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
export const applyAttribute = (element: Element, name: string, value: string | null): boolean => {
    const entry = schemaOf(element.constructor)?.get(name);
    if (!entry) {
        return false;
    }
    // Through the accessor, as a write from script goes
    (element as unknown as Record<string, unknown>)[entry.property] = entry.spec.parse(value, name);
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
export const engineData = (element: Element): Record<string, unknown> => {
    const data: Record<string, unknown> = {};
    for (const entry of schemaOf(element.constructor)?.values() ?? []) {
        data[entry.engine] = convert(entry, read(element, entry), element);
    }
    return data;
};
