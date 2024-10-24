import { ScriptComponentElement } from './script-component';

/**
 * Represents a script in the PlayCanvas engine.
 */
class ScriptElement extends HTMLElement {
    private _name: string = '';

    connectedCallback() {
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
        this.disconnectedCallback();
        this.connectedCallback();
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
