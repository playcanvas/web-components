import { Color } from 'playcanvas';
import { ComponentElement } from './component.mjs';
import { parseColor } from '../utils.mjs';

class CameraComponentElement extends ComponentElement {
    constructor() {
        super('camera');

        // Set default values (optional)
        this._clearColor = new Color(1, 1, 1, 1); // Default to white
        this._nearClip = 0.1; // Default value for near clip
        this._farClip = 1000; // Default value for far clip
    }

    getInitialComponentData() {
        return {
            clearColor: this._clearColor,
            farClip: this._farClip,
            nearClip: this._nearClip
        };
    }

    set clearColor(value) {
        this._clearColor = value;
        if (this.component) {
            this.component.clearColor = value;
        }
    }

    get clearColor() {
        return this._clearColor;
    }

    set nearClip(value) {
        this._nearClip = value;
        if (this.component) {
            this.component.nearClip = value;
        }
    }

    get nearClip() {
        return this._nearClip;
    }

    set farClip(value) {
        this._farClip = value;
        if (this.component) {
            this.component.farClip = value;
        }
    }

    get farClip() {
        return this._farClip;
    }

    static get observedAttributes() {
        return ['clear-color', 'near-clip', 'far-clip'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'clear-color':
                this.clearColor = parseColor(newValue);
                break;
            case 'near-clip':
                this.nearClip = parseFloat(newValue);
                break;
            case 'far-clip':
                this.farClip = parseFloat(newValue);
                break;
        }
    }
}

export { CameraComponentElement };
