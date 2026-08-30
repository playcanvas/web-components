import { Entity, Quat, Script, Vec2, Vec3 } from 'playcanvas';

/** The local Y centers of the six physics segments, one per skin bone, in authored meters. */
const SEG_CENTERS = [-0.0575, -0.0345, -0.0115, 0.0115, 0.0345, 0.0575];

/** The local Y positions of the five flex joints between them, in authored meters. */
const JOINT_HEIGHTS = [-0.046, -0.023, 0, 0.023, 0.046];

/** The capsule length of one segment in authored meters (overlapping the neighbors a little). */
const SEG_HEIGHT = 0.027;

/** The capsule radius of one segment in authored meters. */
const SEG_RADIUS = 0.0115;

/** How far one flex joint may bend, in degrees. Five joints share the total fold. */
const BEND_LIMIT = 10;

/** How far one flex joint may twist about the wiener's length, in degrees - a raw wiener
 * flexes but barely twists at all. */
const TWIST_LIMIT = 1.5;

/** The angular spring stiffness pulling each joint back straight. */
const BEND_STIFFNESS = 6;

/** The angular spring stiffness resisting twist. */
const TWIST_STIFFNESS = 8;

/**
 * Lobs a steady barrage of wieners at the user's head. Works in MediaPipe's camera space, as
 * established by a head tracking script (like `trackedHead`): the camera is pinned at the
 * origin, the tracked head moves in front of it at negative Z, and the world - including the
 * flying wieners - is anchored to the room, measured in centimeters. Each wiener spawns on the
 * hemisphere between the head and the screen and is lobbed on an arc aimed at the head's
 * position at launch, so moving your head actually dodges what is already in the air. Gravity
 * is softened and a little air drag bleeds speed off on the way in (the launch solve accounts
 * for both), so a throw leaves the hand brisk but arrives gently - a toss, not a fastball. An
 * invisible physics proxy for the head (see the example markup) bounces them away.
 *
 * Each wiener bends like the real, raw thing: it is a chain of six capsule rigid bodies linked
 * by 6dof joints whose angular springs pull it back straight, and the model is a skinned mesh
 * whose six bones ride the segment bodies one to one. With five flex points along the length,
 * an impact folds the chain around whatever it hit in a smooth curve and the springs wobble it
 * straight again - no scripted deformation, just physics.
 *
 * Throwing runs while a face is tracked (`face:found`/`face:lost`), which the `?sim` and
 * no-camera fallback modes of the face tracking script also report.
 *
 * The storm escalates while a face is tracked: every `escalation` seconds the category climbs
 * (to a maximum of 5) and the throw rate grows with it, so staying in front of the camera gets
 * progressively riskier.
 *
 * Fires the following events on the application:
 *
 * - `wiener:hit` - Fired each time a wiener strikes the target head entity, with the striking
 *   segment's speed in centimeters per second.
 * - `wiener:missed` - Fired when a wiener retires without ever touching the head - with launch
 *   aiming leading the target, a miss means it was dodged.
 * - `storm:category` - Fired with the storm category (1-5) when it changes, including the
 *   initial category when throwing starts.
 */
export class WienerStorm extends Script {
    static scriptName = 'wienerStorm';

    /**
     * The wiener model, a GLB container asset authored in meters with its length along +Y and
     * skinned to a `B0`-`B5` bone chain.
     * @type {import('playcanvas').Asset}
     * @attribute
     */
    wienerAsset = null;

    /**
     * The head proxy entity: throws are aimed at its position at launch, and a wiener
     * colliding with it fires `wiener:hit`.
     * @type {Entity}
     * @attribute
     */
    target = null;

    /**
     * The average number of wieners thrown per second at storm category 1. Each category
     * above that adds 30%.
     * @type {number}
     * @attribute
     */
    rate = 2.5;

    /**
     * The seconds of active throwing per storm category. 0 keeps the storm steady at
     * category 1.
     * @type {number}
     * @attribute
     */
    escalation = 25;

    /**
     * The scale applied to the wiener model, converting its authored meters to scene units.
     * @type {number}
     * @attribute
     */
    modelScale = 100;

    /**
     * The nearest distance from the head that a wiener may spawn, in centimeters.
     * @type {number}
     * @attribute
     */
    minDistance = 55;

    /**
     * The farthest distance from the head that a wiener may spawn, in centimeters.
     * @type {number}
     * @attribute
     */
    maxDistance = 90;

    /**
     * The maximum horizontal angle from dead ahead that a wiener may spawn at, in degrees. Up to
     * 90 covers the frontal hemisphere; beyond 90 lets throws come in from slightly behind the
     * ears.
     * @type {number}
     * @attribute
     */
    spread = 105;

    /**
     * The elevation range a wiener may spawn in, in degrees above the head's horizon.
     * @type {Vec2}
     * @attribute
     */
    elevation = new Vec2(-8, 42);

    /**
     * The aim offset from the target's position, in centimeters - roughly the middle of
     * the face.
     * @type {Vec3}
     * @attribute
     */
    aim = new Vec3(0, 1, 2);

    /**
     * The radius of the random aim error, in centimeters.
     * @type {number}
     * @attribute
     */
    aimJitter = 5;

    /**
     * Gravity in centimeters per second squared. Real gravity is 981, which slams even a
     * gentle lob into the head at around 3 meters per second - the default is softer, so
     * arcs stay believable but arrive slower.
     * @type {number}
     * @attribute
     */
    gravity = 450;

    /**
     * The air drag on a flying wiener, as an exponential decay rate per second. A throw
     * leaves the hand brisk and sheds speed on the way in, arriving gently. The launch
     * solve accounts for it, and it matches Ammo's damping model exactly. 0 disables it.
     * @type {number}
     * @attribute
     */
    drag = 1;

    /**
     * The bounciness of a wiener, 0 to 1.
     * @type {number}
     * @attribute
     */
    restitution = 0.4;

    /**
     * The seconds a wiener lives before it is removed.
     * @type {number}
     * @attribute
     */
    lifetime = 6;

    /**
     * The maximum number of wieners alive at once.
     * @type {number}
     * @attribute
     */
    maxLive = 12;

    /** @private */
    _live = [];

    /** @private */
    _active = false;

    /** @private */
    _timer = 0.6;

    /** @private */
    _activeTime = 0;

    /** @private */
    _category = 0;

    /** @private */
    _prevGravity = new Vec3();

    /** @private */
    _prevTimeStep = 1 / 60;

    /** @private */
    _prevIterations = 10;

    /** @private */
    _tmpVec = new Vec3();

    /** @private */
    _tmpVec2 = new Vec3();

    /** @private */
    _tmpQuat = new Quat();

    initialize() {
        // The scene is in centimeters, so gravity is in centimeters per second squared
        const gravity = this.app.systems.rigidbody.gravity;
        this._prevGravity.copy(gravity);
        gravity.set(0, -this.gravity, 0);

        // Six-body chains need more solver iterations than Ammo's default 10, or hard
        // head impacts visibly stretch the joints apart for a few frames. The engine
        // does not surface this, so it is set on the dynamics world directly.
        const solverInfo = this.app.systems.rigidbody.dynamicsWorld?.getSolverInfo?.();
        this._prevIterations = solverInfo?.get_m_numIterations?.() ?? 10;
        solverInfo?.set_m_numIterations?.(20);

        // A head impact can spin a light segment through well over 90 degrees inside a
        // single 60Hz physics step - past every joint limit before the solver ever sees
        // it. Stepping physics at 180Hz keeps the worst violations near the limits.
        this._prevTimeStep = this.app.systems.rigidbody.fixedTimeStep;
        this.app.systems.rigidbody.fixedTimeStep = 1 / 180;

        const onFound = () => {
            this._active = true;
        };
        const onLost = () => {
            this._active = false;
        };
        this.app.on('face:found', onFound);
        this.app.on('face:lost', onLost);

        this.on('destroy', () => {
            this.app.off('face:found', onFound);
            this.app.off('face:lost', onLost);
            for (const wiener of this._live) {
                wiener.container.destroy();
            }
            this._live.length = 0;
            this.app.systems.rigidbody.gravity.copy(this._prevGravity);
            this.app.systems.rigidbody.fixedTimeStep = this._prevTimeStep;
            this.app.systems.rigidbody.dynamicsWorld?.getSolverInfo?.().set_m_numIterations?.(this._prevIterations);
        });
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        if (this._active) {
            this._activeTime += dt;
            const category = this.escalation > 0 ?
                Math.min(5, 1 + Math.floor(this._activeTime / this.escalation)) : 1;
            if (category !== this._category) {
                this._category = category;
                this.app.fire('storm:category', category);
            }

            this._timer -= dt;
            if (this._timer <= 0) {
                this._throw();
                // Uneven pacing reads as thrown rather than machine-fired, and the rate
                // climbs with the storm category
                const rate = Math.max(0.1, this.rate) * (1 + 0.3 * (this._category - 1));
                this._timer = (1 / rate) * (0.7 + Math.random() * 0.6);
            }
        }

        // Ride the skin bones on the physics segments and retire spent wieners
        for (let i = this._live.length - 1; i >= 0; i--) {
            const wiener = this._live[i];
            wiener.age += dt;

            for (let b = 0; b < wiener.bones.length; b++) {
                const segment = wiener.segments[b];
                const bone = wiener.bones[b];
                const rot = segment.getRotation();
                rot.transformVector(wiener.posOffsets[b], this._tmpVec).add(segment.getPosition());
                this._tmpQuat.mul2(rot, wiener.rotOffsets[b]);
                bone.setPosition(this._tmpVec);
                bone.setRotation(this._tmpQuat);
            }

            if (wiener.age > this.lifetime || wiener.segments[2].getPosition().y < -160) {
                if (!wiener.hitHead) this.app.fire('wiener:missed');
                wiener.container.destroy();
                this._live.splice(i, 1);
            }
        }
    }

    /**
     * Spawns one wiener on the frontal hemisphere and throws it at the head.
     * @private
     */
    _throw() {
        // An unresolved target reference arrives as a raw string, so guard on the method
        if (!this.wienerAsset?.resource || !this.target?.getPosition) return;

        while (this._live.length >= this.maxLive) {
            const retired = this._live.shift();
            if (!retired.hitHead) this.app.fire('wiener:missed');
            retired.container.destroy();
        }

        // A spawn point on the hemisphere between the head and the screen: +Z is out of
        // the screen toward the viewer, so azimuth 0 comes straight out of the camera
        const targetPos = this.target.getPosition();
        const azimuth = (Math.random() * 2 - 1) * this.spread * Math.PI / 180;
        const elev = (this.elevation.x + Math.random() * (this.elevation.y - this.elevation.x)) * Math.PI / 180;
        const distance = this.minDistance + Math.random() * (this.maxDistance - this.minDistance);
        const pos = new Vec3(
            Math.sin(azimuth) * Math.cos(elev),
            Math.sin(elev),
            Math.cos(azimuth) * Math.cos(elev)
        ).mulScalar(distance).add(targetPos);

        // Solve the throw that lands on the (jittered) aim point. With drag the flight
        // obeys v' = g - drag * v, whose closed form still has an exact launch velocity:
        // v0 = g/d + (delta - g*T/d) / ((1 - e^(-d*T)) / d), with gravity g on Y only
        const flight = 0.55 + Math.random() * 0.3;
        const jitter = this._tmpVec.set(
            (Math.random() * 2 - 1) * this.aimJitter,
            (Math.random() * 2 - 1) * this.aimJitter,
            (Math.random() * 2 - 1) * this.aimJitter * 0.4
        );
        const delta = new Vec3().add2(this.aim, jitter).add(targetPos).sub(pos);
        const g = -this.gravity;
        const drag = Math.max(0, this.drag);
        let velocity;
        if (drag > 0.001) {
            const fade = (1 - Math.exp(-drag * flight)) / drag;
            velocity = new Vec3(
                delta.x / fade,
                g / drag + (delta.y - g * flight / drag) / fade,
                delta.z / fade
            );
        } else {
            velocity = delta.mulScalar(1 / flight);
            velocity.y += 0.5 * this.gravity * flight;
        }

        const scale = 0.9 + Math.random() * 0.22;
        const k = this.modelScale * scale;

        // The container holds the whole wiener for lifecycle only - the segment bodies fly
        // in world space regardless of their parent
        const container = new Entity('wiener');
        container.setPosition(pos);
        this._tmpQuat.setFromEulerAngles(Math.random() * 360, Math.random() * 360, Math.random() * 360);
        container.setRotation(this._tmpQuat);
        this.app.root.addChild(container);

        const wiener = {
            container: container,
            segments: [],
            bones: [],
            posOffsets: [],
            rotOffsets: [],
            age: 0,
            hitHead: false
        };

        for (const center of SEG_CENTERS) {
            const segment = new Entity('wiener-segment');
            segment.setLocalPosition(0, center * k, 0);
            container.addChild(segment);
            segment.addComponent('collision', {
                type: 'capsule',
                radius: SEG_RADIUS * k,
                height: SEG_HEIGHT * k
            });
            segment.addComponent('rigidbody', {
                type: 'dynamic',
                mass: 0.02,
                restitution: this.restitution,
                friction: 0.4,
                // Ammo damping is exponential per second, matching the launch solve
                linearDamping: 1 - Math.exp(-drag),
                angularDamping: 0.5
            });

            segment.collision.on('collisionstart', (result) => {
                // A settling wiener restarts the contact every micro-bounce, so a direct
                // hit only counts once per wiener
                if (!wiener.hitHead && this.target && result.other === this.target) {
                    wiener.hitHead = true;
                    // The post-bounce speed is a fine proxy for how hard it landed
                    this.app.fire('wiener:hit', segment.rigidbody.linearVelocity.length());
                }
            });

            wiener.segments.push(segment);
        }

        // The 6dof joints make the chain flex: bending swings about the local X and Z of
        // each junction, twisting about Y, and angular springs pull the wiener straight
        // again - a raw wiener is floppy, not a rag
        for (let j = 0; j < JOINT_HEIGHTS.length; j++) {
            const joint = new Entity('wiener-joint');
            joint.setLocalPosition(0, JOINT_HEIGHTS[j] * k, 0);
            container.addChild(joint);
            joint.addComponent('joint', {
                type: '6dof',
                entityA: wiener.segments[j],
                entityB: wiener.segments[j + 1],
                angularMotionX: 'limited',
                angularMotionY: 'limited',
                angularMotionZ: 'limited',
                angularLimitsX: new Vec2(-BEND_LIMIT, BEND_LIMIT),
                angularLimitsY: new Vec2(-TWIST_LIMIT, TWIST_LIMIT),
                angularLimitsZ: new Vec2(-BEND_LIMIT, BEND_LIMIT),
                angularStiffness: new Vec3(BEND_STIFFNESS, TWIST_STIFFNESS, BEND_STIFFNESS)
            });

            // At Ammo's default stop ERP a hard head impact blows straight through the
            // limits for a few frames, folding the wiener far past them. Stiffen the
            // limit correction on every axis, set on the native constraint directly
            // (2 is BT_CONSTRAINT_STOP_ERP)
            const constraint = joint.joint.constraint;
            for (let axis = 0; axis < 6; axis++) {
                constraint?.setParam(2, 0.8, axis);
            }
        }

        // The skinned model rides along: each bone copies its segment body every frame,
        // through the offsets between them captured at this rest pose
        const model = this.wienerAsset.resource.instantiateRenderEntity();
        model.setLocalScale(k, k, k);
        container.addChild(model);

        for (let b = 0; b < wiener.segments.length; b++) {
            const segment = wiener.segments[b];
            const bone = model.findByName(`B${b}`);
            const invRot = this._tmpQuat.copy(segment.getRotation()).invert();
            wiener.bones.push(bone);
            wiener.posOffsets.push(invRot.transformVector(new Vec3().sub2(bone.getPosition(), segment.getPosition())));
            wiener.rotOffsets.push(new Quat().mul2(invRot, bone.getRotation()));
        }

        // Throw the chain as one rigid motion: a shared tumble plus the velocity that
        // tumble adds at each segment's offset from the middle
        const omega = new Vec3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        ).normalize().mulScalar(2 + Math.random() * 2.5);
        const mid = this._tmpVec2.copy(container.getPosition());
        for (const segment of wiener.segments) {
            const arm = this._tmpVec.sub2(segment.getPosition(), mid);
            const spin = new Vec3().cross(omega, arm);
            segment.rigidbody.linearVelocity = spin.add(velocity);
            segment.rigidbody.angularVelocity = omega;
        }

        this._live.push(wiener);
    }
}
