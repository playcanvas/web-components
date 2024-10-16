import { RenderComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a render component in the PlayCanvas engine.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement {
    private _type = 'asset';

    private _castShadows = false;

    private _receiveShadows = false;

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

    set type(value: string) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type() {
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
    get castShadows() {
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
    get receiveShadows() {
        return this._receiveShadows;
    }

    static get observedAttributes() {
        return ['type', 'cast-shadows', 'receive-shadows'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'type':
                this.type = newValue;
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== null;  // Existence implies true
                break;
            case 'receive-shadows':
                this.receiveShadows = newValue !== null;  // Existence implies true
                break;
        }
    }
}

customElements.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
