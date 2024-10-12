import { Color } from 'playcanvas';

import { ComponentElement } from './component.mjs';
import { parseColor } from '../utils.mjs';

class LightComponentElement extends ComponentElement {
    constructor() {
        super('light');

        // Set default values
        this._castShadows = false;
        this._color = new Color(1, 1, 1);
        this._type = 'directional';
    }

    getInitialComponentData() {
        return {
            castShadows: this._castShadows,
            color: this._color,
            type: this._type
        };
    }

    set castShadows(value) {
        this._castShadows = Boolean(value);
        if (this.component) {
            this.component.castShadows = this._castShadows;
        }
    }

    get castShadows() {
        return this._castShadows;
    }

    set color(value) {
        this._color = value;
        if (this.component) {
            this.component.color = new Color(value);
        }
    }

    get color() {
        return this._color;
    }

    set type(value) {
        if (['directional', 'point', 'spot'].includes(value)) {
            this._type = value;
            if (this.component) {
                this.component.type = value;
            }
        } else {
            console.warn(`Invalid light type '${value}', using default type '${this._type}'.`);
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return ['color', 'cast-shadows', 'type'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        switch (name) {
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== null && newValue !== 'false';
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}

customElements.define('pc-light', LightComponentElement);

export { LightComponentElement };
