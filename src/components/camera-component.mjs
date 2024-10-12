import { PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, Color } from 'playcanvas';

import { ComponentElement } from './component.mjs';
import { parseColor } from '../utils.mjs';

class CameraComponentElement extends ComponentElement {
    _clearColor = new Color(1, 1, 1, 1);

    _farClip = 1000;

    _fov = 45;

    _nearClip = 0.1;

    _orthographic = false;

    _orthoHeight = 10;

    constructor() {
        super('camera');
    }

    getInitialComponentData() {
        return {
            clearColor: this._clearColor,
            farClip: this._farClip,
            fov: this._fov,
            nearClip: this._nearClip,
            projection: this._orthographic ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE,
            orthoHeight: this._orthoHeight
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

    set orthographic(value) {
        this._orthographic = value;
        if (this.component) {
            this.component.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
        }
    }

    get orthographic() {
        return this._orthographic;
    }

    set orthoHeight(value) {
        this._orthoHeight = value;
        if (this.component) {
            this.component.orthoHeight = value;
        }
    }

    get orthoHeight() {
        return this._orthoHeight;
    }

    static get observedAttributes() {
        return ['clear-color', 'near-clip', 'far-clip', 'fov', 'orthographic', 'ortho-height'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'clear-color':
                this.clearColor = parseColor(newValue);
                break;
            case 'far-clip':
                this.farClip = parseFloat(newValue);
                break;
            case 'fov':
                this.fov = parseFloat(newValue);
                break;
            case 'near-clip':
                this.nearClip = parseFloat(newValue);
                break;
            case 'orthographic':
                this.orthographic = newValue !== null;
                break;
            case 'ortho-height':
                this.orthoHeight = parseFloat(newValue);
                break;
        }
    }
}

export { CameraComponentElement };
