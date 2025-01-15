import { CameraComponent, Color, Vec4, GAMMA_NONE, GAMMA_SRGB, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, TONEMAP_LINEAR, TONEMAP_FILMIC, TONEMAP_NEUTRAL, TONEMAP_ACES2, TONEMAP_ACES, TONEMAP_HEJL, TONEMAP_NONE, XRTYPE_VR } from 'playcanvas';

import { ComponentElement } from './component';
import { parseColor, parseVec4 } from '../utils';

const tonemaps = new Map([
    ['none', TONEMAP_NONE],
    ['linear', TONEMAP_LINEAR],
    ['filmic', TONEMAP_FILMIC],
    ['hejl', TONEMAP_HEJL],
    ['aces', TONEMAP_ACES],
    ['aces2', TONEMAP_ACES2],
    ['neutral', TONEMAP_NEUTRAL]
]);

/**
 * The CameraComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-camera/ | `<pc-camera>`} elements.
 * The CameraComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class CameraComponentElement extends ComponentElement {
    private _clearColor = new Color(0.75, 0.75, 0.75, 1);

    private _clearColorBuffer = true;

    private _clearDepthBuffer = true;

    private _clearStencilBuffer = false;

    private _cullFaces = true;

    private _farClip = 1000;

    private _flipFaces = false;

    private _fov = 45;

    private _frustumCulling = true;

    private _gamma: 'none' | 'srgb' = 'srgb';

    private _horizontalFov = false;

    private _nearClip = 0.1;

    private _orthographic = false;

    private _orthoHeight = 10;

    private _priority = 0;

    private _rect = new Vec4(0, 0, 1, 1);

    private _scissorRect = new Vec4(0, 0, 1, 1);

    private _tonemap: 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral' = 'none';

    /** @ignore */
    constructor() {
        super('camera');
    }

    getInitialComponentData() {
        return {
            clearColor: this._clearColor,
            clearColorBuffer: this._clearColorBuffer,
            clearDepthBuffer: this._clearDepthBuffer,
            clearStencilBuffer: this._clearStencilBuffer,
            cullFaces: this._cullFaces,
            farClip: this._farClip,
            flipFaces: this._flipFaces,
            fov: this._fov,
            frustumCulling: this._frustumCulling,
            gammaCorrection: this._gamma === 'srgb' ? GAMMA_SRGB : GAMMA_NONE,
            horizontalFov: this._horizontalFov,
            nearClip: this._nearClip,
            orthographic: this._orthographic,
            orthoHeight: this._orthoHeight,
            priority: this._priority,
            rect: this._rect,
            scissorRect: this._scissorRect,
            toneMapping: tonemaps.get(this._tonemap)
        };
    }

    get xrAvailable() {
        const xrManager = this.component?.system.app.xr;
        return xrManager && xrManager.supported && xrManager.isAvailable(XRTYPE_VR);
    }

    startXr(type: 'immersive-ar' | 'immersive-vr', space: 'bounded-floor' | 'local' | 'local-floor' | 'unbounded' | 'viewer') {
        if (this.component && this.xrAvailable) {
            this.component.startXr(type, space, {
                callback: (err: any) => {
                    if (err) console.error(`WebXR Immersive VR failed to start: ${err.message}`);
                }
            });
        }
    }

    endXr() {
        if (this.component) {
            this.component.endXr();
        }
    }

    /**
     * Gets the underlying PlayCanvas camera component.
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
     * Sets the clear color buffer of the camera.
     * @param value - The clear color buffer.
     */
    set clearColorBuffer(value: boolean) {
        this._clearColorBuffer = value;
        if (this.component) {
            this.component.clearColorBuffer = value;
        }
    }

    /**
     * Gets the clear color buffer of the camera.
     * @returns The clear color buffer.
     */
    get clearColorBuffer(): boolean {
        return this._clearColorBuffer;
    }

    /**
     * Sets the clear depth buffer of the camera.
     * @param value - The clear depth buffer.
     */
    set clearDepthBuffer(value: boolean) {
        this._clearDepthBuffer = value;
        if (this.component) {
            this.component.clearDepthBuffer = value;
        }
    }

    /**
     * Gets the clear depth buffer of the camera.
     * @returns The clear depth buffer.
     */
    get clearDepthBuffer(): boolean {
        return this._clearDepthBuffer;
    }

    /**
     * Sets the clear stencil buffer of the camera.
     * @param value - The clear stencil buffer.
     */
    set clearStencilBuffer(value: boolean) {
        this._clearStencilBuffer = value;
        if (this.component) {
            this.component.clearStencilBuffer = value;
        }
    }

    /**
     * Gets the clear stencil buffer of the camera.
     * @returns The clear stencil buffer.
     */
    get clearStencilBuffer(): boolean {
        return this._clearStencilBuffer;
    }

    /**
     * Sets the cull faces of the camera.
     * @param value - The cull faces.
     */
    set cullFaces(value: boolean) {
        this._cullFaces = value;
        if (this.component) {
            this.component.cullFaces = value;
        }
    }

    /**
     * Gets the cull faces of the camera.
     * @returns The cull faces.
     */
    get cullFaces(): boolean {
        return this._cullFaces;
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
     * Sets the flip faces of the camera.
     * @param value - The flip faces.
     */
    set flipFaces(value: boolean) {
        this._flipFaces = value;
        if (this.component) {
            this.component.flipFaces = value;
        }
    }

    /**
     * Gets the flip faces of the camera.
     * @returns The flip faces.
     */
    get flipFaces(): boolean {
        return this._flipFaces;
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
     * Sets the frustum culling of the camera.
     * @param value - The frustum culling.
     */
    set frustumCulling(value: boolean) {
        this._frustumCulling = value;
        if (this.component) {
            this.component.frustumCulling = value;
        }
    }

    /**
     * Gets the frustum culling of the camera.
     * @returns The frustum culling.
     */
    get frustumCulling(): boolean {
        return this._frustumCulling;
    }

    /**
     * Sets the gamma correction of the camera.
     * @param value - The gamma correction.
     */
    set gamma(value: 'none' | 'srgb') {
        this._gamma = value;
        if (this.component) {
            this.component.gammaCorrection = value === 'srgb' ? GAMMA_SRGB : GAMMA_NONE;
        }
    }

    /**
     * Gets the gamma correction of the camera.
     * @returns The gamma correction.
     */
    get gamma(): 'none' | 'srgb' {
        return this._gamma;
    }

    /**
     * Sets whether the camera's field of view (fov) is horizontal or vertical. Defaults to false
     * (meaning it is vertical be default).
     * @param value - Whether the camera's field of view is horizontal.
     */
    set horizontalFov(value: boolean) {
        this._horizontalFov = value;
        if (this.component) {
            this.component.horizontalFov = value;
        }
    }

    /**
     * Gets whether the camera's field of view (fov) is horizontal or vertical.
     * @returns Whether the camera's field of view is horizontal.
     */
    get horizontalFov(): boolean {
        return this._horizontalFov;
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

    /**
     * Sets the priority of the camera.
     * @param value - The priority.
     */
    set priority(value: number) {
        this._priority = value;
        if (this.component) {
            this.component.priority = value;
        }
    }

    /**
     * Gets the priority of the camera.
     * @returns The priority.
     */
    get priority(): number {
        return this._priority;
    }

    /**
     * Sets the rect of the camera.
     * @param value - The rect.
     */
    set rect(value: Vec4) {
        this._rect = value;
        if (this.component) {
            this.component.rect = value;
        }
    }

    /**
     * Gets the rect of the camera.
     * @returns The rect.
     */
    get rect(): Vec4 {
        return this._rect;
    }

    /**
     * Sets the scissor rect of the camera.
     * @param value - The scissor rect.
     */
    set scissorRect(value: Vec4) {
        this._scissorRect = value;
        if (this.component) {
            this.component.scissorRect = value;
        }
    }

    /**
     * Gets the scissor rect of the camera.
     * @returns The scissor rect.
     */
    get scissorRect(): Vec4 {
        return this._scissorRect;
    }

    /**
     * Sets the tone mapping of the camera.
     * @param value - The tone mapping.
     */
    set tonemap(value: 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral') {
        this._tonemap = value;
        if (this.component) {
            this.component.toneMapping = tonemaps.get(value) ?? TONEMAP_NONE;
        }
    }

    /**
     * Gets the tone mapping of the camera.
     * @returns The tone mapping.
     */
    get tonemap(): 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral' {
        return this._tonemap;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'clear-color',
            'clear-color-buffer',
            'clear-depth-buffer',
            'clear-stencil-buffer',
            'cull-faces',
            'far-clip',
            'flip-faces',
            'fov',
            'frustum-culling',
            'gamma',
            'horizontal-fov',
            'near-clip',
            'orthographic',
            'ortho-height',
            'priority',
            'rect',
            'scissor-rect',
            'tonemap'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'clear-color':
                this.clearColor = parseColor(newValue);
                break;
            case 'clear-color-buffer':
                this.clearColorBuffer = newValue !== 'false';
                break;
            case 'clear-depth-buffer':
                this.clearDepthBuffer = newValue !== 'false';
                break;
            case 'clear-stencil-buffer':
                this.clearStencilBuffer = newValue !== 'false';
                break;
            case 'cull-faces':
                this.cullFaces = newValue !== 'false';
                break;
            case 'far-clip':
                this.farClip = parseFloat(newValue);
                break;
            case 'flip-faces':
                this.flipFaces = newValue !== 'true';
                break;
            case 'fov':
                this.fov = parseFloat(newValue);
                break;
            case 'frustum-culling':
                this.frustumCulling = newValue !== 'false';
                break;
            case 'gamma':
                this.gamma = newValue as 'none' | 'srgb';
                break;
            case 'horizontal-fov':
                this.horizontalFov = this.hasAttribute('horizontal-fov');
                break;
            case 'near-clip':
                this.nearClip = parseFloat(newValue);
                break;
            case 'orthographic':
                this.orthographic = this.hasAttribute('orthographic');
                break;
            case 'ortho-height':
                this.orthoHeight = parseFloat(newValue);
                break;
            case 'priority':
                this.priority = parseFloat(newValue);
                break;
            case 'rect':
                this.rect = parseVec4(newValue);
                break;
            case 'scissor-rect':
                this.scissorRect = parseVec4(newValue);
                break;
            case 'tonemap':
                this.tonemap = newValue as 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral';
                break;
        }
    }
}

customElements.define('pc-camera', CameraComponentElement);

export { CameraComponentElement };
