import type { JointComponent } from 'playcanvas';
import { Vec2, Vec3 } from 'playcanvas';

import { parseBool, parseEnum, parseNumber, parseVec2, parseVec3, resolveEntity } from '../parse';

import { ComponentElement } from './component';

/** The constraint types supported by the `<pc-joint>` element. */
export type JointType = 'fixed' | 'ball' | 'hinge' | 'slider' | '6dof';

/**
 * The motion modes for a single joint axis: fully constrained (`locked`), constrained within
 * limits (`limited`) or unconstrained (`free`).
 */
export type MotionMode = 'locked' | 'limited' | 'free';

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
 * space. An exact entity-name reference resolves against the nearest enclosing entity first, then
 * outward through the entity hierarchy, then the document — so a `<template>` prefab with one root
 * `<pc-entity>` can wire its joints by name and stay self-contained when cloned. The underlying
 * engine component is in alpha, so its API may change.
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
class JointComponentElement extends ComponentElement {
    /**
     * The spring damping of the joint per angular axis.
     */
    private _angularDamping = new Vec3(1, 1, 1);

    /**
     * The rest angle of the joint's angular springs.
     */
    private _angularEquilibrium = new Vec3();

    /**
     * The rotation limits of the joint about its X axis.
     */
    private _angularLimitsX = new Vec2();

    /**
     * The rotation limits of the joint about its Y axis.
     */
    private _angularLimitsY = new Vec2();

    /**
     * The rotation limits of the joint about its Z axis.
     */
    private _angularLimitsZ = new Vec2();

    /**
     * The rotational degree of freedom of the joint about its X axis.
     */
    private _angularMotionX: MotionMode = 'locked';

    /**
     * The rotational degree of freedom of the joint about its Y axis.
     */
    private _angularMotionY: MotionMode = 'locked';

    /**
     * The rotational degree of freedom of the joint about its Z axis.
     */
    private _angularMotionZ: MotionMode = 'locked';

    /**
     * The spring stiffness of the joint per angular axis.
     */
    private _angularStiffness = new Vec3();

    /**
     * The impulse above which the joint breaks.
     */
    private _breakImpulse = Infinity;

    /**
     * Whether collision is enabled between the constrained bodies.
     */
    private _enableCollision = false;

    /**
     * Whether the joint's limits are enforced.
     */
    private _enableLimits = false;

    /**
     * The reference to the entity providing the first constrained body.
     */
    private _entityA = '';

    /**
     * The reference to the entity providing the second constrained body.
     */
    private _entityB = '';

    /**
     * The rotation or travel limits of the joint.
     */
    private _limits = new Vec2(-45, 45);

    /**
     * The spring damping of the joint per linear axis.
     */
    private _linearDamping = new Vec3(1, 1, 1);

    /**
     * The rest point of the joint's linear springs.
     */
    private _linearEquilibrium = new Vec3();

    /**
     * The translation limits of the joint along its X axis.
     */
    private _linearLimitsX = new Vec2();

    /**
     * The translation limits of the joint along its Y axis.
     */
    private _linearLimitsY = new Vec2();

    /**
     * The translation limits of the joint along its Z axis.
     */
    private _linearLimitsZ = new Vec2();

    /**
     * The linear degree of freedom of the joint along its X axis.
     */
    private _linearMotionX: MotionMode = 'locked';

    /**
     * The linear degree of freedom of the joint along its Y axis.
     */
    private _linearMotionY: MotionMode = 'locked';

    /**
     * The linear degree of freedom of the joint along its Z axis.
     */
    private _linearMotionZ: MotionMode = 'locked';

    /**
     * The spring stiffness of the joint per linear axis.
     */
    private _linearStiffness = new Vec3();

    /**
     * The maximum torque or force of the joint's motor.
     */
    private _maxMotorForce = 0;

    /**
     * The target speed of the joint's motor.
     */
    private _motorSpeed = 0;

    /**
     * The maximum swing of the joint around the joint frame's Y axis.
     */
    private _swingLimitY = 45;

    /**
     * The maximum swing of the joint around the joint frame's Z axis.
     */
    private _swingLimitZ = 45;

    /**
     * The maximum twist of the joint about its primary axis.
     */
    private _twistLimit = 20;

    /**
     * The type of the joint.
     */
    private _type: JointType = 'fixed';

    /** @ignore */
    constructor() {
        super('joint');
    }

    protected getInitialComponentData() {
        return {
            angularDamping: this._angularDamping,
            angularEquilibrium: this._angularEquilibrium,
            angularLimitsX: this._angularLimitsX,
            angularLimitsY: this._angularLimitsY,
            angularLimitsZ: this._angularLimitsZ,
            angularMotionX: this._angularMotionX,
            angularMotionY: this._angularMotionY,
            angularMotionZ: this._angularMotionZ,
            angularStiffness: this._angularStiffness,
            breakImpulse: this._breakImpulse,
            enableCollision: this._enableCollision,
            enableLimits: this._enableLimits,
            entityA: resolveEntity(this._entityA, this, 'entity-a', 'constraint not created'),
            entityB: resolveEntity(this._entityB, this, 'entity-b', 'constraint not created'),
            limits: this._limits,
            linearDamping: this._linearDamping,
            linearEquilibrium: this._linearEquilibrium,
            linearLimitsX: this._linearLimitsX,
            linearLimitsY: this._linearLimitsY,
            linearLimitsZ: this._linearLimitsZ,
            linearMotionX: this._linearMotionX,
            linearMotionY: this._linearMotionY,
            linearMotionZ: this._linearMotionZ,
            linearStiffness: this._linearStiffness,
            maxMotorForce: this._maxMotorForce,
            motorSpeed: this._motorSpeed,
            swingLimitY: this._swingLimitY,
            swingLimitZ: this._swingLimitZ,
            twistLimit: this._twistLimit,
            type: this._type
        };
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
     * Gets the underlying PlayCanvas joint component.
     * @returns The joint component.
     */
    get component(): JointComponent {
        return super.component as JointComponent;
    }

    /**
     * Sets the spring damping of a 6dof joint per angular axis, used on axes with a non-zero
     * angular-stiffness.
     * @param value - The angular spring damping.
     */
    set angularDamping(value: Vec3) {
        this._angularDamping = value;
        if (this.component) {
            this.component.angularDamping = value;
        }
    }

    /**
     * Gets the spring damping of the joint per angular axis.
     * @returns The angular spring damping.
     */
    get angularDamping() {
        return this._angularDamping;
    }

    /**
     * Sets the rest angle of a 6dof joint's angular springs in degrees per axis, used on axes with
     * a non-zero angular-stiffness.
     * @param value - The angular spring rest angles.
     */
    set angularEquilibrium(value: Vec3) {
        this._angularEquilibrium = value;
        if (this.component) {
            this.component.angularEquilibrium = value;
        }
    }

    /**
     * Gets the rest angle of the joint's angular springs.
     * @returns The angular spring rest angles.
     */
    get angularEquilibrium() {
        return this._angularEquilibrium;
    }

    /**
     * Sets the lower and upper rotation limit of a 6dof joint about its X axis in degrees, used
     * when angular-motion-x is limited.
     * @param value - The X axis rotation limits.
     */
    set angularLimitsX(value: Vec2) {
        this._angularLimitsX = value;
        if (this.component) {
            this.component.angularLimitsX = value;
        }
    }

    /**
     * Gets the rotation limits of the joint about its X axis.
     * @returns The X axis rotation limits.
     */
    get angularLimitsX() {
        return this._angularLimitsX;
    }

    /**
     * Sets the lower and upper rotation limit of a 6dof joint about its Y axis in degrees, used
     * when angular-motion-y is limited.
     * @param value - The Y axis rotation limits.
     */
    set angularLimitsY(value: Vec2) {
        this._angularLimitsY = value;
        if (this.component) {
            this.component.angularLimitsY = value;
        }
    }

    /**
     * Gets the rotation limits of the joint about its Y axis.
     * @returns The Y axis rotation limits.
     */
    get angularLimitsY() {
        return this._angularLimitsY;
    }

    /**
     * Sets the lower and upper rotation limit of a 6dof joint about its Z axis in degrees, used
     * when angular-motion-z is limited.
     * @param value - The Z axis rotation limits.
     */
    set angularLimitsZ(value: Vec2) {
        this._angularLimitsZ = value;
        if (this.component) {
            this.component.angularLimitsZ = value;
        }
    }

    /**
     * Gets the rotation limits of the joint about its Z axis.
     * @returns The Z axis rotation limits.
     */
    get angularLimitsZ() {
        return this._angularLimitsZ;
    }

    /**
     * Sets how a 6dof joint constrains rotation about its X axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The X axis rotational degree of freedom.
     */
    set angularMotionX(value: MotionMode) {
        this._angularMotionX = value;
        if (this.component) {
            this.component.angularMotionX = value;
        }
    }

    /**
     * Gets how the joint constrains rotation about its X axis.
     * @returns The X axis rotational degree of freedom.
     */
    get angularMotionX() {
        return this._angularMotionX;
    }

    /**
     * Sets how a 6dof joint constrains rotation about its Y axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The Y axis rotational degree of freedom.
     */
    set angularMotionY(value: MotionMode) {
        this._angularMotionY = value;
        if (this.component) {
            this.component.angularMotionY = value;
        }
    }

    /**
     * Gets how the joint constrains rotation about its Y axis.
     * @returns The Y axis rotational degree of freedom.
     */
    get angularMotionY() {
        return this._angularMotionY;
    }

    /**
     * Sets how a 6dof joint constrains rotation about its Z axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The Z axis rotational degree of freedom.
     */
    set angularMotionZ(value: MotionMode) {
        this._angularMotionZ = value;
        if (this.component) {
            this.component.angularMotionZ = value;
        }
    }

    /**
     * Gets how the joint constrains rotation about its Z axis.
     * @returns The Z axis rotational degree of freedom.
     */
    get angularMotionZ() {
        return this._angularMotionZ;
    }

    /**
     * Sets the spring stiffness of a 6dof joint per angular axis, where 0 disables the spring on
     * that axis.
     * @param value - The angular spring stiffness.
     */
    set angularStiffness(value: Vec3) {
        this._angularStiffness = value;
        if (this.component) {
            this.component.angularStiffness = value;
        }
    }

    /**
     * Gets the spring stiffness of the joint per angular axis.
     * @returns The angular spring stiffness.
     */
    get angularStiffness() {
        return this._angularStiffness;
    }

    /**
     * Sets the impulse in newton seconds above which the joint breaks. Defaults to `Infinity`,
     * which makes the joint unbreakable.
     * @param value - The break impulse.
     */
    set breakImpulse(value: number) {
        this._breakImpulse = value;
        if (this.component) {
            this.component.breakImpulse = value;
        }
    }

    /**
     * Gets the impulse above which the joint breaks.
     * @returns The break impulse.
     */
    get breakImpulse() {
        return this._breakImpulse;
    }

    /**
     * Sets whether collision is enabled between the two constrained bodies.
     * @param value - Whether collision is enabled.
     */
    set enableCollision(value: boolean) {
        this._enableCollision = value;
        if (this.component) {
            this.component.enableCollision = value;
        }
    }

    /**
     * Gets whether collision is enabled between the two constrained bodies.
     * @returns Whether collision is enabled.
     */
    get enableCollision() {
        return this._enableCollision;
    }

    /**
     * Sets whether the limits of a hinge, slider or ball joint are enforced.
     * @param value - Whether the limits are enforced.
     */
    set enableLimits(value: boolean) {
        this._enableLimits = value;
        if (this.component) {
            this.component.enableLimits = value;
        }
    }

    /**
     * Gets whether the limits of the joint are enforced.
     * @returns Whether the limits are enforced.
     */
    get enableLimits() {
        return this._enableLimits;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` providing
     * the first constrained body. An exact entity name resolves against the nearest enclosing
     * entity first, then outward, then the document. The reference resolves when it is set, so an
     * entity created later is picked up by setting the attribute again. A non-empty reference
     * that does not resolve warns, naming which of the two causes it hit.
     * @param value - The first body's entity reference.
     */
    set entityA(value: string) {
        this._entityA = value;
        if (this.component) {
            this.component.entityA = resolveEntity(value, this, 'entity-a', 'constraint not created');
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` providing the first constrained body.
     * @returns The first body's entity reference.
     */
    get entityA() {
        return this._entityA;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` providing
     * the second constrained body, or empty to constrain the first body to a fixed point in world
     * space. An exact entity name resolves against the nearest enclosing entity first, then
     * outward, then the document. The reference resolves when it is set, so an entity created
     * later is picked up by setting the attribute again. A non-empty reference that does not
     * resolve warns; an empty one is the documented world-space case and stays silent.
     * @param value - The second body's entity reference.
     */
    set entityB(value: string) {
        this._entityB = value;
        if (this.component) {
            this.component.entityB = resolveEntity(value, this, 'entity-b', 'constraint not created');
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` providing the second constrained body.
     * @returns The second body's entity reference.
     */
    get entityB() {
        return this._entityB;
    }

    /**
     * Sets the lower and upper limit of a hinge joint's rotation in degrees, or a slider joint's
     * travel in meters, applied when enable-limits is set.
     * @param value - The rotation or travel limits.
     */
    set limits(value: Vec2) {
        this._limits = value;
        if (this.component) {
            this.component.limits = value;
        }
    }

    /**
     * Gets the rotation or travel limits of the joint.
     * @returns The rotation or travel limits.
     */
    get limits() {
        return this._limits;
    }

    /**
     * Sets the spring damping of a 6dof joint per linear axis, used on axes with a non-zero
     * linear-stiffness.
     * @param value - The linear spring damping.
     */
    set linearDamping(value: Vec3) {
        this._linearDamping = value;
        if (this.component) {
            this.component.linearDamping = value;
        }
    }

    /**
     * Gets the spring damping of the joint per linear axis.
     * @returns The linear spring damping.
     */
    get linearDamping() {
        return this._linearDamping;
    }

    /**
     * Sets the rest point of a 6dof joint's linear springs in meters per axis, used on axes with a
     * non-zero linear-stiffness.
     * @param value - The linear spring rest points.
     */
    set linearEquilibrium(value: Vec3) {
        this._linearEquilibrium = value;
        if (this.component) {
            this.component.linearEquilibrium = value;
        }
    }

    /**
     * Gets the rest point of the joint's linear springs.
     * @returns The linear spring rest points.
     */
    get linearEquilibrium() {
        return this._linearEquilibrium;
    }

    /**
     * Sets the lower and upper translation limit of a 6dof joint along its X axis in meters, used
     * when linear-motion-x is limited.
     * @param value - The X axis translation limits.
     */
    set linearLimitsX(value: Vec2) {
        this._linearLimitsX = value;
        if (this.component) {
            this.component.linearLimitsX = value;
        }
    }

    /**
     * Gets the translation limits of the joint along its X axis.
     * @returns The X axis translation limits.
     */
    get linearLimitsX() {
        return this._linearLimitsX;
    }

    /**
     * Sets the lower and upper translation limit of a 6dof joint along its Y axis in meters, used
     * when linear-motion-y is limited.
     * @param value - The Y axis translation limits.
     */
    set linearLimitsY(value: Vec2) {
        this._linearLimitsY = value;
        if (this.component) {
            this.component.linearLimitsY = value;
        }
    }

    /**
     * Gets the translation limits of the joint along its Y axis.
     * @returns The Y axis translation limits.
     */
    get linearLimitsY() {
        return this._linearLimitsY;
    }

    /**
     * Sets the lower and upper translation limit of a 6dof joint along its Z axis in meters, used
     * when linear-motion-z is limited.
     * @param value - The Z axis translation limits.
     */
    set linearLimitsZ(value: Vec2) {
        this._linearLimitsZ = value;
        if (this.component) {
            this.component.linearLimitsZ = value;
        }
    }

    /**
     * Gets the translation limits of the joint along its Z axis.
     * @returns The Z axis translation limits.
     */
    get linearLimitsZ() {
        return this._linearLimitsZ;
    }

    /**
     * Sets how a 6dof joint constrains translation along its X axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The X axis linear degree of freedom.
     */
    set linearMotionX(value: MotionMode) {
        this._linearMotionX = value;
        if (this.component) {
            this.component.linearMotionX = value;
        }
    }

    /**
     * Gets how the joint constrains translation along its X axis.
     * @returns The X axis linear degree of freedom.
     */
    get linearMotionX() {
        return this._linearMotionX;
    }

    /**
     * Sets how a 6dof joint constrains translation along its Y axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The Y axis linear degree of freedom.
     */
    set linearMotionY(value: MotionMode) {
        this._linearMotionY = value;
        if (this.component) {
            this.component.linearMotionY = value;
        }
    }

    /**
     * Gets how the joint constrains translation along its Y axis.
     * @returns The Y axis linear degree of freedom.
     */
    get linearMotionY() {
        return this._linearMotionY;
    }

    /**
     * Sets how a 6dof joint constrains translation along its Z axis. Can be `locked`, `limited` or
     * `free`. Defaults to `locked`.
     * @param value - The Z axis linear degree of freedom.
     */
    set linearMotionZ(value: MotionMode) {
        this._linearMotionZ = value;
        if (this.component) {
            this.component.linearMotionZ = value;
        }
    }

    /**
     * Gets how the joint constrains translation along its Z axis.
     * @returns The Z axis linear degree of freedom.
     */
    get linearMotionZ() {
        return this._linearMotionZ;
    }

    /**
     * Sets the spring stiffness of a 6dof joint per linear axis, where 0 disables the spring on
     * that axis.
     * @param value - The linear spring stiffness.
     */
    set linearStiffness(value: Vec3) {
        this._linearStiffness = value;
        if (this.component) {
            this.component.linearStiffness = value;
        }
    }

    /**
     * Gets the spring stiffness of the joint per linear axis.
     * @returns The linear spring stiffness.
     */
    get linearStiffness() {
        return this._linearStiffness;
    }

    /**
     * Sets the maximum torque in newton meters of a hinge joint's motor, or the maximum force in
     * newtons of a slider joint's motor, where 0 disables the motor.
     * @param value - The maximum motor torque or force.
     */
    set maxMotorForce(value: number) {
        this._maxMotorForce = value;
        if (this.component) {
            this.component.maxMotorForce = value;
        }
    }

    /**
     * Gets the maximum torque or force of the joint's motor.
     * @returns The maximum motor torque or force.
     */
    get maxMotorForce() {
        return this._maxMotorForce;
    }

    /**
     * Sets the target speed of a hinge joint's motor in degrees per second, or a slider joint's
     * motor in meters per second, active while max-motor-force is greater than 0.
     * @param value - The motor's target speed.
     */
    set motorSpeed(value: number) {
        this._motorSpeed = value;
        if (this.component) {
            this.component.motorSpeed = value;
        }
    }

    /**
     * Gets the target speed of the joint's motor.
     * @returns The motor's target speed.
     */
    get motorSpeed() {
        return this._motorSpeed;
    }

    /**
     * Sets the maximum swing of a ball joint around the joint frame's Y axis in degrees, applied
     * when enable-limits is set.
     * @param value - The Y axis swing limit.
     */
    set swingLimitY(value: number) {
        this._swingLimitY = value;
        if (this.component) {
            this.component.swingLimitY = value;
        }
    }

    /**
     * Gets the maximum swing of the joint around the joint frame's Y axis.
     * @returns The Y axis swing limit.
     */
    get swingLimitY() {
        return this._swingLimitY;
    }

    /**
     * Sets the maximum swing of a ball joint around the joint frame's Z axis in degrees, applied
     * when enable-limits is set.
     * @param value - The Z axis swing limit.
     */
    set swingLimitZ(value: number) {
        this._swingLimitZ = value;
        if (this.component) {
            this.component.swingLimitZ = value;
        }
    }

    /**
     * Gets the maximum swing of the joint around the joint frame's Z axis.
     * @returns The Z axis swing limit.
     */
    get swingLimitZ() {
        return this._swingLimitZ;
    }

    /**
     * Sets the maximum twist of a ball joint about its primary axis in degrees, applied when
     * enable-limits is set.
     * @param value - The twist limit.
     */
    set twistLimit(value: number) {
        this._twistLimit = value;
        if (this.component) {
            this.component.twistLimit = value;
        }
    }

    /**
     * Gets the maximum twist of the joint about its primary axis.
     * @returns The twist limit.
     */
    get twistLimit() {
        return this._twistLimit;
    }

    /**
     * Sets the type of the joint. Can be `fixed`, `ball`, `hinge`, `slider` or `6dof`. Defaults to
     * `fixed`.
     * @param value - The joint type.
     */
    set type(value: JointType) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the joint.
     * @returns The joint type.
     */
    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'angular-damping',
            'angular-equilibrium',
            'angular-limits-x',
            'angular-limits-y',
            'angular-limits-z',
            'angular-motion-x',
            'angular-motion-y',
            'angular-motion-z',
            'angular-stiffness',
            'break-impulse',
            'enable-collision',
            'enable-limits',
            'entity-a',
            'entity-b',
            'limits',
            'linear-damping',
            'linear-equilibrium',
            'linear-limits-x',
            'linear-limits-y',
            'linear-limits-z',
            'linear-motion-x',
            'linear-motion-y',
            'linear-motion-z',
            'linear-stiffness',
            'max-motor-force',
            'motor-speed',
            'swing-limit-y',
            'swing-limit-z',
            'twist-limit',
            'type'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'angular-damping':
                this.angularDamping = parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'angular-equilibrium':
                this.angularEquilibrium = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'angular-limits-x':
                this.angularLimitsX = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'angular-limits-y':
                this.angularLimitsY = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'angular-limits-z':
                this.angularLimitsZ = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'angular-motion-x':
                this.angularMotionX = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'angular-motion-y':
                this.angularMotionY = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'angular-motion-z':
                this.angularMotionZ = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'angular-stiffness':
                this.angularStiffness = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'break-impulse':
                this.breakImpulse = parseNumber(newValue, Infinity, name);
                break;
            case 'enable-collision':
                this.enableCollision = parseBool(newValue, false);
                break;
            case 'enable-limits':
                this.enableLimits = parseBool(newValue, false);
                break;
            case 'entity-a':
                this.entityA = newValue ?? '';
                break;
            case 'entity-b':
                this.entityB = newValue ?? '';
                break;
            case 'limits':
                this.limits = parseVec2(newValue, new Vec2(-45, 45), name);
                break;
            case 'linear-damping':
                this.linearDamping = parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'linear-equilibrium':
                this.linearEquilibrium = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'linear-limits-x':
                this.linearLimitsX = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'linear-limits-y':
                this.linearLimitsY = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'linear-limits-z':
                this.linearLimitsZ = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'linear-motion-x':
                this.linearMotionX = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'linear-motion-y':
                this.linearMotionY = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'linear-motion-z':
                this.linearMotionZ = parseEnum(newValue, ['locked', 'limited', 'free'], 'locked', name);
                break;
            case 'linear-stiffness':
                this.linearStiffness = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'max-motor-force':
                this.maxMotorForce = parseNumber(newValue, 0, name);
                break;
            case 'motor-speed':
                this.motorSpeed = parseNumber(newValue, 0, name);
                break;
            case 'swing-limit-y':
                this.swingLimitY = parseNumber(newValue, 45, name);
                break;
            case 'swing-limit-z':
                this.swingLimitZ = parseNumber(newValue, 45, name);
                break;
            case 'twist-limit':
                this.twistLimit = parseNumber(newValue, 20, name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['fixed', 'ball', 'hinge', 'slider', '6dof'], 'fixed', name);
                break;
        }
    }
}

customElements.define('pc-joint', JointComponentElement);

export { JointComponentElement };
