import { Color } from 'playcanvas';
import { ComponentElement } from './component.mjs';
import { parseColor } from '../utils.mjs';

class CameraComponentElement extends ComponentElement {
    _clearColor = new Color(1, 1, 1, 1);
    _farClip = 1000;
    _fov = 45;
    _nearClip = 0.1;

    constructor() {
        super('camera');
    }

    getInitialComponentData() {
        return {
            clearColor: this._clearColor,
            farClip: this._farClip,
            fov: this._fov,
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

    set farClip(value) {
        this._farClip = value;
        if (this.component) {
            this.component.farClip = value;
        }
    }

    get farClip() {
        return this._farClip;
    }

    set fov(value) {
        this._fov = value;
        if (this.component) {
            this.component.fov = value;
        }
    }

    get fov() {
        return this._fov;
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

    static get observedAttributes() {
        return ['clear-color', 'near-clip', 'far-clip', 'fov'];
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
            case 'fov':
                this.fov = parseFloat(newValue);
                break;
        }
    }
}

export { CameraComponentElement };
