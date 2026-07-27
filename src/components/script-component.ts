import { Color, ScriptComponent, Script, Vec2, Vec3, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { ScriptElement } from './script';
import { getEntity, parseComponents } from '../utils';

// Add these interfaces at the top of the file, after the imports
interface ScriptAttributesChangeEvent extends CustomEvent {
    detail: { attributes: Record<string, any> };
}

interface ScriptEnableChangeEvent extends CustomEvent {
    detail: { enabled: boolean };
}

// Add this interface before the ScriptComponentElement class
declare global {
    interface HTMLElementEventMap {
        'scriptattributeschange': ScriptAttributesChangeEvent;
        'scriptenablechange': ScriptEnableChangeEvent;
    }
}

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

        // Listen for script attribute and enable changes
        this.addEventListener('scriptattributeschange', this.handleScriptAttributesChange.bind(this));
        this.addEventListener('scriptenablechange', this.handleScriptEnableChange.bind(this));
    }

    connectedCallback() {
        // (Re-)observe on every connection - disconnectedCallback disconnects the observer
        this.observer.observe(this, { childList: true });
        return super.connectedCallback();
    }

    initComponent() {
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
            if (item.startsWith('asset:')) {
                const id = item.slice(6);
                const asset = AssetElement.get(id);
                if (asset) {
                    return asset;
                }
                console.warn(`Unable to resolve '${item}' in script attributes - no pc-asset found with id '${id}'.`);
                return item;
            }
            if (item.startsWith('entity:')) {
                const ref = item.slice(7);
                const entity = getEntity(ref);
                if (entity) {
                    return entity;
                }
                console.warn(`Unable to resolve '${item}' in script attributes - no pc-entity found matching '${ref}'.`);
                return item;
            }
            if (item.startsWith('vec2:')) {
                const components = parseComponents(item.slice(5), 2);
                if (components) {
                    return new Vec2(components);
                }
                console.warn(`Invalid script attribute value '${item}'. Expected 2 space-separated numbers after 'vec2:'.`);
                return item;
            }
            if (item.startsWith('vec3:')) {
                const components = parseComponents(item.slice(5), 3);
                if (components) {
                    return new Vec3(components);
                }
                console.warn(`Invalid script attribute value '${item}'. Expected 3 space-separated numbers after 'vec3:'.`);
                return item;
            }
            if (item.startsWith('vec4:')) {
                const components = parseComponents(item.slice(5), 4);
                if (components) {
                    return new Vec4(components);
                }
                console.warn(`Invalid script attribute value '${item}'. Expected 4 space-separated numbers after 'vec4:'.`);
                return item;
            }
            if (item.startsWith('color:')) {
                const components = parseComponents(item.slice(6), 4) ?? parseComponents(item.slice(6), 3);
                if (components) {
                    return new Color(components);
                }
                console.warn(`Invalid script attribute value '${item}'. Expected 3 or 4 space-separated numbers after 'color:'.`);
                return item;
            }
            return item;
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
            if (value && typeof value === 'object' && !Array.isArray(value)) {
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
    private isMathType(value: any): value is Vec2 | Vec3 | Vec4 | Color {
        return value instanceof Vec2 || value instanceof Vec3 || value instanceof Vec4 || value instanceof Color;
    }

    /**
     * Converts a plain numeric array to the math type of `current`. Returns `null` (and logs a
     * warning) when the array's length or contents don't match the type.
     * @param current - The current (typed) value of the property.
     * @param value - The incoming array.
     * @param key - The property name, used in the warning message.
     * @returns The converted value, or `null`.
     */
    private arrayToMathType(current: Vec2 | Vec3 | Vec4 | Color, value: any[], key: string): Vec2 | Vec3 | Vec4 | Color | null {
        if (value.every(component => typeof component === 'number' && Number.isFinite(component))) {
            if (current instanceof Vec2 && value.length === 2) return new Vec2(value);
            if (current instanceof Vec3 && value.length === 3) return new Vec3(value);
            if (current instanceof Vec4 && value.length === 4) return new Vec4(value);
            if (current instanceof Color && (value.length === 3 || value.length === 4)) return new Color(value);
        }
        console.warn(`Cannot convert script attribute '${key}' array [${value}] to ${current.constructor.name}. Keeping the current value.`);
        return null;
    }

    /**
     * Update script attributes by merging converted values into the script.
     * @param script - The script to update.
     * @param attributes - The attributes to merge into the script.
     */
    private applyAttributes(script: any, attributes: Record<string, any>) {
        this.mergeDeep(script, this.convertAttributes(attributes));
    }

    private handleScriptAttributesChange(event: ScriptAttributesChangeEvent) {
        const scriptElement = event.target as ScriptElement;
        const scriptName = scriptElement.getAttribute('name');
        if (!scriptName || !this.component) return;

        const script = this.component.get(scriptName);
        if (script) {
            this.applyAttributes(script, event.detail.attributes);
        }
    }

    private handleScriptEnableChange(event: ScriptEnableChangeEvent) {
        const scriptElement = event.target as ScriptElement;
        const scriptName = scriptElement.getAttribute('name');
        if (!scriptName || !this.component) return;

        const script = this.component.get(scriptName);
        if (script) {
            script.enabled = event.detail.enabled;
        }
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

        this.mergeDeep(script, this.convertAttributes(scriptElement.scriptAttributes));
        script.enabled = scriptElement.enabled;

        scriptElement._onScriptCreated();

        return script;
    }

    private destroyScript(name: string): void {
        if (!this.component) return;
        this.component.destroy(name);
    }

    private handleMutations(mutations: MutationRecord[]) {
        for (const mutation of mutations) {
            // Handle added nodes
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'pc-script') {
                    this.createScript(node as ScriptElement);
                }
            });

            // Handle removed nodes
            mutation.removedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'pc-script') {
                    const scriptName = node.getAttribute('name');
                    if (scriptName) {
                        this.destroyScript(scriptName);
                    }
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

declare global {
    interface HTMLElementTagNameMap {
        'pc-scripts': ScriptComponentElement;
    }
}

export { ScriptComponentElement };
