import { RenderComponent, StandardMaterial } from 'playcanvas';

import { ComponentElement } from './component';
import { MaterialElement } from '../material';
import { parseBool, parseEnum } from '../parse';

/**
 * The RenderComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-render/ | `<pc-render>`} elements.
 * The RenderComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * This element renders one of the engine's built-in primitives, selected with `type` (defaulting
 * to `box`). It does not cover the engine's `asset` render type, since there is no way to supply
 * a render asset here — use `pc-model` for glTF content instead.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement {
    private _castShadows = true;

    private _material: string = '';

    private _receiveShadows = true;

    private _type: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' = 'box';

    /** @ignore */
    constructor() {
        super('render');
    }

    getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            material: MaterialElement.get(this._material),
            receiveShadows: this._receiveShadows
        };
    }

    /**
     * Gets the underlying PlayCanvas render component.
     * @returns The render component.
     */
    get component(): RenderComponent {
        return super.component as RenderComponent;
    }

    /**
     * Sets the type of the render component.
     * @param value - The type.
     */
    set type(value: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type(): 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' {
        return this._type;
    }

    /**
     * Sets the cast shadows flag of the render component.
     * @param value - The cast shadows flag.
     */
    set castShadows(value: boolean) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }

    /**
     * Gets the cast shadows flag of the render component.
     * @returns The cast shadows flag.
     */
    get castShadows(): boolean {
        return this._castShadows;
    }

    /**
     * Sets the material of the render component.
     * @param value - The id of the material asset to use.
     */
    set material(value: string) {
        this._material = value;
        if (this.component) {
            this.component.material = MaterialElement.get(value) as StandardMaterial;
        }
    }

    /**
     * Gets the id of the material asset used by the render component.
     * @returns The id of the material asset.
     */
    get material() {
        return this._material;
    }

    /**
     * Sets the receive shadows flag of the render component.
     * @param value - The receive shadows flag.
     */
    set receiveShadows(value: boolean) {
        this._receiveShadows = value;
        if (this.component) {
            this.component.receiveShadows = value;
        }
    }

    /**
     * Gets the receive shadows flag of the render component.
     * @returns The receive shadows flag.
     */
    get receiveShadows(): boolean {
        return this._receiveShadows;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'cast-shadows', 'material', 'receive-shadows', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'cast-shadows':
                this.castShadows = parseBool(newValue, true);
                break;
            case 'material':
                this.material = newValue;
                break;
            case 'receive-shadows':
                this.receiveShadows = parseBool(newValue, true);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['box', 'capsule', 'cone', 'cylinder', 'plane', 'sphere'], 'box', name);
                break;
        }
    }
}

customElements.define('pc-render', RenderComponentElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-render': RenderComponentElement;
    }
}

export { RenderComponentElement };
