import { RenderComponent } from 'playcanvas';

import { ComponentElement } from './component';

class RenderComponentElement extends ComponentElement {
    _type = 'asset';

    _castShadows = false;

    _receiveShadows = false;

    constructor() {
        super('render');
    }

    getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            receiveShadows: this._receiveShadows
        };
    }

    get component(): RenderComponent | null {
        return super.component as RenderComponent | null;
    }

    set type(value: string) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    get type() {
        return this._type;
    }

    set castShadows(value: boolean) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }

    get castShadows() {
        return this._castShadows;
    }

    set receiveShadows(value: boolean) {
        this._receiveShadows = value;
        if (this.component) {
            this.component.receiveShadows = value;
        }
    }

    get receiveShadows() {
        return this._receiveShadows;
    }

    static get observedAttributes() {
        return ['type', 'cast-shadows', 'receive-shadows'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
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

customElements.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
