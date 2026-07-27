import { Color, ScriptComponent, Script, Vec2, Vec3, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { ScriptElement } from './script';
import { getEntity, parseComponents } from '../utils';

// Add these interfaces at the top of the file, after the imports
interface ScriptAttributesChangeEvent extends CustomEvent {
    detail: { attributes: any };
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
            const scriptName = scriptElement.getAttribute('name');
            const attributes = scriptElement.getAttribute('attributes');
            if (scriptName) {
                this.createScript(scriptName, attributes, scriptElement.enabled);
            }
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
     * Recursively merge properties from source into target.
     * @param target - The target object to merge into.
     * @param source - The source object to merge from.
     * @returns The merged object.
     */
    private mergeDeep(target: any, source: any): any {
        for (const key in source) {
            if (
                source[key] &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key])
            ) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Update script attributes by merging converted values into the script.
     * @param script - The script to update.
     * @param name - The script name, used in the warning message.
     * @param attributes - The attributes to merge into the script.
     */
    private applyAttributes(script: any, name: string, attributes: string | null) {
        try {
            const attributesObject = attributes ? JSON.parse(attributes) : {};
            this.mergeDeep(script, this.convertAttributes(attributesObject));
        } catch (error) {
            console.warn(`Invalid 'attributes' JSON on pc-script '${name}': ${(error as Error).message}`);
        }
    }

    private handleScriptAttributesChange(event: ScriptAttributesChangeEvent) {
        const scriptElement = event.target as ScriptElement;
        const scriptName = scriptElement.getAttribute('name');
        if (!scriptName || !this.component) return;

        const script = this.component.get(scriptName);
        if (script) {
            this.applyAttributes(script, scriptName, event.detail.attributes);
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

    private createScript(name: string, attributes: string | null, enabled: boolean): Script | null {
        if (!this.component) return null;

        let attributesObject = {};
        if (attributes) {
            try {
                // Convert prefixed strings into vectors, colors, asset and entity references, etc.
                attributesObject = this.convertAttributes(JSON.parse(attributes));
            } catch (error) {
                console.warn(`Invalid 'attributes' JSON on pc-script '${name}': ${(error as Error).message}`);
            }
        }
        return this.component.create(name, {
            enabled,
            properties: attributesObject
        });
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
                    const scriptName = node.getAttribute('name');
                    const attributes = node.getAttribute('attributes');
                    if (scriptName) {
                        this.createScript(scriptName, attributes, (node as ScriptElement).enabled);
                    }
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
