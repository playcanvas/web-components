import { Color, ScriptComponent, Script, Vec2, Vec3, Vec4 } from 'playcanvas';

import { ComponentElement } from './component';
import { ScriptElement } from './script';
import { AssetElement } from '../asset';

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
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-scripts/ | `<pc-scripts>`} elements.
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
        this.observer.observe(this, {
            childList: true
        });

        // Listen for script attribute and enable changes
        this.addEventListener('scriptattributeschange', this.handleScriptAttributesChange.bind(this));
        this.addEventListener('scriptenablechange', this.handleScriptEnableChange.bind(this));
    }

    initComponent() {
        // Handle initial script elements
        this.querySelectorAll<ScriptElement>(':scope > pc-script').forEach((scriptElement) => {
            const scriptName = scriptElement.getAttribute('name');
            const attributes = scriptElement.getAttribute('attributes');
            if (scriptName) {
                this.createScript(scriptName, attributes);
            }
        });
    }

    /**
     * Recursively converts raw attribute data into proper PlayCanvas types. Supported conversions:
     * - "asset:assetId" → resolves to an Asset instance
     * - "entity:entityId" → resolves to an Entity instance
     * - "vec2:1,2" → new Vec2(1,2)
     * - "vec3:1,2,3" → new Vec3(1,2,3)
     * - "vec4:1,2,3,4" → new Vec4(1,2,3,4)
     * - "color:1,0.5,0.5,1" → new Color(1,0.5,0.5,1)
     */
    private convertAttributes(item: any): any {
        if (typeof item === 'string') {
            if (item.startsWith('asset:')) {
                const assetId = item.slice(6);
                const assetElement = document.querySelector(`pc-asset#${assetId}`) as any;
                if (assetElement) {
                    return assetElement.asset;
                }
            }
            if (item.startsWith('entity:')) {
                const entityId = item.slice(7);
                const entityElement = document.querySelector(`pc-entity[name="${entityId}"]`) as any;
                if (entityElement) {
                    return entityElement.entity;
                }
            }
            if (item.startsWith('vec2:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 2 && parts.every(v => !isNaN(v))) {
                    return new Vec2(parts[0], parts[1]);
                }
            }
            if (item.startsWith('vec3:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 3 && parts.every(v => !isNaN(v))) {
                    return new Vec3(parts[0], parts[1], parts[2]);
                }
            }
            if (item.startsWith('vec4:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 4 && parts.every(v => !isNaN(v))) {
                    return new Vec4(parts[0], parts[1], parts[2], parts[3]);
                }
            }
            if (item.startsWith('color:')) {
                const parts = item.slice(6).split(',').map(Number);
                if (parts.length === 4 && parts.every(v => !isNaN(v))) {
                    return new Color(parts[0], parts[1], parts[2], parts[3]);
                }
            }
            return item;
        }

        if (Array.isArray(item)) {
            // If it's an array of objects, convert each element individually.
            if (item.length > 0 && typeof item[0] === 'object') {
                return item.map((el: any) => this.convertAttributes(el));
            }
            // Otherwise, leave the numeric array unchanged but process each element.
            return item.map((el: any) => this.convertAttributes(el));
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
     * Preprocess the attributes object by converting its values.
     */
    private preprocessAttributes(attrs: any): any {
        return this.convertAttributes(attrs);
    }

    /**
     * Recursively merge properties from source into target.
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
     * Update script attributes by merging preprocessed values into the script.
     */
    private applyAttributes(script: any, attributes: string | null) {
        try {
            const attributesObject = attributes ? JSON.parse(attributes) : {};
            const converted = this.convertAttributes(attributesObject);
            this.mergeDeep(script, converted);
        } catch (error) {
            console.error(`Error parsing attributes JSON string ${attributes}:`, error);
        }
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

    private createScript(name: string, attributes: string | null): Script | null {
        if (!this.component) return null;

        let attributesObject = {};
        if (attributes) {
            try {
                attributesObject = JSON.parse(attributes);
                // Preprocess attributes: convert arrays or strings into vectors, colors, asset references, etc.
                attributesObject = this.preprocessAttributes(attributesObject);
            } catch (error) {
                console.error(`Error parsing attributes JSON string ${attributes}:`, error);
            }
        }
        return this.component.create(name, {
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
                        this.createScript(scriptName, attributes);
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
    get component(): ScriptComponent | null {
        return super.component as ScriptComponent | null;
    }
}

customElements.define('pc-scripts', ScriptComponentElement);

export { ScriptComponentElement };
