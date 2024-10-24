import { PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, CameraComponent, Color } from 'playcanvas';

import { ComponentElement } from './component';
import { parseColor } from '../utils';

/**
 * Represents a camera component in the PlayCanvas engine.
 *
 * @category Components
 */
class CameraComponentElement extends ComponentElement {
    private _clearColor = new Color(1, 1, 1, 1);

    private _farClip = 1000;

    private _fov = 45;

    private _nearClip = 0.1;

    private _orthographic = false;

    private _orthoHeight = 10;

    /**
     * Creates a new CameraComponentElement.
     */
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

    /**
     * Gets the camera component.
     * @returns The camera component.
     */
    get component(): CameraComponent | null {
        return super.component as CameraComponent | null;
    }

    /**
     * Sets the clear color of the camera.
     * @param value - The clear color.
     */
    set clearColor(value) {
        this._clearColor = value;
        if (this.component) {
            this.component.clearColor = value;
        }
    }

    /**
     * Gets the clear color of the camera.
     * @returns The clear color.
     */
    get clearColor(): Color {
        return this._clearColor;
    }

    /**
     * Sets the far clip distance of the camera.
     * @param value - The far clip distance.
     */
    set farClip(value: number) {
        this._farClip = value;
        if (this.component) {
            this.component.farClip = value;
        }
    }

    /**
     * Gets the far clip distance of the camera.
     * @returns The far clip distance.
     */
    get farClip(): number {
        return this._farClip;
    }

    /**
     * Sets the field of view of the camera.
     * @param value - The field of view.
     */
    set fov(value: number) {
        this._fov = value;
        if (this.component) {
            this.component.fov = value;
        }
    }

    /**
     * Gets the field of view of the camera.
     * @returns The field of view.
     */
    get fov(): number {
        return this._fov;
    }

    /**
     * Sets the near clip distance of the camera.
     * @param value - The near clip distance.
     */
    set nearClip(value: number) {
        this._nearClip = value;
        if (this.component) {
            this.component.nearClip = value;
        }
    }

    /**
     * Gets the near clip distance of the camera.
     * @returns The near clip distance.
     */
    get nearClip(): number {
        return this._nearClip;
    }

    /**
     * Sets the orthographic projection of the camera.
     * @param value - The orthographic projection.
     */
    set orthographic(value) {
        this._orthographic = value;
        if (this.component) {
            this.component.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
        }
    }

    /**
     * Gets the orthographic projection of the camera.
     * @returns The orthographic projection.
     */
    get orthographic(): boolean {
        return this._orthographic;
    }

    /**
     * Sets the orthographic height of the camera.
     * @param value - The orthographic height.
     */
    set orthoHeight(value: number) {
        this._orthoHeight = value;
        if (this.component) {
            this.component.orthoHeight = value;
        }
    }

    /**
     * Gets the orthographic height of the camera.
     * @returns The orthographic height.
     */
    get orthoHeight() {
        return this._orthoHeight;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'clear-color', 'near-clip', 'far-clip', 'fov', 'orthographic', 'ortho-height'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

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
