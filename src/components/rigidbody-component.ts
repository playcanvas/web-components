import { RigidBodyComponent, Vec3 } from 'playcanvas';

import { ComponentElement } from './component';
import { parseVec3 } from '../utils';

/**
 * The RigidBodyComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-rigidbody/ | `<pc-rigidbody>`} elements.
 * The RigidBodyComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class RigidBodyComponentElement extends ComponentElement {
    /**
     * The angular damping of the rigidbody.
     */
    private _angularDamping: number = 0;

    /**
     * The angular factor of the rigidbody.
     */
    private _angularFactor: Vec3 = new Vec3(1, 1, 1);

    /**
     * The friction of the rigidbody.
     */
    private _friction: number = 0.5;

    /**
     * The linear damping of the rigidbody.
     */
    private _linearDamping: number = 0;

    /**
     * The linear factor of the rigidbody.
     */
    private _linearFactor: Vec3 = new Vec3(1, 1, 1);

    /**
     * The mass of the rigidbody.
     */
    private _mass: number = 1;

    /**
     * The restitution of the rigidbody.
     */
    private _restitution: number = 0;

    /**
     * The rolling friction of the rigidbody.
     */
    private _rollingFriction: number = 0;

    /**
     * The type of the rigidbody.
     */
    private _type: string = 'static';

    /** @ignore */
    constructor() {
        super('rigidbody');
    }

    getInitialComponentData() {
        return {
            angularDamping: this._angularDamping,
            angularFactor: this._angularFactor,
            friction: this._friction,
            linearDamping: this._linearDamping,
            linearFactor: this._linearFactor,
            mass: this._mass,
            restitution: this._restitution,
            rollingFriction: this._rollingFriction,
            type: this._type
        };
    }

    /**
     * Gets the underlying PlayCanvas rigidbody component.
     * @returns The rigidbody component.
     */
    get component(): RigidBodyComponent | null {
        return super.component as RigidBodyComponent | null;
    }

    set angularDamping(value: number) {
        this._angularDamping = value;
        if (this.component) {
            this.component.angularDamping = value;
        }
    }

    get angularDamping() {
        return this._angularDamping;
    }

    set angularFactor(value: Vec3) {
        this._angularFactor = value;
        if (this.component) {
            this.component.angularFactor = value;
        }
    }

    get angularFactor() {
        return this._angularFactor;
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

    set linearDamping(value: number) {
        this._linearDamping = value;
        if (this.component) {
            this.component.linearDamping = value;
        }
    }

    get linearDamping() {
        return this._linearDamping;
    }

    set linearFactor(value: Vec3) {
        this._linearFactor = value;
        if (this.component) {
            this.component.linearFactor = value;
        }
    }

    get linearFactor() {
        return this._linearFactor;
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

    set rollingFriction(value: number) {
        this._rollingFriction = value;
        if (this.component) {
            this.component.rollingFriction = value;
        }
    }

    get rollingFriction() {
        return this._rollingFriction;
    }

    set type(value: string) {
        this._type = value;
        if (this.component) {
            this.component.type = value as 'static' | 'dynamic' | 'kinematic';
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'angular-damping', 'angular-factor', 'friction', 'linear-damping', 'linear-factor', 'mass', 'restitution', 'rolling-friction', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'angular-damping':
                this.angularDamping = parseFloat(newValue);
                break;
            case 'angular-factor':
                this.angularFactor = parseVec3(newValue);
                break;
            case 'friction':
                this.friction = parseFloat(newValue);
                break;
            case 'linear-damping':
                this.linearDamping = parseFloat(newValue);
                break;
            case 'linear-factor':
                this.linearFactor = parseVec3(newValue);
                break;
            case 'mass':
                this.mass = parseFloat(newValue);
                break;
            case 'restitution':
                this.restitution = parseFloat(newValue);
                break;
            case 'rolling-friction':
                this.rollingFriction = parseFloat(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}

customElements.define('pc-rigidbody', RigidBodyComponentElement);

export { RigidBodyComponentElement };
