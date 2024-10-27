import { RenderComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a render component in the PlayCanvas engine.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement {
    private _type: 'asset' | 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' = 'asset';

    private _castShadows = true;

    private _receiveShadows = true;

    constructor() {
        super('render');
    }

    getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            receiveShadows: this._receiveShadows
        };
    }

    /**
     * Gets the render component.
     * @returns The render component.
     */
    get component(): RenderComponent | null {
        return super.component as RenderComponent | null;
    }

    /**
     * Sets the type of the render component.
     * @param value - The type.
     */
    set type(value: 'asset' | 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type(): 'asset' | 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' {
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
        return [...super.observedAttributes, 'cast-shadows', 'receive-shadows', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'type':
                this.type = newValue as 'asset' | 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere';
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== 'false';
                break;
            case 'receive-shadows':
                this.receiveShadows = newValue !== 'false';
                break;
        }
    }
}

customElements.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
