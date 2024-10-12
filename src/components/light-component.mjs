import { Color } from 'playcanvas';
import { ComponentElement } from './component.mjs';

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

    parseColor(value) {
        const components = value.split(',').map(Number);
        if (components.length === 3 || components.length === 4) {
            if (components.every(c => !isNaN(c))) {
                // Determine if components are in 0-1 or 0-255 range
                const maxComponent = Math.max(...components);
                let colorComponents = components;
                if (maxComponent > 1) {
                    // Normalize to 0-1
                    colorComponents = components.map(c => c / 255);
                }
                return new Color(...colorComponents);
            }
        }
        console.warn(`Invalid color value '${value}', using default color.`);
        return this._color.clone();
    }

    set castShadows(value) {
        this._castShadows = Boolean(value);
        if (this.lightComponent) {
            this.lightComponent.castShadows = this._castShadows;
        }
    }

    get castShadows() {
        return this._castShadows;
    }

    set color(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._color = value;
            if (this.lightComponent) {
                this.lightComponent.color = new Color(value);
            }
        }
    }

    get color() {
        return this._color;
    }

    set type(value) {
        if (['directional', 'point', 'spot'].includes(value)) {
            this._type = value;
            if (this.lightComponent) {
                this.lightComponent.type = value;
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
                this.color = this.parseColor(newValue);
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

export { LightComponentElement };
