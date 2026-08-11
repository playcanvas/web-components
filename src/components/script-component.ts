import type { ScriptComponent, Script } from 'playcanvas';
import { Color, Quat, Vec2, Vec3, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import {
    getEntity,
    parseBool,
    parseColor,
    parseComponents,
    parseNumber,
    parseQuat,
    parseVec2,
    parseVec3,
    parseVec4
} from '../parse';

import { ComponentElement } from './component';
import { ScriptElement } from './script';

/**
 * Attributes on `pc-script` that never map to script attributes: the element's own API (derived
 * from its observed attributes) plus reserved and global HTML attribute names.
 */
const RESERVED_ATTRIBUTES = new Set([
    ...ScriptElement.observedAttributes,
    'accesskey',
    'autocapitalize',
    'autofocus',
    'class',
    'contenteditable',
    'dir',
    'draggable',
    'exportparts',
    'hidden',
    'id',
    'inert',
    'is',
    'itemid',
    'itemprop',
    'itemref',
    'itemscope',
    'itemtype',
    'lang',
    'nonce',
    'part',
    'popover',
    'role',
    'slot',
    'spellcheck',
    'style',
    'tabindex',
    'title',
    'translate'
]);

/**
 * Checks whether a `pc-script` attribute name is reserved (and so never maps to a script
 * attribute). Reserved names are the element's own API, global HTML attribute names, `data-*`
 * and `aria-*` attributes, names starting with `_` (framework-stamped attributes), and real
 * inline event handler names (`onclick` etc. — detected via the platform, so script attributes
 * that merely start with 'on', like `once`, still map).
 * @param name - The attribute name.
 * @returns Whether the attribute name is reserved.
 */
const isReservedAttribute = (name: string): boolean => {
    return (
        RESERVED_ATTRIBUTES.has(name) ||
        name.startsWith('data-') ||
        name.startsWith('aria-') ||
        name.startsWith('_') ||
        (name.startsWith('on') && name in HTMLElement.prototype)
    );
};

/**
 * Script API members that per-property attributes must never overwrite: the engine bindings and
 * the (optional, so possibly undefined) lifecycle methods.
 */
const SCRIPT_API_MEMBERS = new Set([
    'app',
    'entity',
    'destroy',
    'initialize',
    'postInitialize',
    'postUpdate',
    'swap',
    'update'
]);

/**
 * Converts a kebab-case attribute name to the camelCase script attribute name.
 * @param name - The attribute name.
 * @returns The camelCase name.
 */
const kebabToCamel = (name: string): string => {
    return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
};

/**
 * Converts a camelCase script attribute name to its kebab-case attribute spelling.
 * @param name - The camelCase name.
 * @returns The kebab-case name.
 */
const camelToKebab = (name: string): string => {
    return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
};

/**
 * A conversion applied to a script attribute value carrying an explicit type prefix. Receives the
 * text after the prefix plus the raw value, and returns the raw value (having warned) when it
 * cannot resolve or parse it — callers rely on that identity to tell failure from success.
 */
type Conversion = (rest: string, raw: string) => any;

/**
 * Resolves an `asset:` prefix to the Asset created by the `pc-asset` element with that id.
 * @param rest - The asset id.
 * @param raw - The raw value, returned unchanged when the id does not resolve.
 * @returns The asset, or `raw`.
 */
const assetConversion: Conversion = (rest, raw) => {
    const asset = AssetElement._use(rest);
    if (asset) {
        return asset;
    }
    console.warn(`Unable to resolve '${raw}' in script attributes - no pc-asset found with id '${rest}'.`);
    return raw;
};

/**
 * Resolves an `entity:` prefix to the Entity backing a `pc-entity` element. The reference can be a
 * CSS selector, an element id or an entity name.
 * @param rest - The entity reference.
 * @param raw - The raw value, returned unchanged when the reference does not resolve.
 * @returns The entity, or `raw`.
 */
const entityConversion: Conversion = (rest, raw) => {
    const entity = getEntity(rest);
    if (entity) {
        return entity;
    }
    console.warn(`Unable to resolve '${raw}' in script attributes - no pc-entity found matching '${rest}'.`);
    return raw;
};

/**
 * Builds the conversion for a `vec2:`/`vec3:`/`vec4:` prefix.
 * @param length - The number of components the prefix carries.
 * @param Ctor - The vector type to construct.
 * @returns The conversion.
 */
const vectorConversion = (length: 2 | 3 | 4, Ctor: new (components: number[]) => Vec2 | Vec3 | Vec4): Conversion => {
    return (rest, raw) => {
        const components = parseComponents(rest, length);
        if (components) {
            return new Ctor(components);
        }
        console.warn(
            `Invalid script attribute value '${raw}'. Expected ${length} space-separated numbers after 'vec${length}:'.`
        );
        return raw;
    };
};

/**
 * Converts a `color:` prefix to a Color, accepting 3 or 4 components.
 * @param rest - The space-separated components.
 * @param raw - The raw value, returned unchanged when the components do not parse.
 * @returns The color, or `raw`.
 */
const colorConversion: Conversion = (rest, raw) => {
    const components = parseComponents(rest, 4) ?? parseComponents(rest, 3);
    if (components) {
        return new Color(components);
    }
    console.warn(`Invalid script attribute value '${raw}'. Expected 3 or 4 space-separated numbers after 'color:'.`);
    return raw;
};

/**
 * The conversion prefixes recognized in script attribute values, mapped to the conversion each
 * performs. These keys are the single source of truth for the prefix vocabulary: they drive both
 * the conversion in `convertAttributes` and the has-a-prefix test in `setScriptProperty`, so a
 * prefix added here is automatically known to both.
 */
const CONVERSIONS = new Map<string, Conversion>([
    ['asset', assetConversion],
    ['entity', entityConversion],
    ['vec2', vectorConversion(2, Vec2)],
    ['vec3', vectorConversion(3, Vec3)],
    ['vec4', vectorConversion(4, Vec4)],
    ['color', colorConversion]
]);

/**
 * Matches a value against the conversion prefixes. A prefix is the text before the first colon,
 * so a value whose remainder itself contains colons (`asset:a:b`) still resolves, and a value
 * with an unrecognized prefix (`https://...`) or no colon does not match.
 * @param value - The value to inspect.
 * @returns The matching converter and the text after the prefix, or `null` if the value carries
 * no recognized prefix.
 */
const matchConversion = (value: string) => {
    const index = value.indexOf(':');
    if (index <= 0) {
        return null;
    }
    const convert = CONVERSIONS.get(value.slice(0, index));
    return convert ? { convert, rest: value.slice(index + 1) } : null;
};

/**
 * Finds a script property whose name matches `key` case-insensitively (but not exactly). Used
 * to suggest the kebab-case spelling when a camelCase attribute has been lowercased by the HTML
 * parser (e.g. `focusPoint` arriving as 'focuspoint').
 * @param script - The script instance to search.
 * @param key - The lowercased key that failed to match.
 * @returns The matching property name, or `null`.
 */
const findCaseMatch = (script: any, key: string): string | null => {
    const names = new Set(Object.keys(script));
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(script))) {
        names.add(name);
    }
    for (const name of names) {
        if (name !== key && name.toLowerCase() === key.toLowerCase()) {
            return name;
        }
    }
    return null;
};

export type ScriptAttributesChangeEvent = {
    detail: { attributes: Record<string, any> };
} & CustomEvent;

export type ScriptEnableChangeEvent = {
    detail: { enabled: boolean };
} & CustomEvent;

export type ScriptNameChangeEvent = {
    detail: { oldName: string; newName: string };
} & CustomEvent;

/**
 * The ScriptComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scripts/ | `<pc-scripts>`} elements.
 * The ScriptComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScriptComponentElement extends ComponentElement {
    private observer: MutationObserver;

    /** @ignore */
    constructor() {
        super('script');

        // Create mutation observer to watch for child script elements
        this.observer = new MutationObserver(this.handleMutations.bind(this));

        // Listen for script attribute, enable and name changes
        this.addEventListener('scriptattributeschange', this.handleScriptAttributesChange.bind(this));
        this.addEventListener('scriptenablechange', this.handleScriptEnableChange.bind(this));
        this.addEventListener('scriptnamechange', this.handleScriptNameChange.bind(this));
    }

    connectedCallback() {
        // (Re-)observe on every connection - disconnectedCallback disconnects the observer.
        // Attribute changes on child pc-script elements are watched here too: per-property
        // script attributes are not statically known, so they cannot use observedAttributes.
        this.observer.observe(this, { childList: true, subtree: true, attributes: true });
        return super.connectedCallback();
    }

    protected initComponent() {
        // Handle initial script elements
        this.querySelectorAll<ScriptElement>(':scope > pc-script').forEach((scriptElement) => {
            this.createScript(scriptElement);
        });
    }

    /**
     * Recursively converts raw attribute data into proper PlayCanvas types. Supported conversions:
     * - "asset:id" → the Asset created by the `pc-asset` element with that id
     * - "entity:ref" → the Entity backing a `pc-entity` element. The reference can be a CSS
     *   selector, an element id or an entity name.
     * - "vec2:1 2" → new Vec2(1, 2)
     * - "vec3:1 2 3" → new Vec3(1, 2, 3)
     * - "vec4:1 2 3 4" → new Vec4(1, 2, 3, 4)
     * - "color:1 0.5 0.5 1" → new Color(1, 0.5, 0.5, 1)
     *
     * A prefixed string that fails to resolve or parse logs a warning and is left as the raw
     * string.
     * @param item - The item to convert.
     * @returns The converted item.
     */
    private convertAttributes(item: any): any {
        if (typeof item === 'string') {
            const match = matchConversion(item);
            return match ? match.convert(match.rest, item) : item;
        }

        if (Array.isArray(item)) {
            return item.map((element: any) => this.convertAttributes(element));
        }

        if (item && typeof item === 'object') {
            const result: any = {};
            for (const key in item) {
                result[key] = this.convertAttributes(item[key]);
            }
            return result;
        }

        return item;
    }

    /**
     * Recursively merge properties from source into target. When the target value is a Vec2,
     * Vec3, Vec4 or Color and the source value is a plain numeric array, the array is converted
     * to the target's type — so script attributes with math-typed defaults can be written as
     * plain JSON arrays (e.g. `"focusPoint": [0, 1.75, 0]`).
     * @param target - The target object to merge into.
     * @param source - The source object to merge from.
     * @returns The merged object.
     */
    private mergeDeep(target: any, source: any): any {
        for (const key in source) {
            const value = source[key];
            const current = target[key];
            if (this.isMathType(current) && Array.isArray(value)) {
                const converted = this.arrayToMathType(current, value, key);
                if (converted) {
                    target[key] = converted;
                }
                continue;
            }
            // Only recurse into plain objects. Class instances (Vec3, Color, Asset, Entity...)
            // are leaf values assigned whole, so accessor-typed script attributes receive them
            // through their setters instead of having a getter's returned copy mutated.
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                Object.getPrototypeOf(value) === Object.prototype
            ) {
                if (!current || typeof current !== 'object') {
                    target[key] = {};
                }
                this.mergeDeep(target[key], value);
            } else {
                target[key] = value;
            }
        }
        return target;
    }

    /**
     * Checks whether a value is one of the math types that plain numeric arrays convert to.
     * @param value - The value to check.
     * @returns Whether the value is a math type.
     */
    private isMathType(value: any): value is Vec2 | Vec3 | Vec4 | Color | Quat {
        return (
            value instanceof Vec2 ||
            value instanceof Vec3 ||
            value instanceof Vec4 ||
            value instanceof Color ||
            value instanceof Quat
        );
    }

    /**
     * Converts a plain numeric array to the math type of `current`. A 3-element array targeting
     * a Quat is interpreted as Euler angles in degrees, mirroring the `parseQuat` attribute
     * grammar. Returns `null` (and logs a warning) when the array's length or contents don't
     * match the type.
     * @param current - The current (typed) value of the property.
     * @param value - The incoming array.
     * @param key - The property name, used in the warning message.
     * @returns The converted value, or `null`.
     */
    private arrayToMathType(
        current: Vec2 | Vec3 | Vec4 | Color | Quat,
        value: any[],
        key: string
    ): Vec2 | Vec3 | Vec4 | Color | Quat | null {
        if (value.every((component) => typeof component === 'number' && Number.isFinite(component))) {
            if (current instanceof Vec2 && value.length === 2) return new Vec2(value);
            if (current instanceof Vec3 && value.length === 3) return new Vec3(value);
            if (current instanceof Vec4 && value.length === 4) return new Vec4(value);
            if (current instanceof Color && (value.length === 3 || value.length === 4)) return new Color(value);
            if (current instanceof Quat && value.length === 3)
                return new Quat().setFromEulerAngles(value[0], value[1], value[2]);
        }
        console.warn(
            `Cannot convert script attribute '${key}' array [${value}] to ${current.constructor.name}. Keeping the current value.`
        );
        return null;
    }

    /**
     * Update script attributes by merging converted values into the script. `enabled` is always
     * excluded (it is configured through the element's `enabled` attribute, not the JSON blob),
     * as are any keys in `exclude` — used to keep per-property attributes authoritative over
     * the blob without writing a property twice.
     * @param script - The script to update.
     * @param attributes - The attributes to merge into the script.
     * @param exclude - Keys to strip from the merge.
     */
    private applyAttributes(script: any, attributes: Record<string, any>, exclude?: Set<string>) {
        const converted = this.convertAttributes(attributes);
        if (converted && typeof converted === 'object') {
            delete converted.enabled;
            if (exclude) {
                for (const key of exclude) {
                    delete converted[key];
                }
            }
        }
        this.mergeDeep(script, converted);
    }

    /**
     * Returns the camelCase keys of the per-property attributes present on a `pc-script`
     * element.
     * @param scriptElement - The `pc-script` element.
     * @returns The camelCase keys.
     */
    private inlineKeys(scriptElement: ScriptElement): Set<string> {
        const keys = new Set<string>();
        for (const attr of Array.from(scriptElement.attributes)) {
            if (!isReservedAttribute(attr.name)) {
                keys.add(kebabToCamel(attr.name));
            }
        }
        return keys;
    }

    /**
     * Resolves the script instance owned by a `pc-script` element. Returns `null` when the
     * element has no created script, or when its name resolves to a script created by a
     * different element (e.g. a duplicate-named sibling).
     * @param scriptElement - The `pc-script` element.
     * @returns The owned script, or `null`.
     */
    private scriptFor(scriptElement: ScriptElement): Script | null {
        const name = scriptElement.getAttribute('name');
        if (!name || !this.component) return null;

        const script = this.component.get(name);
        return script && script === scriptElement._script ? script : null;
    }

    private handleScriptAttributesChange(event: ScriptAttributesChangeEvent) {
        const scriptElement = event.target as ScriptElement;
        const script = this.scriptFor(scriptElement);
        if (script) {
            // Per-property attributes stay authoritative: keys they pin are excluded here
            this.applyAttributes(script, event.detail.attributes, this.inlineKeys(scriptElement));
        }
    }

    private handleScriptEnableChange(event: ScriptEnableChangeEvent) {
        const scriptElement = event.target as ScriptElement;

        // Apply any queued per-property changes first, so that initialize() (fired by the
        // engine on first effective enable) sees every attribute value set this tick
        this.handleMutations(this.observer.takeRecords());

        const script = this.scriptFor(scriptElement);
        if (script) {
            script.enabled = event.detail.enabled;
        }
    }

    /**
     * Handles a runtime `name` change on a child `pc-script`, swapping the engine script instance
     * to match. Without this the element would keep pointing at the old-name instance: the old
     * script would go on running while every subsequent update (attribute changes, enable
     * changes, destruction on removal) resolved the new name and silently no-opped.
     *
     * The new instance is built by the normal creation path, so both attribute channels are
     * re-applied to it and the declared enabled state is restored.
     * @param event - The name change event.
     */
    private handleScriptNameChange(event: ScriptNameChangeEvent) {
        const scriptElement = event.target as ScriptElement;

        // Only direct children are managed, matching initComponent's ':scope > pc-script'
        // contract - the event bubbles, so a deeper pc-script must not be created here
        if (scriptElement.parentElement !== this) return;

        // Before the component exists there is nothing to swap: initComponent creates from
        // whatever the name is by then
        if (!this.component) return;

        // Only tear down the old-name script if this element actually owns it - a duplicate-named
        // element whose own create() failed must not take down the live script on rename
        const { oldName } = event.detail;
        if (oldName && scriptElement._script && this.component.get(oldName) === scriptElement._script) {
            this.destroyScript(oldName);
        }
        scriptElement._script = null;

        this.createScript(scriptElement);
    }

    /**
     * Creates the script instance for a `pc-script` element. The instance is created disabled,
     * the element's converted attributes are merged over the instance's defaults (which is what
     * allows plain numeric arrays to be typed against those defaults), and only then is the
     * declared enabled state applied — so `initialize()` runs with every attribute in place.
     * @param scriptElement - The `pc-script` element to create the script instance for.
     * @returns The created script, or `null`.
     */
    private createScript(scriptElement: ScriptElement): Script | null {
        const name = scriptElement.getAttribute('name');
        if (!name || !this.component) return null;

        const script = this.component.create(name, { enabled: false });
        if (!script) return null;

        scriptElement._script = script;

        // The JSON blob first with per-property-shadowed keys stripped, then the per-property
        // attributes: each property is written exactly once and individual attributes win
        this.applyAttributes(script, scriptElement.scriptAttributes, this.inlineKeys(scriptElement));
        this.applyInlineAttributes(script, scriptElement);
        script.enabled = scriptElement.enabled;

        scriptElement._onScriptCreated();

        return script;
    }

    /**
     * Applies the per-property attributes present on a `pc-script` element — any attribute that
     * is not part of the element's own API or a reserved HTML attribute name. These are applied
     * after the `attributes` JSON, so an individual attribute always takes precedence over the
     * blob.
     * @param script - The script to apply the attributes to.
     * @param scriptElement - The `pc-script` element holding the attributes.
     */
    private applyInlineAttributes(script: any, scriptElement: ScriptElement) {
        const scriptName = scriptElement.getAttribute('name') ?? '';
        for (const attr of Array.from(scriptElement.attributes)) {
            if (!isReservedAttribute(attr.name)) {
                this.setScriptProperty(script, scriptName, attr.name, attr.value);
            }
        }
    }

    /**
     * Applies a single per-property attribute change to the script of a `pc-script` element.
     * When the attribute has been removed, the value from the `attributes` JSON (if any) takes
     * effect again.
     * @param scriptElement - The `pc-script` element whose attribute changed.
     * @param attributeName - The name of the changed attribute.
     */
    private applyScriptProperty(scriptElement: ScriptElement, attributeName: string) {
        const script = this.scriptFor(scriptElement);
        if (!script) return;

        const value = scriptElement.getAttribute(attributeName);
        if (value === null) {
            const key = kebabToCamel(attributeName);
            const fallback = scriptElement.scriptAttributes[key];
            if (fallback !== undefined) {
                this.applyAttributes(script, { [key]: fallback });
            }
            return;
        }
        this.setScriptProperty(script, scriptElement.getAttribute('name') ?? '', attributeName, value);
    }

    /**
     * Applies one attribute string to a script property. A string-typed attribute takes the
     * value verbatim (so literals like 'color:red' are never hijacked by prefix conversion).
     * Otherwise, explicit prefixes (`asset:`, `entity:`, `vec2:`, `vec3:`, `vec4:`, `color:`)
     * carry their own type, and unprefixed values are parsed according to the type of the
     * attribute's current value. The Script API itself (methods, `entity`, `app`) is never
     * overwritten, invalid values keep the current value, and exceptions thrown by user
     * getters/setters are contained so one bad attribute cannot abort the rest of a batch.
     * @param script - The script to apply the value to.
     * @param scriptName - The script name, used in warning messages.
     * @param attributeName - The (kebab-case) element attribute name.
     * @param value - The attribute value.
     */
    private setScriptProperty(script: any, scriptName: string, attributeName: string, value: string) {
        const key = kebabToCamel(attributeName);
        try {
            const current = script[key];

            if (typeof current === 'function' || SCRIPT_API_MEMBERS.has(key)) {
                console.warn(
                    `Ignoring attribute '${attributeName}' on pc-script '${scriptName}' - '${key}' is part of the Script API.`
                );
                return;
            }

            if (typeof current === 'string') {
                script[key] = value;
            } else if (matchConversion(value)) {
                const converted = this.convertAttributes(value);
                // A prefix that failed to resolve or parse comes back as the raw string
                // (convertAttributes already warned) - never clobber a typed value with it
                if (converted !== value || current === undefined || current === null) {
                    script[key] = converted;
                }
            } else if (typeof current === 'number') {
                script[key] = parseNumber(value, current, attributeName);
            } else if (typeof current === 'boolean') {
                script[key] = parseBool(value, current);
            } else if (current instanceof Vec2) {
                script[key] = parseVec2(value, current, attributeName);
            } else if (current instanceof Vec3) {
                script[key] = parseVec3(value, current, attributeName);
            } else if (current instanceof Vec4) {
                script[key] = parseVec4(value, current, attributeName);
            } else if (current instanceof Color) {
                script[key] = parseColor(value, current, attributeName);
            } else if (current instanceof Quat) {
                script[key] = parseQuat(value, current, attributeName);
            } else {
                const match = findCaseMatch(script, key);
                if (match) {
                    console.warn(
                        `Script '${scriptName}' has no attribute '${key}' - did you mean '${camelToKebab(match)}'? Attribute names are kebab-case.`
                    );
                    return;
                }
                console.warn(
                    `Script '${scriptName}' has no typed attribute '${key}' - assigning the raw string from '${attributeName}'.`
                );
                script[key] = value;
            }
        } catch (error) {
            console.warn(
                `Error applying attribute '${attributeName}' to script '${scriptName}': ${(error as Error).message}`
            );
        }
    }

    private destroyScript(name: string): void {
        if (!this.component) return;
        this.component.destroy(name);
    }

    private handleMutations(mutations: MutationRecord[]) {
        for (const mutation of mutations) {
            // Handle per-property attribute changes on child pc-script elements
            if (mutation.type === 'attributes') {
                const target = mutation.target;
                if (
                    target instanceof ScriptElement &&
                    target.parentElement === this &&
                    mutation.attributeName &&
                    !isReservedAttribute(mutation.attributeName)
                ) {
                    this.applyScriptProperty(target, mutation.attributeName);
                }
                continue;
            }

            // Only direct children are managed - the observer watches the subtree for attribute
            // changes, but deeper childList records must not create or destroy scripts
            // (matching initComponent's ':scope > pc-script' contract)
            if (mutation.target !== this) {
                continue;
            }

            // Handle removed nodes first, so that replacing a pc-script with a same-named one
            // destroys the old script before the replacement is created. Only destroy a script
            // this element actually owns - a duplicate-named element whose own create() failed
            // must not take down the live script on removal.
            mutation.removedNodes.forEach((node) => {
                if (node instanceof ScriptElement) {
                    const scriptName = node.getAttribute('name');
                    if (
                        scriptName &&
                        node._script &&
                        this.component &&
                        this.component.get(scriptName) === node._script
                    ) {
                        this.destroyScript(scriptName);
                    }
                    node._script = null;
                }
            });

            // Handle added nodes
            mutation.addedNodes.forEach((node) => {
                if (node instanceof ScriptElement) {
                    this.createScript(node);
                }
            });
        }
    }

    disconnectedCallback() {
        this.observer.disconnect();
        super.disconnectedCallback?.();
    }

    /**
     * Gets the underlying PlayCanvas script component.
     * @returns The script component.
     */
    get component(): ScriptComponent {
        return super.component as ScriptComponent;
    }
}

customElements.define('pc-scripts', ScriptComponentElement);

export { ScriptComponentElement };
