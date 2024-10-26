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

        this.scriptsElement?.component!.create(this._name);
    }

    disconnectedCallback() {
        this.scriptsElement?.component!.destroy(this._name);
    }

    protected get scriptsElement(): ScriptComponentElement | null {
        const scriptsElement = this.parentElement as ScriptComponentElement;

        if (!(scriptsElement instanceof ScriptComponentElement)) {
            console.warn('pc-script must be a direct child of a pc-scripts element');
            return null;
        }

        return scriptsElement;
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

customElements.define('pc-script', ScriptElement);

export { ScriptElement };
