import type { BoundingBox, LightComponent } from 'playcanvas';
import {
    Color,
    LIGHTSHAPE_DISK,
    LIGHTSHAPE_PUNCTUAL,
    LIGHTSHAPE_RECT,
    LIGHTSHAPE_SPHERE,
    SHADOW_PCF1_16F,
    SHADOW_PCF1_32F,
    SHADOW_PCF3_16F,
    SHADOW_PCF3_32F,
    SHADOW_PCF5_16F,
    SHADOW_PCF5_32F,
    SHADOW_PCSS_32F,
    SHADOW_VSM_16F,
    SHADOW_VSM_32F
} from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

import { ComponentElement } from './component';

const shadowTypes = new Map<
    'pcf1-16f' | 'pcf1-32f' | 'pcf3-16f' | 'pcf3-32f' | 'pcf5-16f' | 'pcf5-32f' | 'vsm-16f' | 'vsm-32f' | 'pcss-32f',
    number
>([
    ['pcf1-16f', SHADOW_PCF1_16F],
    ['pcf1-32f', SHADOW_PCF1_32F],
    ['pcf3-16f', SHADOW_PCF3_16F],
    ['pcf3-32f', SHADOW_PCF3_32F],
    ['pcf5-16f', SHADOW_PCF5_16F],
    ['pcf5-32f', SHADOW_PCF5_32F],
    ['vsm-16f', SHADOW_VSM_16F],
    ['vsm-32f', SHADOW_VSM_32F],
    ['pcss-32f', SHADOW_PCSS_32F]
]);

/**
 * The light source shapes supported by the `<pc-light>` element: a `punctual` point, or an area
 * light shaped as a `rect`, `disk` or `sphere`.
 *
 * @category Types
 */
export type LightShape = 'punctual' | 'rect' | 'disk' | 'sphere';

const lightShapes = new Map<LightShape, number>([
    ['punctual', LIGHTSHAPE_PUNCTUAL],
    ['rect', LIGHTSHAPE_RECT],
    ['disk', LIGHTSHAPE_DISK],
    ['sphere', LIGHTSHAPE_SPHERE]
]);

/**
 * The LightComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-light/ | `<pc-light>`} elements.
 * The LightComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link LightComponent} (`light`).
 *
 * @elementSummary The `<pc-light>` element lights the scene from its entity — as a directional,
 * omni or spot light, from a point or from a rectangle, disk or sphere — with attributes for color,
 * intensity, range and shadows. Must be a child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class LightComponentElement extends ComponentElement<LightComponent> {
    /**
     * The cascade blend factor of the light, from 0 (no blending) to 1, which applies only to
     * `directional` lights with `num-cascades` greater than 1. It is the fraction of each shadow
     * cascade that is blended into the next one. Defaults to 0.
     */
    declare cascadeBlend: number;

    /**
     * The cascade distribution of the light, from 0 (linear split) to 1 (logarithmic split,
     * concentrating shadow resolution near the camera), which applies only to `directional` lights
     * with `num-cascades` greater than 1. It is how the camera frustum is split between shadow
     * cascades. Defaults to 0.5.
     */
    declare cascadeDistribution: number;

    /**
     * The cast shadows flag of the light.
     */
    declare castShadows: boolean;

    /**
     * The color of the light.
     */
    declare color: Color;

    /**
     * The inner cone angle of the light.
     */
    declare innerConeAngle: number;

    /**
     * The intensity of the light.
     */
    declare intensity: number;

    /**
     * The normal offset bias of the light.
     */
    declare normalOffsetBias: number;

    /**
     * The number of shadow cascades of the light, an integer from 1 (no cascades) to 4, which
     * applies only to `directional` lights. Defaults to 1.
     */
    declare numCascades: number;

    /**
     * The outer cone angle of the light.
     */
    declare outerConeAngle: number;

    /**
     * The penumbra falloff of the light. Used for PCSS shadows.
     */
    declare penumbraFalloff: number;

    /**
     * The penumbra size of the light. Used for PCSS shadows.
     */
    declare penumbraSize: number;

    /**
     * The range of the light.
     */
    declare range: number;

    /**
     * The shadow bias of the light.
     */
    declare shadowBias: number;

    /**
     * The number of shadow blocker samples. Used for PCSS shadows.
     */
    declare shadowBlockerSamples: number;

    /**
     * The world space box that the shadow of a `directional` light is fitted to. It takes the
     * place of cascades fitted to each camera: the whole shadow map then covers the box as seen
     * from the light, which concentrates its resolution on part of a large scene. The box only
     * needs to enclose the shadow casters: receivers further along the light, such as the ground
     * below them, are still shadowed. While it is set, `num-cascades`, `shadow-distance`,
     * `cascade-blend` and `cascade-distribution` are not used. Defaults to `null`, which fits the
     * shadow to each camera as usual.
     */
    declare shadowBounds: BoundingBox | null;

    /**
     * The shadow distance of the light.
     */
    declare shadowDistance: number;

    /**
     * The shadow intensity of the light.
     */
    declare shadowIntensity: number;

    /**
     * The shadow resolution of the light.
     */
    declare shadowResolution: number;

    /**
     * The number of shadow samples. Used for PCSS shadows.
     */
    declare shadowSamples: number;

    /**
     * The shadow type of the light. Can be:
     *
     * - `pcf1-16f` - 1-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf1-32f` - 1-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `pcf3-16f` - 3-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf3-32f` - 3-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `pcf5-16f` - 5-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf5-32f` - 5-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `vsm-16f` - Variance shadow map with 16-bit depth.
     * - `vsm-32f` - Variance shadow map with 32-bit depth.
     * - `pcss-32f` - Percentage-closer soft shadow with 32-bit depth.
     */
    declare shadowType:
        | 'pcf1-16f'
        | 'pcf1-32f'
        | 'pcf3-16f'
        | 'pcf3-32f'
        | 'pcf5-16f'
        | 'pcf5-32f'
        | 'vsm-16f'
        | 'vsm-32f'
        | 'pcss-32f';

    /**
     * The shape of the light source: `punctual`, or an area light shaped as a `rect`, `disk` or
     * `sphere` that takes its size from the entity's scale and needs the lookup tables loaded by
     * `area-light-luts` on `<pc-app>`. Defaults to `punctual`. Can be:
     *
     * - `punctual` - An infinitesimally small point.
     * - `rect` - A rectangle in the entity's local XZ plane, 1 by 1 at unit scale.
     * - `disk` - A disk in the entity's local XZ plane, 1 across at unit scale.
     * - `sphere` - A sphere, 1 across at unit scale.
     *
     * Area shapes fall off with their size and distance, so `range` is only a cutoff for them.
     */
    declare shape: LightShape;

    /**
     * The type of the light. Can be `directional`, `omni` or `spot`. Defaults to `directional`.
     */
    declare type: 'directional' | 'omni' | 'spot';

    /**
     * How strongly the light scatters into volumetric fog, which applies only to `omni` and `spot`
     * lights while a camera frame renders volumetric fog with local lights. It is a multiplier on
     * the light's contribution: 0 leaves the light out of the fog. Defaults to 1.
     */
    declare volumetricScattering: number;

    /**
     * The VSM bias of the light.
     */
    declare vsmBias: number;

    /**
     * The VSM blur size of the light. Minimum is 1, maximum is 25. Default is 11.
     */
    declare vsmBlurSize: number;

    /** @ignore */
    constructor() {
        super('light');
    }

    /**
     * Gets the underlying PlayCanvas light component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The light component, or `null`.
     */
    get component(): LightComponent | null {
        return super.component;
    }
}

// Each attribute's parser and default and, for the two enums that are maps, the engine constant
// behind each name. The engine reads a null `shadowBounds` as "no bounds": cascades fitted to each
// camera.
defineAttributes(
    LightComponentElement,
    {
        cascadeBlend: attr.number(0),
        cascadeDistribution: attr.number(0.5),
        castShadows: attr.bool(false),
        color: attr.color(Color.WHITE),
        innerConeAngle: attr.number(40),
        intensity: attr.number(1),
        normalOffsetBias: attr.number(0),
        numCascades: attr.number(1),
        outerConeAngle: attr.number(45),
        penumbraFalloff: attr.number(1),
        penumbraSize: attr.number(1),
        range: attr.number(10),
        shadowBias: attr.number(0.05),
        shadowBlockerSamples: attr.number(16),
        shadowBounds: attr.boundingBox(null),
        shadowDistance: attr.number(40),
        shadowIntensity: attr.number(1),
        shadowResolution: attr.number(1024),
        shadowSamples: attr.number(16),
        shadowType: attr.oneOf(shadowTypes, 'pcf3-32f'),
        shape: attr.oneOf(lightShapes, 'punctual'),
        type: attr.oneOf(['directional', 'omni', 'spot'], 'directional'),
        volumetricScattering: attr.number(1),
        vsmBias: attr.number(0.0025),
        vsmBlurSize: attr.number(11)
    },
    (element) => element.component
);

globalThis.customElements?.define('pc-light', LightComponentElement);

export { LightComponentElement };
