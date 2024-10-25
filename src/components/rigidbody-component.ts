import { RigidBodyComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a rigidbody component in the PlayCanvas engine.
 *
 * @category Components
 */
class RigidBodyComponentElement extends ComponentElement {
    /**
     * The friction of the rigidbody.
     */
    private _friction: number = 0.5;

    /**
     * The mass of the rigidbody.
     */
    private _mass: number = 1;

    /**
     * The restitution of the rigidbody.
     */
    private _restitution: number = 0;

    /**
     * The type of the rigidbody.
     */
    private _type: string = 'static';

    /**
     * Creates a new RigidBodyComponentElement.
     */
    constructor() {
        super('rigidbody');
    }

    getInitialComponentData() {
        return {
            friction: this._friction,
            mass: this._mass,
            restitution: this._restitution,
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

    set friction(value: number) {
        this._friction = value;
        if (this.component) {
            this.component.friction = value;
        }
    }

    get friction() {
        return this._friction;
    }

    set mass(value: number) {
        this._mass = value;
        if (this.component) {
            this.component.mass = value;
        }
    }

    get mass() {
        return this._mass;
    }

    set restitution(value: number) {
        this._restitution = value;
        if (this.component) {
            this.component.restitution = value;
        }
    }

    get restitution() {
        return this._restitution;
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
        return [...super.observedAttributes, 'friction', 'mass', 'restitution', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'friction':
                this.friction = parseFloat(newValue);
                break;
            case 'mass':
                this.mass = parseFloat(newValue);
                break;
            case 'restitution':
                this.restitution = parseFloat(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}   

customElements.define('pc-rigidbody', RigidBodyComponentElement);

export { RigidBodyComponentElement };
