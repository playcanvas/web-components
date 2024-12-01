/**
 * The ScriptElement interface provides properties and methods for manipulating
 * `<pc-script>` elements. The ScriptElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class ScriptElement extends HTMLElement {
    private _attributes: string = '{}';

    private _enabled: boolean = true;

    private _name: string = '';

    /**
     * Sets the attributes of the script.
     * @param value - The attributes of the script.
     */
    set scriptAttributes(value: string) {
        this._attributes = value;
        this.dispatchEvent(new CustomEvent('scriptattributeschange', {
            detail: { attributes: value },
            bubbles: true
        }));
    }

    /**
     * Gets the attributes of the script.
     * @returns The attributes of the script.
     */
    get scriptAttributes() {
        return this._attributes;
    }

    /**
     * Sets the enabled state of the script.
     * @param value - The enabled state of the script.
     */
    set enabled(value: boolean) {
        this._enabled = value;
        this.dispatchEvent(new CustomEvent('scriptenablechange', {
            detail: { enabled: value },
            bubbles: true
        }));
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
