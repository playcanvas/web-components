import { Color, LightComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { parseColor } from '../utils';

class LightComponentElement extends ComponentElement {
    _castShadows = false;

    _color = new Color(1, 1, 1);

    _innerConeAngle = 40;

    _intensity = 1;

    _outerConeAngle = 45;

    _range = 10;

    _type = 'directional';

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

    get component(): LightComponent | null {
        return super.component as LightComponent | null;
    }

    set castShadows(value: boolean) {
        this._castShadows = value;
        this.component!.castShadows = value;
    }

    get castShadows() {
        return this._castShadows;
    }

    set color(value: Color) {
        this._color = value;
        this.component!.color = value;
    }

    get color() {
        return this._color;
    }

    set innerConeAngle(value: number) {
        this._innerConeAngle = value;
        this.component!.innerConeAngle = value;
    }

    get innerConeAngle() {
        return this._innerConeAngle;
    }

    set intensity(value: number) {
        this._intensity = value;
        this.component!.intensity = value;
    }

    get intensity() {
        return this._intensity;
    }

    set outerConeAngle(value: number) {
        this._outerConeAngle = value;
        this.component!.outerConeAngle = value;
    }

    get outerConeAngle() {
        return this._outerConeAngle;
    }

    set range(value: number) {
        this._range = value;
        this.component!.range = value;
    }

    get range() {
        return this._range;
    }

    set type(value: string) {
        if (!['directional', 'omni', 'spot'].includes(value)) {
            console.warn(`Invalid light type '${value}', using default type '${this._type}'.`);
            return;
        }

        this._type = value;
        this.component!.type = value;
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return ['color', 'cast-shadows', 'intensity', 'inner-cone-angle', 'outer-cone-angle', 'range', 'type'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return;
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
