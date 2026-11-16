import type { JointComponent } from 'playcanvas';
import { Vec2, Vec3 } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';
import { resolveEntity } from '../entity-reference';

import { ComponentElement } from './component';

/**
 * The constraint types supported by the `<pc-joint>` element.
 *
 * @category Types
 */
export type JointType = 'fixed' | 'ball' | 'hinge' | 'slider' | '6dof';

/**
 * The motion modes for a single joint axis: fully constrained (`locked`), constrained within
 * limits (`limited`) or unconstrained (`free`).
 *
 * @category Types
 */
export type MotionMode = 'locked' | 'limited' | 'free';

const motionModes: MotionMode[] = ['locked', 'limited', 'free'];

/**
 * The JointComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-joint/ | `<pc-joint>`} elements.
 * The JointComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The entity holding the joint is not itself constrained. Its world transform defines the joint
 * frame — the anchor point and axes the constraint operates about — with the local X axis as the
 * primary axis: a hinge rotates about it, a slider translates along it and a ball joint twists
 * about it. The constrained bodies are referenced by `entity-a` and `entity-b`, both of which need
 * a rigid body component; leaving `entity-b` empty constrains `entity-a` to a fixed point in world
 * space. A reference can name any entity-fronting element — `<pc-entity>`, `<pc-model>` or
 * `<pc-node>`, so a ragdoll can join a model's own skeleton nodes by name — and a name resolves
 * against the nearest enclosing entity first, then outward through the entity hierarchy, then the
 * document, while a `#` selector resolves document-wide. A `<template>` prefab with one
 * entity-fronting root can therefore wire its joints by name and stay self-contained when cloned.
 * The underlying engine component is in alpha, so its API may change.
 *
 * @elementSummary The `<pc-joint>` element constrains two rigid bodies to each other — a hinged
 * door, a swinging chain, a sliding drawer. Its entity's transform is the joint frame, and
 * `entity-a` and `entity-b` name the bodies. Must be a child of a `<pc-entity>`, `<pc-model>` or
 * `<pc-node>`.
 *
 * @fires {CustomEvent} break - Fired when the impulse on the joint exceeds `break-impulse` and the
 * constraint breaks. A broken joint no longer constrains its bodies; calling `refreshFrames()` on
 * the underlying component re-attaches it. Bubbles and is composed.
 *
 * Engine component: {@link JointComponent} (`joint`).
 *
 * @category Components
 */
class JointComponentElement extends ComponentElement<JointComponent> {
    /**
     * The spring damping of the joint per angular axis. Applies to a 6dof joint, on axes with a
     * non-zero angular-stiffness.
     */
    declare angularDamping: Vec3;

    /**
     * The rest angle of the joint's angular springs. Applies to a 6dof joint, in degrees per axis,
     * on axes with a non-zero angular-stiffness.
     */
    declare angularEquilibrium: Vec3;

    /**
     * The rotation limits of the joint about its X axis. Applies to a 6dof joint, as a lower and
     * an upper limit in degrees, when angular-motion-x is limited.
     */
    declare angularLimitsX: Vec2;

    /**
     * The rotation limits of the joint about its Y axis. Applies to a 6dof joint, as a lower and
     * an upper limit in degrees, when angular-motion-y is limited.
     */
    declare angularLimitsY: Vec2;

    /**
     * The rotation limits of the joint about its Z axis. Applies to a 6dof joint, as a lower and
     * an upper limit in degrees, when angular-motion-z is limited.
     */
    declare angularLimitsZ: Vec2;

    /**
     * How the joint constrains rotation about its X axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare angularMotionX: MotionMode;

    /**
     * How the joint constrains rotation about its Y axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare angularMotionY: MotionMode;

    /**
     * How the joint constrains rotation about its Z axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare angularMotionZ: MotionMode;

    /**
     * The spring stiffness of the joint per angular axis. Applies to a 6dof joint, where 0
     * disables the spring on that axis.
     */
    declare angularStiffness: Vec3;

    /**
     * The impulse above which the joint breaks. It is in newton seconds, and defaults to
     * `Infinity`, which makes the joint unbreakable.
     */
    declare breakImpulse: number;

    /**
     * Whether collision is enabled between the two constrained bodies.
     */
    declare enableCollision: boolean;

    /**
     * Whether the limits of the joint are enforced. Applies to a hinge, slider or ball joint.
     */
    declare enableLimits: boolean;

    /**
     * The reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the element providing the first constrained body. An exact name resolves
     * against the nearest enclosing entity first, then outward, then the document. The reference
     * resolves when it is set, so an entity created later is picked up by setting the attribute
     * again. A non-empty reference that does not resolve warns, naming which of the two causes it
     * hit.
     */
    declare entityA: string;

    /**
     * The reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the element providing the second constrained body, or empty for the
     * world-space case. Empty constrains the first body to a fixed point in world space. An exact
     * name resolves against the nearest enclosing entity first, then outward, then the document.
     * The reference resolves when it is set, so an entity created later is picked up by setting
     * the attribute again. A non-empty reference that does not resolve warns; an empty one is the
     * documented world-space case and stays silent.
     */
    declare entityB: string;

    /**
     * The rotation or travel limits of the joint. They are the lower and upper limit of a hinge
     * joint's rotation in degrees, or of a slider joint's travel in meters, applied when
     * enable-limits is set.
     */
    declare limits: Vec2;

    /**
     * The spring damping of the joint per linear axis. Applies to a 6dof joint, on axes with a
     * non-zero linear-stiffness.
     */
    declare linearDamping: Vec3;

    /**
     * The rest point of the joint's linear springs. Applies to a 6dof joint, in meters per axis,
     * on axes with a non-zero linear-stiffness.
     */
    declare linearEquilibrium: Vec3;

    /**
     * The translation limits of the joint along its X axis. Applies to a 6dof joint, as a lower
     * and an upper limit in meters, when linear-motion-x is limited.
     */
    declare linearLimitsX: Vec2;

    /**
     * The translation limits of the joint along its Y axis. Applies to a 6dof joint, as a lower
     * and an upper limit in meters, when linear-motion-y is limited.
     */
    declare linearLimitsY: Vec2;

    /**
     * The translation limits of the joint along its Z axis. Applies to a 6dof joint, as a lower
     * and an upper limit in meters, when linear-motion-z is limited.
     */
    declare linearLimitsZ: Vec2;

    /**
     * How the joint constrains translation along its X axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare linearMotionX: MotionMode;

    /**
     * How the joint constrains translation along its Y axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare linearMotionY: MotionMode;

    /**
     * How the joint constrains translation along its Z axis. Applies to a 6dof joint. Can be
     * `locked`, `limited` or `free`. Defaults to `locked`.
     */
    declare linearMotionZ: MotionMode;

    /**
     * The spring stiffness of the joint per linear axis. Applies to a 6dof joint, where 0 disables
     * the spring on that axis.
     */
    declare linearStiffness: Vec3;

    /**
     * The maximum torque or force of the joint's motor. It is a torque in newton meters for a
     * hinge joint and a force in newtons for a slider joint, where 0 disables the motor.
     */
    declare maxMotorForce: number;

    /**
     * The target speed of the joint's motor. It is in degrees per second for a hinge joint and
     * meters per second for a slider joint, and is active while max-motor-force is greater than 0.
     */
    declare motorSpeed: number;

    /**
     * The maximum swing of the joint's primary axis towards the joint frame's Y axis. Applies to a
     * ball joint, whose primary axis is X, so this is a rotation about Z. It is a half-angle in
     * degrees, applied when enable-limits is set.
     */
    declare swingLimitY: number;

    /**
     * The maximum swing of the joint's primary axis towards the joint frame's Z axis. Applies to a
     * ball joint, whose primary axis is X, so this is a rotation about Y. It is a half-angle in
     * degrees, applied when enable-limits is set.
     */
    declare swingLimitZ: number;

    /**
     * The maximum twist of the joint about its primary axis. Applies to a ball joint, in degrees,
     * when enable-limits is set.
     */
    declare twistLimit: number;

    /**
     * The type of the joint. Can be `fixed`, `ball`, `hinge`, `slider` or `6dof`. Defaults to
     * `fixed`.
     */
    declare type: JointType;

    /** @ignore */
    constructor() {
        super('joint');
    }

    private _onBreak() {
        this.dispatchEvent(new CustomEvent('break', { bubbles: true, composed: true }));
    }

    protected initComponent() {
        const component = this.component;
        if (!component) {
            return;
        }

        // A host readiness cycle can re-run this against the same surviving component instance,
        // so the off/on pair keeps the subscription single either way. Component removal destroys
        // the instance and its listeners with it, so there is no disconnect-side teardown.
        component.off('break', this._onBreak, this);
        component.on('break', this._onBreak, this);
    }

    /**
     * Gets the underlying PlayCanvas joint component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The joint component, or `null`.
     */
    get component(): JointComponent | null {
        return super.component;
    }
}

// Each attribute's parser and default. The two body references reach the engine as the entities
// they name, resolved from the joint element each time one is written to a component.
defineAttributes(JointComponentElement, 'component', {
    angularDamping: attr.vec3(Vec3.ONE),
    angularEquilibrium: attr.vec3(Vec3.ZERO),
    angularLimitsX: attr.vec2(Vec2.ZERO),
    angularLimitsY: attr.vec2(Vec2.ZERO),
    angularLimitsZ: attr.vec2(Vec2.ZERO),
    angularMotionX: attr.oneOf(motionModes, 'locked'),
    angularMotionY: attr.oneOf(motionModes, 'locked'),
    angularMotionZ: attr.oneOf(motionModes, 'locked'),
    angularStiffness: attr.vec3(Vec3.ZERO),
    breakImpulse: attr.number(Infinity),
    enableCollision: attr.bool(false),
    enableLimits: attr.bool(false),
    entityA: attr
        .string('')
        .to((value, element) => resolveEntity(value, element, 'entity-a', 'constraint not created')),
    entityB: attr
        .string('')
        .to((value, element) => resolveEntity(value, element, 'entity-b', 'constraint not created')),
    limits: attr.vec2(new Vec2(-45, 45)),
    linearDamping: attr.vec3(Vec3.ONE),
    linearEquilibrium: attr.vec3(Vec3.ZERO),
    linearLimitsX: attr.vec2(Vec2.ZERO),
    linearLimitsY: attr.vec2(Vec2.ZERO),
    linearLimitsZ: attr.vec2(Vec2.ZERO),
    linearMotionX: attr.oneOf(motionModes, 'locked'),
    linearMotionY: attr.oneOf(motionModes, 'locked'),
    linearMotionZ: attr.oneOf(motionModes, 'locked'),
    linearStiffness: attr.vec3(Vec3.ZERO),
    maxMotorForce: attr.number(0),
    motorSpeed: attr.number(0),
    swingLimitY: attr.number(45),
    swingLimitZ: attr.number(45),
    twistLimit: attr.number(20),
    type: attr.oneOf(['fixed', 'ball', 'hinge', 'slider', '6dof'], 'fixed')
});

globalThis.customElements?.define('pc-joint', JointComponentElement);

export { JointComponentElement };
