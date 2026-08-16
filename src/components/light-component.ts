import type { LightComponent } from 'playcanvas';
import {
    Color,
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

import { booleanProperty, colorProperty, defineProperties, enumProperty, numberProperty } from '../properties';

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

const lightProperties = defineProperties({
    castShadows: booleanProperty(false),
    color: colorProperty(() => new Color(1, 1, 1)),
    innerConeAngle: numberProperty(40),
    intensity: numberProperty(1),
    normalOffsetBias: numberProperty(0.05),
    outerConeAngle: numberProperty(45),
    penumbraFalloff: numberProperty(1),
    penumbraSize: numberProperty(1),
    range: numberProperty(10),
    shadowBias: numberProperty(0.2),
    shadowBlockerSamples: numberProperty(16),
    shadowDistance: numberProperty(16),
    shadowIntensity: numberProperty(1),
    shadowResolution: numberProperty(1024),
    shadowSamples: numberProperty(16),
    shadowType: enumProperty(shadowTypes, 'pcf3-32f'),
    type: enumProperty(['directional', 'omni', 'spot'], 'directional'),
    vsmBias: numberProperty(0.01),
    vsmBlurSize: numberProperty(11)
});

/**
 * The LightComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-light/ | `<pc-light>`} elements.
 * The LightComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class LightComponentElement extends ComponentElement {
    private _castShadows = lightProperties.castShadows.initial();

    private _color = lightProperties.color.initial();

    private _innerConeAngle = lightProperties.innerConeAngle.initial();

    private _intensity = lightProperties.intensity.initial();

    private _normalOffsetBias = lightProperties.normalOffsetBias.initial();

    private _outerConeAngle = lightProperties.outerConeAngle.initial();

    private _range = lightProperties.range.initial();

    private _shadowBias = lightProperties.shadowBias.initial();

    private _shadowDistance = lightProperties.shadowDistance.initial();

    private _shadowIntensity = lightProperties.shadowIntensity.initial();

    private _shadowResolution = lightProperties.shadowResolution.initial();

    private _shadowType = lightProperties.shadowType.initial();

    private _type = lightProperties.type.initial();

    private _vsmBias = lightProperties.vsmBias.initial();

    private _vsmBlurSize = lightProperties.vsmBlurSize.initial();

    private _penumbraSize = lightProperties.penumbraSize.initial();

    private _penumbraFalloff = lightProperties.penumbraFalloff.initial();

    private _shadowSamples = lightProperties.shadowSamples.initial();

    private _shadowBlockerSamples = lightProperties.shadowBlockerSamples.initial();

    /** @ignore */
    constructor() {
        super('light');
    }

    protected getInitialComponentData() {
        return {
            castShadows: this._castShadows,
            color: this._color,
            innerConeAngle: this._innerConeAngle,
            intensity: this._intensity,
            normalOffsetBias: this._normalOffsetBias,
            outerConeAngle: this._outerConeAngle,
            penumbraFalloff: this._penumbraFalloff,
            penumbraSize: this._penumbraSize,
            range: this._range,
            shadowBias: this._shadowBias,
            shadowBlockerSamples: this._shadowBlockerSamples,
            shadowDistance: this._shadowDistance,
            shadowIntensity: this._shadowIntensity,
            shadowResolution: this._shadowResolution,
            shadowSamples: this._shadowSamples,
            shadowType: shadowTypes.get(this._shadowType),
            type: this._type,
            vsmBias: this._vsmBias,
            vsmBlurSize: this._vsmBlurSize
        };
    }

    /**
     * Gets the underlying PlayCanvas light component.
     * @returns The light component.
     */
    get component(): LightComponent {
        return super.component as LightComponent;
    }

    /**
     * Sets the cast shadows flag of the light.
     * @param value - The cast shadows flag.
     */
    set castShadows(value: boolean) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }

    /**
     * Gets the cast shadows flag of the light.
     * @returns The cast shadows flag.
     */
    get castShadows() {
        return this._castShadows;
    }

    /**
     * Sets the color of the light.
     * @param value - The color.
     */
    set color(value: Color) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }

    /**
     * Gets the color of the light.
     * @returns The color.
     */
    get color() {
        return this._color;
    }

    /**
     * Sets the inner cone angle of the light.
     * @param value - The inner cone angle.
     */
    set innerConeAngle(value: number) {
        this._innerConeAngle = value;
        if (this.component) {
            this.component.innerConeAngle = value;
        }
    }

    /**
     * Gets the inner cone angle of the light.
     * @returns The inner cone angle.
     */
    get innerConeAngle() {
        return this._innerConeAngle;
    }

    /**
     * Sets the intensity of the light.
     * @param value - The intensity.
     */
    set intensity(value: number) {
        this._intensity = value;
        if (this.component) {
            this.component.intensity = value;
        }
    }

    /**
     * Gets the intensity of the light.
     * @returns The intensity.
     */
    get intensity() {
        return this._intensity;
    }

    /**
     * Sets the normal offset bias of the light.
     * @param value - The normal offset bias.
     */
    set normalOffsetBias(value: number) {
        this._normalOffsetBias = value;
        if (this.component) {
            this.component.normalOffsetBias = value;
        }
    }

    /**
     * Gets the normal offset bias of the light.
     * @returns The normal offset bias.
     */
    get normalOffsetBias() {
        return this._normalOffsetBias;
    }

    /**
     * Sets the outer cone angle of the light.
     * @param value - The outer cone angle.
     */
    set outerConeAngle(value: number) {
        this._outerConeAngle = value;
        if (this.component) {
            this.component.outerConeAngle = value;
        }
    }

    /**
     * Gets the outer cone angle of the light.
     * @returns The outer cone angle.
     */
    get outerConeAngle() {
        return this._outerConeAngle;
    }

    /**
     * Sets the range of the light.
     * @param value - The range.
     */
    set range(value: number) {
        this._range = value;
        if (this.component) {
            this.component.range = value;
        }
    }

    /**
     * Gets the range of the light.
     * @returns The range.
     */
    get range() {
        return this._range;
    }

    /**
     * Sets the shadow bias of the light.
     * @param value - The shadow bias.
     */
    set shadowBias(value: number) {
        this._shadowBias = value;
        if (this.component) {
            this.component.shadowBias = value;
        }
    }

    /**
     * Gets the shadow bias of the light.
     * @returns The shadow bias.
     */
    get shadowBias() {
        return this._shadowBias;
    }

    /**
     * Sets the shadow distance of the light.
     * @param value - The shadow distance.
     */
    set shadowDistance(value: number) {
        this._shadowDistance = value;
        if (this.component) {
            this.component.shadowDistance = value;
        }
    }

    /**
     * Gets the shadow distance of the light.
     * @returns The shadow distance.
     */
    get shadowDistance() {
        return this._shadowDistance;
    }

    /**
     * Sets the shadow intensity of the light.
     * @param value - The shadow intensity.
     */
    set shadowIntensity(value: number) {
        this._shadowIntensity = value;
        if (this.component) {
            this.component.shadowIntensity = value;
        }
    }

    /**
     * Gets the shadow intensity of the light.
     * @returns The shadow intensity.
     */
    get shadowIntensity() {
        return this._shadowIntensity;
    }

    /**
     * Sets the shadow resolution of the light.
     * @param value - The shadow resolution.
     */
    set shadowResolution(value: number) {
        this._shadowResolution = value;
        if (this.component) {
            this.component.shadowResolution = value;
        }
    }

    /**
     * Gets the shadow resolution of the light.
     * @returns The shadow resolution.
     */
    get shadowResolution() {
        return this._shadowResolution;
    }

    /**
     * Sets the shadow type of the light.
     * @param value - The shadow type. Can be:
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
    set shadowType(
        value:
            | 'pcf1-16f'
            | 'pcf1-32f'
            | 'pcf3-16f'
            | 'pcf3-32f'
            | 'pcf5-16f'
            | 'pcf5-32f'
            | 'vsm-16f'
            | 'vsm-32f'
            | 'pcss-32f'
    ) {
        this._shadowType = value;
        if (this.component) {
            this.component.shadowType = shadowTypes.get(value) ?? SHADOW_PCF3_32F;
        }
    }

    /**
     * Gets the shadow type of the light.
     * @returns The shadow type.
     */
    get shadowType() {
        return this._shadowType;
    }

    /**
     * Sets the type of the light. Can be `directional`, `omni` or `spot`. Defaults to
     * `directional`.
     * @param value - The type.
     */
    set type(value: 'directional' | 'omni' | 'spot') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the light.
     * @returns The type.
     */
    get type() {
        return this._type;
    }

    /**
     * Sets the VSM bias of the light.
     * @param value - The VSM bias.
     */
    set vsmBias(value: number) {
        this._vsmBias = value;
        if (this.component) {
            this.component.vsmBias = value;
        }
    }

    /**
     * Gets the VSM bias of the light.
     * @returns The VSM bias.
     */
    get vsmBias() {
        return this._vsmBias;
    }

    /**
     * Sets the VSM blur size of the light. Minimum is 1, maximum is 25. Default is 11.
     * @param value - The VSM blur size.
     */
    set vsmBlurSize(value: number) {
        this._vsmBlurSize = value;
        if (this.component) {
            this.component.vsmBlurSize = value;
        }
    }

    /**
     * Gets the VSM blur size of the light.
     * @returns The VSM blur size.
     */
    get vsmBlurSize() {
        return this._vsmBlurSize;
    }

    /**
     * Sets the penumbra size of the light. Used for PCSS shadows.
     * @param value - The penumbra size.
     */
    set penumbraSize(value: number) {
        this._penumbraSize = value;
        if (this.component) {
            this.component.penumbraSize = value;
        }
    }

    /**
     * Gets the penumbra size of the light.
     * @returns The penumbra size.
     */
    get penumbraSize() {
        return this._penumbraSize;
    }

    /**
     * Sets the penumbra falloff of the light. Used for PCSS shadows.
     * @param value - The penumbra falloff.
     */
    set penumbraFalloff(value: number) {
        this._penumbraFalloff = value;
        if (this.component) {
            this.component.penumbraFalloff = value;
        }
    }

    /**
     * Gets the penumbra falloff of the light.
     * @returns The penumbra falloff.
     */
    get penumbraFalloff() {
        return this._penumbraFalloff;
    }

    /**
     * Sets the number of shadow samples. Used for PCSS shadows.
     * @param value - The number of shadow samples.
     */
    set shadowSamples(value: number) {
        this._shadowSamples = value;
        if (this.component) {
            this.component.shadowSamples = value;
        }
    }

    /**
     * Gets the number of shadow samples.
     * @returns The number of shadow samples.
     */
    get shadowSamples() {
        return this._shadowSamples;
    }

    /**
     * Sets the number of shadow blocker samples. Used for PCSS shadows.
     * @param value - The number of shadow blocker samples.
     */
    set shadowBlockerSamples(value: number) {
        this._shadowBlockerSamples = value;
        if (this.component) {
            this.component.shadowBlockerSamples = value;
        }
    }

    /**
     * Gets the number of shadow blocker samples.
     * @returns The number of shadow blocker samples.
     */
    get shadowBlockerSamples() {
        return this._shadowBlockerSamples;
    }

    /** @internal */
    static properties = lightProperties;
}

customElements.define('pc-light', LightComponentElement);

export { LightComponentElement };
