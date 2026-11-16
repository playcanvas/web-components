import type { RigidBodyComponent } from 'playcanvas';
import { Vec3 } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

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
     * The rate at which the body loses angular velocity over time, from 0 (none) to 1. Defaults to
     * 0.
     */
    declare angularDamping: number;

    /**
     * The scaling applied to the body's rotation about each axis: 0 locks an axis and 1 leaves it
     * free. Applies to `dynamic` bodies only. Defaults to 1 in each axis.
     */
    declare angularFactor: Vec3;

    /**
     * The friction applied where the body contacts another, from 0 (slides freely) to 1 (grips).
     * Defaults to 0.5.
     */
    declare friction: number;

    /**
     * The multiplier applied to the scene's gravity for this body: 1 falls normally, 0 ignores
     * gravity and a negative value rises. Applies to `dynamic` bodies only. Defaults to 1.
     */
    declare gravityScale: number;

    /**
     * The rate at which the body loses linear velocity over time, from 0 (none) to 1. Defaults to
     * 0.
     */
    declare linearDamping: number;

    /**
     * The scaling applied to the body's movement along each axis: 0 locks an axis and 1 leaves it
     * free. Applies to `dynamic` bodies only. Defaults to 1 in each axis.
     */
    declare linearFactor: Vec3;

    /**
     * The mass of the body, which applies to `dynamic` bodies only. `static` and `kinematic` bodies
     * behave as if infinitely massive. Defaults to 1.
     */
    declare mass: number;

    /**
     * The bounciness of the body, from 0 (all energy lost in a collision) to 1 (none lost). The
     * restitution of both colliding bodies is multiplied together, so two bodies at 1 bounce fully
     * and one at 0 stops any bounce. Defaults to 0.
     */
    declare restitution: number;

    /**
     * The friction that resists the body rolling across a contact, where `friction` resists it
     * sliding. Defaults to 0.
     */
    declare rollingFriction: number;

    /**
     * How the body takes part in the simulation: `static`, `dynamic` or `kinematic`. A `static`
     * body never moves, and other bodies collide with it. A `dynamic` body is moved by forces,
     * gravity and collisions. A `kinematic` body is moved only by setting its transform, and pushes
     * `dynamic` bodies aside. Defaults to `static`.
     */
    declare type: 'static' | 'dynamic' | 'kinematic';

    /** @ignore */
    constructor() {
        super('rigidbody');
    }

    /**
     * Gets the underlying PlayCanvas rigidbody component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The rigidbody component, or `null`.
     */
    get component(): RigidBodyComponent | null {
        return super.component;
    }
}

defineAttributes(RigidBodyComponentElement, 'component', {
    angularDamping: attr.number(0),
    angularFactor: attr.vec3(Vec3.ONE),
    friction: attr.number(0.5),
    gravityScale: attr.number(1),
    linearDamping: attr.number(0),
    linearFactor: attr.vec3(Vec3.ONE),
    mass: attr.number(1),
    restitution: attr.number(0),
    rollingFriction: attr.number(0),
    type: attr.oneOf(['static', 'dynamic', 'kinematic'], 'static')
});

globalThis.customElements?.define('pc-rigid-body', RigidBodyComponentElement);

export { RigidBodyComponentElement };
