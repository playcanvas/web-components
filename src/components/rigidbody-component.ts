import { RigidBodyComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a rigidbody component in the PlayCanvas engine.
 *
 * @category Components
 */
class RigidbodyComponentElement extends ComponentElement {
    private _type: string = 'static';

    /**
     * Creates a new RigidbodyComponentElement.
     */
    constructor() {
        super('rigidbody');
    }

    getInitialComponentData() {
        return {
            type: this._type
        };
    }

    /**
     * Gets the collision component.
     * @returns The collision component.
     */
    get component(): RigidBodyComponent | null {
        return super.component as RigidBodyComponent | null;
    }

    set type(value: string) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'type':
                this.type = newValue;
                break;
        }
    }
}   

customElements.define('pc-rigidbody', RigidbodyComponentElement);

export { RigidbodyComponentElement };
