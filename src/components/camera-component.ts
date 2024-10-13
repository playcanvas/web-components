import { PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, CameraComponent, Color } from 'playcanvas';

import { ComponentElement } from './component';
import { parseColor } from '../utils';

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

    get component(): CameraComponent | null {
        return super.component as CameraComponent | null;
    }

    set clearColor(value) {
        this._clearColor = value;
        this.component!.clearColor = value;
    }

    get clearColor(): Color {
        return this._clearColor;
    }

    set farClip(value: number) {
        this._farClip = value;
        this.component!.farClip = value;
    }

    get farClip(): number {
        return this._farClip;
    }

    set fov(value: number) {
        this._fov = value;
        this.component!.fov = value;
    }

    get fov(): number {
        return this._fov;
    }

    set nearClip(value: number) {
        this._nearClip = value;
        this.component!.nearClip = value;
    }

    get nearClip(): number {
        return this._nearClip;
    }

    set orthographic(value) {
        this._orthographic = value;
        this.component!.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
    }

    get orthographic(): boolean {
        return this._orthographic;
    }

    set orthoHeight(value: number) {
        this._orthoHeight = value;
        this.component!.orthoHeight = value;
    }

    get orthoHeight() {
        return this._orthoHeight;
    }

    static get observedAttributes() {
        return ['clear-color', 'near-clip', 'far-clip', 'fov', 'orthographic', 'ortho-height'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
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

customElements.define('pc-camera', CameraComponentElement);

export { CameraComponentElement };
