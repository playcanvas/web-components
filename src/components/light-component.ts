import { Color, LightComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { parseColor } from '../utils';

/**
 * Represents a light component in the PlayCanvas engine.
 *
 * @category Components
 */
class LightComponentElement extends ComponentElement {
    private _castShadows = false;

    private _color = new Color(1, 1, 1);

    private _innerConeAngle = 40;

    private _intensity = 1;

    private _outerConeAngle = 45;

    private _range = 10;

    private _type = 'directional';

    /**
     * Creates a new LightComponentElement.
     */
    constructor() {
        super('light');
    }

    getInitialComponentData() {
        return {
            castShadows: this._castShadows,
            color: this._color,
            innerConeAngle: this._innerConeAngle,
            intensity: this._intensity,
            outerConeAngle: this._outerConeAngle,
            range: this._range,
            type: this._type
        };
    }

    /**
     * Gets the light component.
     * @returns The light component.
     */
    get component(): LightComponent | null {
        return super.component as LightComponent | null;
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
     * Sets the type of the light.
     * @param value - The type.
     */
    set type(value: string) {
        if (!['directional', 'omni', 'spot'].includes(value)) {
            console.warn(`Invalid light type '${value}', using default type '${this._type}'.`);
            return;
        }

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

    static get observedAttributes() {
        return [...super.observedAttributes, 'color', 'cast-shadows', 'intensity', 'inner-cone-angle', 'outer-cone-angle', 'range', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'cast-shadows':
                this.castShadows = newValue === null || newValue === 'true';
                break;
            case 'inner-cone-angle':
                this.innerConeAngle = Number(newValue);
                break;
            case 'intensity':
                this.intensity = Number(newValue);
                break;
            case 'outer-cone-angle':
                this.outerConeAngle = Number(newValue);
                break;
            case 'range':
                this.range = Number(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}

customElements.define('pc-light', LightComponentElement);

export { LightComponentElement };
