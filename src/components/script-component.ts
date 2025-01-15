import { ScriptComponent, Script, Vec2, Vec3, Vec4 } from 'playcanvas';

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
 * `<pc-scripts>` elements. The ScriptComponentElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
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

    private applyAttributes(script: any, attributes: string | null) {
        try {
            const attributesObject = attributes ? JSON.parse(attributes) : {};

            const applyValue = (target: any, key: string, value: any) => {
                // Handle asset references
                if (typeof value === 'string' && value.startsWith('asset:')) {
                    const assetId = value.slice(6);
                    const assetElement = document.querySelector(`pc-asset#${assetId}`) as AssetElement;
                    if (assetElement) {
                        target[key] = assetElement.asset;
                        return;
                    }
                }

                // Handle arrays
                if (value && typeof value === 'object' && Array.isArray(value)) {
                    // If it's an array of objects, recursively apply to each object
                    if (value.length > 0 && typeof value[0] === 'object') {
                        target[key] = value.map((item) => {
                            const obj = {};
                            for (const itemKey in item) {
                                applyValue(obj, itemKey, item[itemKey]);
                            }
                            return obj;
                        });
                        return;
                    }

                    // Handle vectors
                    if (value.length === 2 && typeof value[0] === 'number') {
                        target[key] = new Vec2(value[0], value[1]);
                        return;
                    }
                    if (value.length === 3 && typeof value[0] === 'number') {
                        target[key] = new Vec3(value[0], value[1], value[2]);
                        return;
                    }
                    if (value.length === 4 && typeof value[0] === 'number') {
                        target[key] = new Vec4(value[0], value[1], value[2], value[3]);
                        return;
                    }
                }

                // Handle nested objects (non-array)
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    if (!target[key] || typeof target[key] !== 'object') {
                        target[key] = {};
                    }
                    for (const nestedKey in value) {
                        applyValue(target[key], nestedKey, value[nestedKey]);
                    }
                } else {
                    target[key] = value;
                }
            };

            for (const key in attributesObject) {
                applyValue(script, key, attributesObject[key]);
            }
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

        this.component.on(`create:${name}`, (script) => {
            this.applyAttributes(script, attributes);
        });
        return this.component.create(name);
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
