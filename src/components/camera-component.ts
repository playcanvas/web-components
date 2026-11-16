import type { CameraComponent, Plane } from 'playcanvas';
import {
    Color,
    Vec2,
    Vec4,
    GAMMA_NONE,
    GAMMA_SRGB,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_LINEAR,
    TONEMAP_FILMIC,
    TONEMAP_NEUTRAL,
    TONEMAP_ACES2,
    TONEMAP_ACES,
    TONEMAP_HEJL,
    TONEMAP_NONE,
    TONEMAP_AGX,
    TONEMAP_AGX_PUNCHY,
    XRTYPE_AR,
    XRTYPE_VR
} from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

import { ComponentElement } from './component';

const projections = new Map<'perspective' | 'orthographic', number>([
    ['perspective', PROJECTION_PERSPECTIVE],
    ['orthographic', PROJECTION_ORTHOGRAPHIC]
]);

/**
 * The tone mapping curves supported by the `<pc-camera>` element.
 *
 * @category Types
 */
export type Tonemap = 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral' | 'agx' | 'agx-punchy';

const tonemaps = new Map<Tonemap, number>([
    ['none', TONEMAP_NONE],
    ['linear', TONEMAP_LINEAR],
    ['filmic', TONEMAP_FILMIC],
    ['hejl', TONEMAP_HEJL],
    ['aces', TONEMAP_ACES],
    ['aces2', TONEMAP_ACES2],
    ['neutral', TONEMAP_NEUTRAL],
    ['agx', TONEMAP_AGX],
    ['agx-punchy', TONEMAP_AGX_PUNCHY]
]);

/**
 * The CameraComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-camera/ | `<pc-camera>`} elements.
 * The CameraComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link CameraComponent} (`camera`).
 *
 * @elementSummary The `<pc-camera>` element renders the scene from its entity's transform, with
 * attributes for the projection, field of view, clip planes, clear color and tonemapping. Must be a
 * child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class CameraComponentElement extends ComponentElement<CameraComponent> {
    /**
     * The clear color of the camera.
     */
    declare clearColor: Color;

    /**
     * The clear color buffer of the camera.
     */
    declare clearColorBuffer: boolean;

    /**
     * The depth value the depth buffer is cleared to. Defaults to 1.
     */
    declare clearDepth: number;

    /**
     * The clear depth buffer of the camera.
     */
    declare clearDepthBuffer: boolean;

    /**
     * The clear stencil buffer of the camera.
     */
    declare clearStencilBuffer: boolean;

    /**
     * Whether the clipping planes of the camera clip only what is behind all of them, in place of
     * what is behind any of them. Two planes then cut out a wedge, and three a corner. Defaults to
     * false.
     */
    declare clipIntersection: boolean;

    /**
     * The planes, in world space, that clip everything the camera renders. They clip as a section
     * view does: what is behind a plane, on the side its normal points away from, is not rendered.
     * The planes do not clip shadows or screen space elements. Up to 8 planes are used. The planes
     * are copied, so assign the array again to apply a change to one. Defaults to no planes.
     */
    declare clippingPlanes: Plane[];

    /**
     * The cull faces of the camera.
     */
    declare cullFaces: boolean;

    /**
     * The far clip distance of the camera.
     */
    declare farClip: number;

    /**
     * The flip faces of the camera.
     */
    declare flipFaces: boolean;

    /**
     * The field of view of the camera.
     */
    declare fov: number;

    /**
     * The frustum culling of the camera.
     */
    declare frustumCulling: boolean;

    /**
     * The gamma correction of the camera.
     */
    declare gamma: 'linear' | 'srgb';

    /**
     * Whether the camera's field of view (fov) is horizontal or vertical. Defaults to false, which
     * is vertical.
     */
    declare horizontalFov: boolean;

    /**
     * The near clip distance of the camera.
     */
    declare nearClip: number;

    /**
     * The orthographic height of the camera.
     */
    declare orthoHeight: number;

    /**
     * The priority of the camera.
     */
    declare priority: number;

    /**
     * The projection of the camera. Can be `perspective` or `orthographic`. Use `orthoHeight` to
     * size an orthographic projection.
     */
    declare projection: 'perspective' | 'orthographic';

    /**
     * The offset of the projection window from the view direction. It gives an off-center (shift
     * lens) projection, in half-frustum units: `0 1` moves the window up by half the frustum
     * height. Keeping the camera level and shifting the window frames a tall subject with its
     * verticals parallel. Applies to both projections and is ignored in XR. Defaults to `0 0`.
     */
    declare projectionOffset: Vec2;

    /**
     * The rect of the camera.
     */
    declare rect: Vec4;

    /**
     * Whether the camera renders a copy of the scene's color for its materials to sample, which
     * refractive materials - such as glTF materials with transmission - need to show what is
     * behind them. The copy is made every frame, so leave it off unless a material uses it. A
     * camera rendered through the `cameraFrame` script takes this from that script's
     * `rendering.sceneColorMap` instead. Defaults to `false`.
     */
    declare sceneColorMap: boolean;

    /**
     * The scissor rect of the camera.
     */
    declare scissorRect: Vec4;

    /**
     * The tone mapping of the camera. Can be `none`, `linear`, `filmic`, `hejl`, `aces`, `aces2`,
     * `neutral`, `agx` or `agx-punchy`. Defaults to `linear`, which applies the scene exposure and
     * nothing else; `none` skips the exposure too. `agx` gives a neutral, flat look that suits
     * color grading, and `agx-punchy` raises its contrast and saturation.
     */
    declare tonemap: Tonemap;

    /** @ignore */
    constructor() {
        super('camera');
    }

    /**
     * Whether immersive AR is available. Independent of {@link vrAvailable}: a device can offer
     * either mode without the other.
     * @returns Whether immersive AR is available.
     */
    get arAvailable(): boolean {
        return this._available(XRTYPE_AR);
    }

    /**
     * Whether immersive VR is available. Independent of {@link arAvailable}: a device can offer
     * either mode without the other.
     * @returns Whether immersive VR is available.
     */
    get vrAvailable(): boolean {
        return this._available(XRTYPE_VR);
    }

    /**
     * Whether one XR session type is available on this device.
     *
     * @param type - The XR session type to test.
     * @returns Whether that type is available.
     */
    private _available(type: string): boolean {
        const xrManager = this.component?.system.app.xr;
        return Boolean(xrManager?.supported && xrManager.isAvailable(type));
    }

    /**
     * Starts the camera in XR mode.
     * @param type - The type of XR mode to start.
     * @param space - The space to start the camera in.
     */
    startXr(
        type: 'immersive-ar' | 'immersive-vr',
        space: 'bounded-floor' | 'local' | 'local-floor' | 'unbounded' | 'viewer'
    ) {
        // Gated on the mode being started, not on XR in general: a device that offers only
        // one of the two would otherwise accept a session it cannot serve
        if (this.component && this._available(type)) {
            this.component.startXr(type, space, {
                callback: (err: any) => {
                    if (err) console.error(`WebXR ${type} failed to start: ${err.message}`);
                }
            });
        }
    }

    /**
     * Ends the camera's XR mode.
     */
    endXr() {
        if (this.component) {
            this.component.endXr();
        }
    }

    /**
     * Gets the underlying PlayCanvas camera component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The camera component, or `null`.
     */
    get component(): CameraComponent | null {
        return super.component;
    }
}

// Each attribute's parser and default. Three go to the engine under its own name for them, and
// gamma is anything but `srgb` to the engine: no correction.
defineAttributes(
    CameraComponentElement,
    {
        clearColor: attr.color(new Color(0.75, 0.75, 0.75, 1)),
        clearColorBuffer: attr.bool(true),
        clearDepth: attr.number(1),
        clearDepthBuffer: attr.bool(true),
        clearStencilBuffer: attr.bool(true),
        clipIntersection: attr.bool(false),
        clippingPlanes: attr.planes(),
        cullFaces: attr.bool(true),
        farClip: attr.number(1000),
        flipFaces: attr.bool(false),
        fov: attr.number(45),
        frustumCulling: attr.bool(true),
        gamma: attr
            .oneOf(['linear', 'srgb'], 'srgb')
            .to((value) => (value === 'srgb' ? GAMMA_SRGB : GAMMA_NONE))
            .as('gammaCorrection'),
        horizontalFov: attr.bool(false),
        nearClip: attr.number(0.1),
        orthoHeight: attr.number(10),
        priority: attr.number(0),
        projection: attr.oneOf(projections, 'perspective'),
        projectionOffset: attr.vec2(new Vec2(0, 0)),
        rect: attr.vec4(new Vec4(0, 0, 1, 1)),
        sceneColorMap: attr.bool(false).as('renderSceneColorMap'),
        scissorRect: attr.vec4(new Vec4(0, 0, 1, 1)),
        tonemap: attr.oneOf(tonemaps, 'linear').as('toneMapping')
    },
    (element) => element.component
);

globalThis.customElements?.define('pc-camera', CameraComponentElement);

export { CameraComponentElement };
