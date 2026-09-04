import type { RigidBodyComponent } from 'playcanvas';
import { Vec3 } from 'playcanvas';

import { parseEnum, parseNumber, parseVec3 } from '../parse';

import { ComponentElement } from './component';

/**
 * The RigidBodyComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-rigid-body/ | `<pc-rigid-body>`} elements.
 * The RigidBodyComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link RigidBodyComponent} (`rigidbody`).
 *
 * @elementSummary The `<pc-rigid-body>` element hands its entity to the physics simulation, with
 * attributes for its type, mass, friction and restitution. It needs a sibling `<pc-collision>` for
 * its shape, and `Ammo` loaded through `<pc-wasm>`. Must be a child of a `<pc-entity>`,
 * `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class RigidBodyComponentElement extends ComponentElement<RigidBodyComponent> {
    /**
     * The angular damping of the rigidbody.
     */
    private _angularDamping = 0;

    /**
     * The angular factor of the rigidbody.
     */
    private _angularFactor: Vec3 = new Vec3(1, 1, 1);

    /**
     * The friction of the rigidbody.
     */
    private _friction = 0.5;

    /**
     * The linear damping of the rigidbody.
     */
    private _linearDamping = 0;

    /**
     * The linear factor of the rigidbody.
     */
    private _linearFactor: Vec3 = new Vec3(1, 1, 1);

    /**
     * The mass of the rigidbody.
     */
    private _mass = 1;

    /**
     * The restitution of the rigidbody.
     */
    private _restitution = 0;

    /**
     * The rolling friction of the rigidbody.
     */
    private _rollingFriction = 0;

    /**
     * The type of the rigidbody.
     */
    private _type: 'static' | 'dynamic' | 'kinematic' = 'static';

    /** @ignore */
    constructor() {
        super('rigidbody');
    }

    protected getInitialComponentData() {
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
     * Gets the underlying PlayCanvas rigidbody component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The rigidbody component, or `null`.
     */
    get component(): RigidBodyComponent | null {
        return super.component;
    }

    /**
     * Sets the rate at which the body loses angular velocity over time, from 0 (none) to 1.
     * Defaults to 0.
     * @param value - The angular damping.
     */
    set angularDamping(value: number) {
        this._angularDamping = value;
        if (this.component) {
            this.component.angularDamping = value;
        }
    }

    /**
     * Gets the rate at which the body loses angular velocity over time, from 0 (none) to 1.
     * @returns The angular damping.
     */
    get angularDamping() {
        return this._angularDamping;
    }

    /**
     * Sets the scaling applied to the body's rotation about each axis: 0 locks an axis and 1 leaves
     * it free. Applies to `dynamic` bodies only. Defaults to 1 in each axis.
     * @param value - The angular factor.
     */
    set angularFactor(value: Vec3) {
        this._angularFactor = value;
        if (this.component) {
            this.component.angularFactor = value;
        }
    }

    /**
     * Gets the scaling applied to the body's rotation about each axis: 0 locks an axis and 1 leaves
     * it free.
     * @returns The angular factor.
     */
    get angularFactor() {
        return this._angularFactor;
    }

    /**
     * Sets the friction applied where the body contacts another, from 0 (slides freely) to 1
     * (grips). Defaults to 0.5.
     * @param value - The friction.
     */
    set friction(value: number) {
        this._friction = value;
        if (this.component) {
            this.component.friction = value;
        }
    }

    /**
     * Gets the friction applied where the body contacts another, from 0 (slides freely) to 1
     * (grips).
     * @returns The friction.
     */
    get friction() {
        return this._friction;
    }

    /**
     * Sets the rate at which the body loses linear velocity over time, from 0 (none) to 1. Defaults
     * to 0.
     * @param value - The linear damping.
     */
    set linearDamping(value: number) {
        this._linearDamping = value;
        if (this.component) {
            this.component.linearDamping = value;
        }
    }

    /**
     * Gets the rate at which the body loses linear velocity over time, from 0 (none) to 1.
     * @returns The linear damping.
     */
    get linearDamping() {
        return this._linearDamping;
    }

    /**
     * Sets the scaling applied to the body's movement along each axis: 0 locks an axis and 1 leaves
     * it free. Applies to `dynamic` bodies only. Defaults to 1 in each axis.
     * @param value - The linear factor.
     */
    set linearFactor(value: Vec3) {
        this._linearFactor = value;
        if (this.component) {
            this.component.linearFactor = value;
        }
    }

    /**
     * Gets the scaling applied to the body's movement along each axis: 0 locks an axis and 1 leaves
     * it free.
     * @returns The linear factor.
     */
    get linearFactor() {
        return this._linearFactor;
    }

    /**
     * Sets the mass of the body. Applies to `dynamic` bodies only; `static` and `kinematic` bodies
     * behave as if infinitely massive. Defaults to 1.
     * @param value - The mass.
     */
    set mass(value: number) {
        this._mass = value;
        if (this.component) {
            this.component.mass = value;
        }
    }

    /**
     * Gets the mass of the body, which applies to `dynamic` bodies only.
     * @returns The mass.
     */
    get mass() {
        return this._mass;
    }

    /**
     * Sets the bounciness of the body, from 0 (all energy lost in a collision) to 1 (none lost).
     * The restitution of both colliding bodies is multiplied together, so two bodies at 1 bounce
     * fully and one at 0 stops any bounce. Defaults to 0.
     * @param value - The restitution.
     */
    set restitution(value: number) {
        this._restitution = value;
        if (this.component) {
            this.component.restitution = value;
        }
    }

    /**
     * Gets the bounciness of the body, from 0 (all energy lost in a collision) to 1 (none lost).
     * @returns The restitution.
     */
    get restitution() {
        return this._restitution;
    }

    /**
     * Sets the friction that resists the body rolling across a contact, where `friction` resists it
     * sliding. Defaults to 0.
     * @param value - The rolling friction.
     */
    set rollingFriction(value: number) {
        this._rollingFriction = value;
        if (this.component) {
            this.component.rollingFriction = value;
        }
    }

    /**
     * Gets the friction that resists the body rolling across a contact, where `friction` resists it
     * sliding.
     * @returns The rolling friction.
     */
    get rollingFriction() {
        return this._rollingFriction;
    }

    /**
     * Sets how the body takes part in the simulation. Can be `static` (never moves, and other
     * bodies collide with it), `dynamic` (moved by forces, gravity and collisions) or `kinematic`
     * (moved only by setting its transform, and pushes `dynamic` bodies aside). Defaults to
     * `static`.
     * @param value - The type.
     */
    set type(value: 'static' | 'dynamic' | 'kinematic') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets how the body takes part in the simulation: `static`, `dynamic` or `kinematic`.
     * @returns The type.
     */
    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'angular-damping',
            'angular-factor',
            'friction',
            'linear-damping',
            'linear-factor',
            'mass',
            'restitution',
            'rolling-friction',
            'type'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'angular-damping':
                this.angularDamping = parseNumber(newValue, 0, name);
                break;
            case 'angular-factor':
                this.angularFactor = parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'friction':
                this.friction = parseNumber(newValue, 0.5, name);
                break;
            case 'linear-damping':
                this.linearDamping = parseNumber(newValue, 0, name);
                break;
            case 'linear-factor':
                this.linearFactor = parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'mass':
                this.mass = parseNumber(newValue, 1, name);
                break;
            case 'restitution':
                this.restitution = parseNumber(newValue, 0, name);
                break;
            case 'rolling-friction':
                this.rollingFriction = parseNumber(newValue, 0, name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['static', 'dynamic', 'kinematic'], 'static', name);
                break;
        }
    }
}

customElements.define('pc-rigid-body', RigidBodyComponentElement);

export { RigidBodyComponentElement };
