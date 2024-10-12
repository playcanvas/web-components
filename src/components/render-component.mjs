import { ComponentElement } from './component.mjs';

class RenderComponentElement extends ComponentElement {
    constructor() {
        super('render');

        this._type = 'asset';
        this._castShadows = false;
        this._receiveShadows = false;
    }

    getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            receiveShadows: this._receiveShadows
        };
    }

    // Type
    set type(value) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    get type() {
        return this._type;
    }

    // Cast Shadows
    set castShadows(value) {
        this._castShadows = Boolean(value);
        if (this.component) {
            this.component.castShadows = this._castShadows;
        }
    }

    get castShadows() {
        return this._castShadows;
    }

    // Receive Shadows
    set receiveShadows(value) {
        this._receiveShadows = Boolean(value);
        if (this.component) {
            this.component.receiveShadows = this._receiveShadows;
        }
    }

    get receiveShadows() {
        return this._receiveShadows;
    }

    static get observedAttributes() {
        return ['type', 'cast-shadows', 'receive-shadows'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'type':
                this.type = newValue;
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== null;  // Existence implies true
                break;
            case 'receive-shadows':
                this.receiveShadows = newValue !== null;  // Existence implies true
                break;
        }
    }
}

export { RenderComponentElement };
