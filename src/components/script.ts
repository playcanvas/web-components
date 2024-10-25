import { AppElement } from '../app';
import { ScriptComponentElement } from './script-component';

/**
 * Represents a script in the PlayCanvas engine.
 */
class ScriptElement extends HTMLElement {
    private _name: string = '';

    async connectedCallback() {
        const appElement = this.closest('pc-app') as AppElement | null;
        if (!appElement) {
            console.error(`${this.tagName.toLowerCase()} should be a descendant of pc-app`);
            return;
        }

        await appElement.getApplication();

        this.createScript();
    }

    createScript() {
        const scriptsElement = this.closest('pc-scripts') as ScriptComponentElement;

        if (!scriptsElement) {
            console.warn('pc-script must be used within a pc-scripts element');
            return;
        }

        scriptsElement.component!.create(this._name);
    }

    disconnectedCallback() {
        const scriptsElement = this.closest('pc-scripts') as ScriptComponentElement;

        if (!scriptsElement) {
            console.warn('pc-script must be used within a pc-scripts element');
            return;
        }

        scriptsElement.component!.destroy(this._name);
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
        return ['name'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'name':
                this.name = newValue;
                break;
        }
    }
}

export { ScriptElement };
