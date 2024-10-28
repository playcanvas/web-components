import { ScriptType } from 'playcanvas';

import { AppElement } from '../app';
import { ScriptComponentElement } from './script-component';

/**
 * Represents a script in the PlayCanvas engine.
 */
class ScriptElement extends HTMLElement {
    private _attributes: Record<string, any> = {};

    private _enabled: boolean = true;

    private _name: string = '';

    private _script: ScriptType | null = null;

    async connectedCallback() {
        const appElement = this.closest('pc-app') as AppElement | null;
        if (!appElement) {
            console.error(`${this.tagName.toLowerCase()} should be a descendant of pc-app`);
            return;
        }

        await appElement.getApplication();

        const scriptAttributes = this.getAttribute('attributes');
        if (scriptAttributes) {
            try {
                this._attributes = JSON.parse(scriptAttributes);
            } catch (e) {
                console.error('Failed to parse script attributes:', e);
            }
        }

        // When the script is created, initialize it with the necessary attributes
        this.scriptsElement?.component!.on(`create:${this._name}`, (scriptInstance) => {
            Object.assign(scriptInstance, this._attributes);
        });

        this._script = this.scriptsElement?.component!.create(this._name, { preloading: false }) ?? null;
    }

    disconnectedCallback() {
        this.scriptsElement?.component!.destroy(this._name);
    }

    refreshAttributes() {
        if (this._script) {
            Object.entries(this._attributes).forEach(([name, value]) => {
                if (this._script && name in this._script) {
                    (this._script as any)[name] = value;
                }
            });
        }
    }

    protected get scriptsElement(): ScriptComponentElement | null {
        const scriptsElement = this.parentElement as ScriptComponentElement;

        if (!(scriptsElement instanceof ScriptComponentElement)) {
            console.warn('pc-script must be a direct child of a pc-scripts element');
            return null;
        }

        return scriptsElement;
    }

    set scriptAttributes(value: string) {
        this._attributes = JSON.parse(value);
        this.refreshAttributes();
    }

    get scriptAttributes() {
        return JSON.stringify(this._attributes);
    }

    set enabled(value: boolean) {
        this._enabled = value;
        if (this._script) {
            this._script.enabled = value;
        }
    }

    /**
     * Gets the enabled state of the script.
     * @returns The enabled state of the script.
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Sets the name of the script to create.
     * @param value - The name.
     */
    set name(value: string) {
        this._name = value;
    }

    /**
     * Gets the name of the script.
     * @returns The name.
     */
    get name() {
        return this._name;
    }

    static get observedAttributes() {
        return ['attributes', 'enabled', 'name'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'attributes':
                this.scriptAttributes = newValue;
                break;
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
            case 'name':
                this.name = newValue;
                break;
        }
    }
}

customElements.define('pc-script', ScriptElement);

export { ScriptElement };
