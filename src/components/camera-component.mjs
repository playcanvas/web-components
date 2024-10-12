import { Color } from 'playcanvas';
import { ComponentElement } from './component.mjs';

class CameraComponentElement extends ComponentElement {
    constructor() {
        super('camera');

        // Set default values (optional)
        this._clearColor = [1, 1, 1, 1]; // Default to white, for instance
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
        if (Array.isArray(value) && value.length === 4) {
            this._clearColor = value;
            if (this.cameraComponent) {
                this.cameraComponent.clearColor = new Color(value);
            }
        }
    }

    get clearColor() {
        return this._clearColor;
    }

    set nearClip(value) {
        this._nearClip = value;
        if (this.cameraComponent) {
            this.cameraComponent.nearClip = value;
        }
    }

    get nearClip() {
        return this._nearClip;
    }

    set farClip(value) {
        this._farClip = value;
        if (this.cameraComponent) {
            this.cameraComponent.farClip = value;
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
                this.clearColor = newValue.split(',').map(Number);
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
