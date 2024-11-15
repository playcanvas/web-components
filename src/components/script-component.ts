import { ScriptComponent, Script, Vec2, Vec3, Vec4 } from 'playcanvas';

import { ComponentElement } from './component';
import { ScriptElement } from './script';

const tmpV2 = new Vec2();
const tmpV3 = new Vec3();
const tmpV4 = new Vec4();

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
 * Represents a script component in the PlayCanvas engine.
 *
 * @category Components
 */
class ScriptComponentElement extends ComponentElement {
    private observer: MutationObserver;

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
            // Parse the attributes string into an object and set them on the script
            const attributesObject = attributes ? JSON.parse(attributes) : {};
            for (const key in attributesObject) {
                const value = attributesObject[key];
                if (Array.isArray(value) && script[key] instanceof Vec2) {
                    script[key] = tmpV2.set(value[0], value[1]);
                    continue;
                }
                if (Array.isArray(value) && script[key] instanceof Vec3) {
                    script[key] = tmpV3.set(value[0], value[1], value[2]);
                    continue;
                }
                if (Array.isArray(value) && script[key] instanceof Vec4) {
                    script[key] = tmpV4.set(value[0], value[1], value[2], value[3]);
                    continue;
                }

                script[key] = value;
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
     * Gets the script component.
     * @returns The script component.
     */
    get component(): ScriptComponent | null {
        return super.component as ScriptComponent | null;
    }
}

customElements.define('pc-scripts', ScriptComponentElement);

export { ScriptComponentElement };
