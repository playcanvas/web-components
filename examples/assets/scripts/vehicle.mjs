import {
    KEY_A, KEY_D, KEY_DOWN, KEY_LEFT, KEY_R, KEY_RIGHT, KEY_S, KEY_SPACE, KEY_UP, KEY_W,
    Mat4, Quat, Script, Vec3, math
} from 'playcanvas';

/**
 * @import { Entity } from 'playcanvas';
 */

/**
 * Bullet's activation state for a body that must never sleep. A raycast vehicle drives its chassis
 * through the wheels, and a sleeping body ignores forces entirely - a parked car would refuse to
 * pull away.
 */
const DISABLE_DEACTIVATION = 4;

/**
 * Bullet is told which chassis axis points forward by index, and only the positive ones can be
 * named: `setCoordinateSystem(0, 1, 2)` means X right, Y up, Z forward. A PlayCanvas entity faces
 * -Z, so Bullet's vehicle frame is the scene's, mirrored front to back. Every quantity measured
 * along that axis changes sign at the boundary and nothing else does, so exactly two places apply
 * this: {@link VehicleWheel#_apply}, which writes drive and steering, and {@link Vehicle#speed},
 * which reads the speed back.
 */
const MIRROR = -1;

/** Engines are quoted in revolutions per minute; Bullet works in radians per second. */
const RAD_PER_SEC_TO_RPM = 60 / (2 * Math.PI);

/**
 * The speed, in km/h, below which the car counts as stopped - slow enough that a gear change or a
 * firm brake is the right answer rather than a jolt.
 */
const STANDSTILL = 2;

/**
 * How much of vertical the car's own up axis has to lose before it counts as fallen over: this is
 * about 66 degrees of tilt, well past anything a hill can stand it at while its wheels still reach
 * the ground, so a steep climb never reads as a crash.
 */
const FALLEN = 0.4;

/**
 * How slowly a fallen car must be turning, in radians per second, before it counts as having come
 * to rest rather than still tumbling. At this rate a roll would take three seconds to come round,
 * so anything genuinely on its way back onto its wheels is well above it, while a car rocking as it
 * settles is well below.
 */
const SETTLED = 1;

/**
 * The clearance a righted car is set down with, in meters. Just enough that it drops onto its
 * springs rather than starting inside the ground.
 */
const RIGHTING_LIFT = 0.3;

const tmpMat = new Mat4();
const tmpVec = new Vec3();
const tmpDir = new Vec3();
const tmpAxis = new Vec3();
const tmpHinge = new Quat();
const tmpCross = new Vec3();
const tmpRot = new Quat();

/**
 * Drives a rigid body as a car, using Ammo's `btRaycastVehicle`.
 *
 * The chassis is an ordinary dynamic rigid body, declared with `<pc-rigid-body>` and
 * `<pc-collision>` like any other. The wheels are not bodies: the vehicle casts a ray for each one
 * and resolves suspension, grip and drive along it, which is why it stays planted where a car built
 * from wheel bodies and hinge joints jitters. It is the same model as Unity's WheelCollider.
 *
 * A wheel is a {@link VehicleWheel} script on a descendant entity. Each one announces itself to the
 * chassis above it when it initializes, so a car assembled from glTF nodes comes together as the
 * model loads without this script having to know how many wheels to expect or what order they
 * arrive in. What a wheel *does* - steer, drive, brake - is authored on the wheel itself, so a
 * front driver, a rear driver, a six wheeler and a car that steers all four wheels are all the same
 * script with different numbers on the wheels. Bullet cannot remove a wheel once added, so a wheel
 * destroyed mid-life leaves its ray behind; wheels are expected to live as long as the car.
 *
 * Torque reaches the road through an engine and a gearbox rather than by scaling a force with the
 * throttle. That is what makes acceleration taper as the revs climb, gives a top speed that falls
 * out of the gearing instead of an arbitrary cap, and makes reverse a gear rather than a negative
 * force.
 *
 * Controls are properties, not input handling: set {@link steer}, {@link throttle} and
 * {@link handbrake} from a keyboard script, on-screen buttons or an AI. Listens for
 * `vehicle:reset` on the application, so a page's reset button never reaches into the script.
 *
 * A car that ends up on its roof stays there as far as the simulation is concerned, so one left
 * lying over for {@link rightingDelay} is set back on its wheels where it is - see {@link right}.
 */
export class Vehicle extends Script {
    static scriptName = 'vehicle';

    /**
     * The peak torque the engine makes, in Newton meters, before gearing multiplies it.
     *
     * @attribute
     * @type {number}
     */
    maxTorque = 320;

    /**
     * The revs the engine idles at. It is never allowed below this, which is what lets a stopped
     * car pull away.
     *
     * @attribute
     * @type {number}
     */
    idleRpm = 800;

    /**
     * The revs peak torque arrives at. Below it the engine is still coming on song; above it torque
     * tails away towards the limiter.
     *
     * @attribute
     * @type {number}
     */
    peakTorqueRpm = 2600;

    /**
     * The revs the engine will not pull beyond. With the tallest gear and the wheel radius, this is
     * what sets the car's top speed.
     *
     * @attribute
     * @type {number}
     */
    maxRpm = 4400;

    /**
     * The forward gear ratios, first gear first. Set this through the JSON `attributes` form of
     * `<pc-script-instance>`, which can carry an array.
     *
     * @attribute
     * @type {number[]}
     */
    gears = [3.6, 2.2, 1.5, 1.1];

    /**
     * The reverse gear ratio.
     *
     * @attribute
     * @type {number}
     */
    reverseGear = 3.2;

    /**
     * The final drive ratio, multiplying every gear. Small wheels and heavy vehicles want a lot of
     * it.
     *
     * @attribute
     * @type {number}
     */
    finalDrive = 6.5;

    /**
     * The revs the automatic gearbox changes up at.
     *
     * @attribute
     * @type {number}
     */
    shiftUpRpm = 4000;

    /**
     * The revs the automatic gearbox changes down at. Keep a wide margin below {@link shiftUpRpm},
     * or the box will hunt between two gears.
     *
     * @attribute
     * @type {number}
     */
    shiftDownRpm = 1600;

    /**
     * How long a gear change takes, in seconds. No torque reaches the wheels while it lasts, which
     * is the pause you feel on an upshift.
     *
     * @attribute
     * @type {number}
     */
    shiftTime = 0.3;

    /**
     * The steering angle at full lock at low speed, in degrees. With {@link ackermann} on this is
     * the average across the steered wheels, so the inner wheel of a turn goes beyond it.
     *
     * @attribute
     * @type {number}
     */
    maxSteerAngle = 32;

    /**
     * How quickly the road wheels chase the steering input, in fractions of the remaining angle per
     * second.
     *
     * @attribute
     * @type {number}
     */
    steerRate = 5;

    /**
     * The fraction of full lock still available once the car is travelling at
     * {@link highSpeedLockAt}. Full lock at speed is a spin, so cars wind the steering off as they
     * gather pace.
     *
     * @attribute
     * @type {number}
     */
    highSpeedLock = 0.35;

    /**
     * The speed, in km/h, at which the steering has wound off to {@link highSpeedLock}.
     *
     * @attribute
     * @type {number}
     */
    highSpeedLockAt = 90;

    /**
     * Whether to steer the inner wheel harder than the outer one, so that both roll about the same
     * turn center instead of scrubbing. Needs a steered and an unsteered axle to measure the
     * wheelbase between.
     *
     * @attribute
     * @type {boolean}
     */
    ackermann = true;

    /**
     * The braking force at a wheel with a {@link VehicleWheel#brakeFactor} of 1, in Newtons.
     *
     * @attribute
     * @type {number}
     */
    maxBrakeForce = 6000;

    /**
     * The braking force the handbrake applies, at a wheel with a
     * {@link VehicleWheel#handbrakeFactor} of 1.
     *
     * @attribute
     * @type {number}
     */
    handbrakeForce = 12000;

    /**
     * How hard the car slows while rolling with the throttle shut, as a fraction of
     * {@link maxBrakeForce}. Bullet models no drag at all, so without this a car coasts for ever.
     * Once stopped the full brake is applied instead, to hold the car still.
     *
     * @attribute
     * @type {number}
     */
    engineBraking = 0.07;

    /**
     * How long the car must lie over, settled, before it is set back on its wheels, in seconds, or 0
     * to leave a fallen car where it lies. The delay is what tells a crash apart from a moment of a
     * jump - a car in the middle of one passes through the same angles, but not for anything like as
     * long - and the car has to have stopped turning as well, so that one still rolling is left to
     * find its own way back up.
     *
     * @attribute
     * @type {number}
     */
    rightingDelay = 2;

    /**
     * The steering input, from -1 for full left lock to 1 for full right lock.
     *
     * @type {number}
     */
    steer = 0;

    /**
     * The throttle input, from -1 for full reverse to 1 for full throttle. Asking for the opposite
     * of the way the car is already rolling brakes instead of changing gear.
     *
     * @type {number}
     */
    throttle = 0;

    /**
     * Whether the handbrake is pulled.
     *
     * @type {boolean}
     */
    handbrake = false;

    /**
     * The Ammo vehicle, once a wheel has arrived to build it for.
     *
     * @type {*}
     */
    _vehicle = null;

    /** @type {*} */
    _tuning = null;

    /** @type {*} */
    _raycaster = null;

    /**
     * The chassis body the vehicle was built around. Bullet keeps the body it is given for the
     * vehicle's whole life, while the engine builds a new one whenever the collision shape changes,
     * so this is watched rather than assumed.
     *
     * @type {*}
     */
    _body = null;

    /**
     * The wheels Bullet knows about, in the order they were added.
     *
     * @type {VehicleWheel[]}
     */
    _wheels = [];

    /**
     * Wheels that have announced themselves but are not yet in the simulation. A wheel can arrive
     * before this script has initialized, so this is a field rather than set up in `initialize`.
     *
     * @type {VehicleWheel[]}
     */
    _pending = [];

    /**
     * The braking force at each wheel this frame, held between the two passes of the update rather
     * than rebuilt, so that a script running every frame allocates nothing.
     *
     * @type {number[]}
     */
    _brakes = [];

    /** The eased steering angle, in radians. */
    _angle = 0;

    /** The selected gear: 1 upwards for the forward gears, -1 for reverse. */
    _gear = 1;

    /** Seconds left of the gear change in progress. */
    _shiftTimer = 0;

    /** The engine speed, in revolutions per minute. */
    _rpm = 0;

    /** Whether the car is being held at rest, having stopped with the throttle shut. */
    _holding = false;

    /** How long the car has been lying over, in seconds. */
    _fallenFor = 0;

    /** The distance between the steered and unsteered axles, or 0 if it cannot be measured. */
    _wheelbase = 0;

    /** The radius the driven wheels turn the engine through. */
    _driveRadius = 0.35;

    initialize() {
        this._spawnPosition = this.entity.getPosition().clone();
        this._spawnRotation = this.entity.getRotation().clone();

        this.app.on('vehicle:reset', this.reset, this);
        this.on('enable', () => this._vehicle && this._world.addAction(this._vehicle));
        this.on('disable', () => this._vehicle && this._world.removeAction(this._vehicle));
        this.on('destroy', () => {
            this.app.off('vehicle:reset', this.reset, this);
            this._destroy();
        });
    }

    /**
     * The speed the chassis is travelling at, in km/h, negative when reversing.
     *
     * @type {number}
     */
    get speed() {
        return this._vehicle ? this._vehicle.getCurrentSpeedKmHour() * MIRROR : 0;
    }

    /**
     * The engine speed, in revolutions per minute.
     *
     * @type {number}
     */
    get rpm() {
        return this._rpm;
    }

    /**
     * The selected gear: 1 upwards for the forward gears, -1 for reverse.
     *
     * @type {number}
     */
    get gear() {
        return this._gear;
    }

    /**
     * Whether a gear change is under way, during which no torque reaches the wheels.
     *
     * @type {boolean}
     */
    get shifting() {
        return this._shiftTimer > 0;
    }

    /**
     * The wheels in the simulation, in the order they were added.
     *
     * @type {VehicleWheel[]}
     */
    get wheels() {
        return this._wheels;
    }

    /**
     * The native Bullet world. Read on use rather than kept, because it does not exist until the
     * Ammo module has loaded.
     *
     * @type {*}
     */
    get _world() {
        return this.app.systems.rigidbody.dynamicsWorld;
    }

    /**
     * Puts the car back where it started, stopped and in first, and lets the springs go slack so it
     * settles rather than bouncing off the line.
     */
    reset() {
        const { rigidbody } = this.entity;
        rigidbody.teleport(this._spawnPosition, this._spawnRotation);
        rigidbody.linearVelocity = Vec3.ZERO;
        rigidbody.angularVelocity = Vec3.ZERO;

        this.steer = 0;
        this.throttle = 0;
        this._angle = 0;
        this._gear = 1;
        this._shiftTimer = 0;
        this._vehicle?.resetSuspension();
    }

    /**
     * Whether the car is lying on its roof or its side.
     *
     * @type {boolean}
     */
    get fallen() {
        return this.entity.up.y < FALLEN;
    }

    /**
     * Sets the car back on its wheels where it has come to rest, facing the way it was already
     * pointing. Nothing about the simulation recovers a car from its roof on its own, and putting it
     * back at the start line would throw away the drive that got it out here - so it is righted in
     * place, and only its attitude is discarded.
     *
     * The heading is taken from the forward axis flattened into the ground plane rather than from
     * the euler angles, which stop meaning anything useful once a body is upside down.
     */
    right() {
        if (!this._wheels.length) {
            return;
        }

        const { rigidbody } = this.entity;
        const forward = this.entity.forward;
        const heading = Math.atan2(-forward.x, -forward.z) * math.RAD_TO_DEG;
        const position = this.entity.getPosition();

        // Set it down at its own ride height above whatever it is lying on, rather than at the
        // height it happens to be at now - on its side the body sits about half its width up.
        const clearance = this._wheels.reduce((most, wheel) =>
            Math.max(most, wheel.radius - wheel._hub.y), 0);

        rigidbody.teleport(position.x, this._groundBelow(position) + clearance + RIGHTING_LIFT,
            position.z, 0, heading, 0);
        rigidbody.linearVelocity = Vec3.ZERO;
        rigidbody.angularVelocity = Vec3.ZERO;

        this._angle = 0;
        this._fallenFor = 0;
        this._vehicle?.resetSuspension();
    }

    /**
     * The height of whatever is under a point, ignoring the car itself and anything stacked above
     * it. Falls back to the point's own height if the ray finds nothing at all, which leaves a car
     * that has gone over the edge of the world where it is rather than teleporting it.
     *
     * @param {Vec3} position - The point to look beneath.
     * @returns {number} The height found.
     */
    _groundBelow(position) {
        const hits = this.app.systems.rigidbody.raycastAll(
            tmpVec.set(position.x, position.y + 50, position.z),
            tmpDir.set(position.x, position.y - 50, position.z)
        );

        let ground = null;
        for (const hit of hits) {
            const y = hit.point.y;
            if (hit.entity === this.entity || y > position.y + 2) {
                continue;
            }
            if (ground === null || y > ground) {
                ground = y;
            }
        }
        return ground ?? position.y;
    }

    /**
     * Counts how long the car has been lying over, and rights it once that passes
     * {@link rightingDelay}.
     *
     * @param {number} dt - The time step.
     */
    _recover(dt) {
        // A car still turning over may yet come down on its wheels by itself, and taking that away
        // from it would be worse than leaving it. So the count runs only while the car is both lying
        // over and no longer tumbling, and any roll fast enough to recover from starts it again.
        const tumbling = this.entity.rigidbody.angularVelocity.length() > SETTLED;
        if (this.rightingDelay <= 0 || !this.fallen || tumbling) {
            this._fallenFor = 0;
            return;
        }

        this._fallenFor += dt;
        if (this._fallenFor >= this.rightingDelay) {
            this.right();
        }
    }

    /**
     * Takes a wheel's word that it belongs to this vehicle. Called from
     * {@link VehicleWheel#initialize}, which may run before or after this script's own
     * `initialize`, and long before if the wheel came from a model that had yet to load.
     *
     * @param {VehicleWheel} wheel - The wheel joining the vehicle.
     */
    _attach(wheel) {
        this._pending.push(wheel);
    }

    /**
     * Builds the vehicle around the chassis body. Returns false while Ammo, the body or the world
     * is still missing.
     *
     * @returns {boolean} Whether the vehicle now exists.
     */
    _create() {
        const { Ammo } = globalThis;
        const body = this.entity.rigidbody?.body;
        const world = this._world;
        if (!Ammo || !body || !world) {
            return false;
        }

        this._tuning = new Ammo.btVehicleTuning();
        this._raycaster = new Ammo.btDefaultVehicleRaycaster(world);
        this._vehicle = new Ammo.btRaycastVehicle(this._tuning, body, this._raycaster);
        this._vehicle.setCoordinateSystem(0, 1, 2);

        body.setActivationState(DISABLE_DEACTIVATION);
        world.addAction(this._vehicle);
        this._body = body;

        return true;
    }

    /**
     * Throws the vehicle away and builds it again around the current body, putting the wheels back
     * in the queue they arrived through. Each wheel keeps the pose it was authored in rather than
     * measuring itself again, since by now the simulation has been moving it for some time.
     */
    _rebuild() {
        this._destroy();
        this._pending.push(...this._wheels);
        this._wheels.length = 0;
        for (const wheel of this._pending) {
            wheel._index = -1;
        }
    }

    _destroy() {
        if (!this._vehicle) {
            return;
        }
        const { Ammo } = globalThis;
        this._world?.removeAction(this._vehicle);
        Ammo.destroy(this._vehicle);
        Ammo.destroy(this._raycaster);

        // The tuning is deliberately left alone. Ammo binds no destructor for it, so asking to free
        // it dispatches through a virtual table slot that does not exist and takes the whole module
        // down with it - a few leaked bytes per vehicle is the better of the two outcomes.
        this._vehicle = null;
        this._raycaster = null;
        this._tuning = null;
        this._body = null;
    }

    /**
     * Moves waiting wheels into the simulation, then remeasures the car around them.
     */
    _admit() {
        tmpMat.copy(this.entity.getWorldTransform()).invert();

        for (const wheel of this._pending) {
            wheel._addTo(this, this._vehicle, this._tuning, tmpMat);
            this._wheels.push(wheel);
        }
        this._pending.length = 0;

        // Where a spring is mounted depends on how many corners share the car's weight, so every
        // mount is placed again whenever the set of wheels changes rather than once per wheel.
        const share = this.app.systems.rigidbody.gravity.length() / this._wheels.length;
        for (const wheel of this._wheels) {
            wheel._mount(share);
        }
        this._vehicle.resetSuspension();

        const steered = this._wheels.filter(wheel => wheel.steerFactor !== 0);
        const fixed = this._wheels.filter(wheel => wheel.steerFactor === 0);
        const meanZ = list => list.reduce((total, wheel) => total + wheel._hub.z, 0) / list.length;
        this._wheelbase = steered.length && fixed.length ? Math.abs(meanZ(steered) - meanZ(fixed)) : 0;

        const driven = this._wheels.filter(wheel => wheel.driveFactor !== 0);
        const radii = driven.length ? driven : this._wheels;
        this._driveRadius = radii.reduce((total, wheel) => total + wheel.radius, 0) / radii.length;
    }

    /**
     * The angle to steer one wheel to, so that every steered wheel rolls about the same turn center
     * instead of scrubbing across it. The inner wheel of a turn traces the tighter circle, so it
     * turns further.
     *
     * @param {VehicleWheel} wheel - The wheel to steer.
     * @param {number} angle - The average steering angle asked for, in radians.
     * @returns {number} The angle for this wheel, in radians.
     */
    _steerFor(wheel, angle) {
        if (!this.ackermann || !this._wheelbase || Math.abs(angle) < 1e-4) {
            return angle * wheel.steerFactor;
        }

        const radius = this._wheelbase / Math.tan(Math.abs(angle));
        const inner = Math.sign(wheel._hub.x) === Math.sign(angle);
        const offset = Math.abs(wheel._hub.x) * (inner ? -1 : 1);
        const magnitude = Math.atan(this._wheelbase / Math.max(radius + offset, 0.1));

        return Math.sign(angle) * magnitude * wheel.steerFactor;
    }

    /**
     * The fraction of peak torque the engine makes at the given revs: climbing off idle, peaking,
     * then tailing away as the limiter approaches.
     *
     * @param {number} rpm - The engine speed.
     * @returns {number} The fraction of peak torque, from 0 to 1.
     */
    _torqueAt(rpm) {
        if (rpm <= this.peakTorqueRpm) {
            const climb = (rpm - this.idleRpm) / Math.max(this.peakTorqueRpm - this.idleRpm, 1);
            return math.lerp(0.55, 1, math.clamp(climb, 0, 1));
        }
        const fade = (rpm - this.peakTorqueRpm) / Math.max(this.maxRpm - this.peakTorqueRpm, 1);
        return math.lerp(1, 0.6, math.clamp(fade, 0, 1));
    }

    /**
     * Chooses a gear and turns the throttle into a force at the contact patch. The engine is not
     * simulated as a spinning mass of its own: its speed follows the driven wheels through whatever
     * gear is engaged, which is what a car with the clutch out does.
     *
     * @param {number} dt - The time step.
     * @param {number} throttle - The throttle input.
     * @param {number} speed - The road speed, in km/h.
     * @returns {number} The total drive force to share between the driven wheels, in Newtons.
     */
    _drive(dt, throttle, speed) {
        // Reverse is a gear, chosen at rest. Asking for it while still rolling forwards is a brake
        // request instead, handled by the caller.
        if (throttle < 0 && speed < STANDSTILL && this._gear > 0) {
            this._gear = -1;
        } else if (throttle > 0 && speed > -STANDSTILL && this._gear < 0) {
            this._gear = 1;
        }

        const reversing = this._gear < 0;
        const ratio = (reversing ? this.reverseGear : this.gears[this._gear - 1]) * this.finalDrive;
        const wheelRate = Math.abs(speed) / 3.6 / this._driveRadius;
        const revs = wheelRate * ratio * RAD_PER_SEC_TO_RPM;
        this._rpm = math.clamp(revs, this.idleRpm, this.maxRpm);

        this._shiftTimer = Math.max(0, this._shiftTimer - dt);
        if (!this.shifting && !reversing) {
            if (this._rpm >= this.shiftUpRpm && this._gear < this.gears.length) {
                this._gear++;
                this._shiftTimer = this.shiftTime;
            } else if (this._rpm <= this.shiftDownRpm && this._gear > 1) {
                this._gear--;
                this._shiftTimer = this.shiftTime;
            }
        }

        // Hitting the limiter cuts the fuel, and that is the only thing that gives the car a top
        // speed: reporting the revs as capped would not stop the engine pulling, so it would go on
        // accelerating however fast the wheels were already turning.
        const demand = reversing ? Math.max(-throttle, 0) : Math.max(throttle, 0);
        if (this.shifting || demand === 0 || revs >= this.maxRpm) {
            return 0;
        }

        const torque = demand * this.maxTorque * this._torqueAt(this._rpm);
        return (torque * ratio / this._driveRadius) * (reversing ? -1 : 1);
    }

    update(dt) {
        if (this._vehicle && this.entity.rigidbody?.body !== this._body) {
            this._rebuild();
        }
        if (!this._vehicle && !this._create()) {
            return;
        }
        if (this._pending.length) {
            this._admit();
        }
        if (!this._wheels.length) {
            return;
        }

        this._recover(dt);

        const speed = this.speed;
        const throttle = math.clamp(this.throttle, -1, 1);

        // Ease the road wheels towards the input rather than snapping to it: a step change in
        // steering angle is a step change in lateral force, which stands a tall car on two wheels.
        // The lock available winds off with speed, because full lock at speed is a spin.
        const lock = math.lerp(1, this.highSpeedLock, math.clamp(Math.abs(speed) / this.highSpeedLockAt, 0, 1));
        const target = math.clamp(this.steer, -1, 1) * this.maxSteerAngle * math.DEG_TO_RAD * lock;
        this._angle = math.lerp(this._angle, target, Math.min(1, this.steerRate * dt));

        // Asking for the opposite of the way the car is rolling is a brake request, not a gear
        // change. Below walking pace it becomes a gear change, which _drive handles.
        const opposing = (throttle > 0 && speed < -STANDSTILL) || (throttle < 0 && speed > STANDSTILL);
        const braking = opposing ? Math.abs(throttle) : 0;

        // With the throttle shut a car slows on engine braking, and once stopped it stays stopped.
        // Bullet gives neither: it models no drag at all, and it applies a brake as an impulse at
        // the contact patch whether the wheel is turning or not - which at a standstill pitches the
        // car onto its nose and ratchets it slowly along the ground. So the coasting brake is light
        // while the car is rolling and firm once it has stopped, where it does no harm.
        //
        // The hold latches until the driver asks for drive again, rather than lifting as soon as the
        // car inches forward: on any slope the light braking that slows a rolling car cannot hold a
        // stationary one, so a parked car would creep away and then keep going.
        if (throttle !== 0) {
            this._holding = false;
        } else if (Math.abs(speed) < STANDSTILL) {
            this._holding = true;
        }
        const coasting = throttle !== 0 ? 0 : (this._holding ? 1 : this.engineBraking);
        const brake = Math.max(braking, coasting) * this.maxBrakeForce;

        const drive = braking ? 0 : this._drive(dt, throttle, speed);

        // Bullet gives a wheel's engine force precedence over its brake, so a braked wheel is left
        // out of the drive entirely - otherwise pulling the handbrake with the throttle open would
        // do nothing at all. What that wheel would have taken goes to the ones still free to pull,
        // which is what throws the back of the car out.
        let share = 0;
        for (let i = 0; i < this._wheels.length; i++) {
            const wheel = this._wheels[i];
            const held = this.handbrake ? this.handbrakeForce * wheel.handbrakeFactor : 0;
            this._brakes[i] = Math.max(brake * wheel.brakeFactor, held);
            share += this._brakes[i] ? 0 : wheel.driveFactor;
        }

        const step = this.app.systems.rigidbody.fixedTimeStep;
        for (let i = 0; i < this._wheels.length; i++) {
            const wheel = this._wheels[i];
            const torque = this._brakes[i] || !share ? 0 : (drive * wheel.driveFactor) / share;
            wheel._apply(torque, this._brakes[i], this._steerFor(wheel, this._angle), step);
        }
    }

    postUpdate() {
        // The wheels are placed after the rigid body system has stepped the simulation, which the
        // postUpdate pass guarantees whatever order the component systems were registered in.
        for (const wheel of this._wheels) {
            wheel._sync();
        }
    }
}

/**
 * One wheel of a {@link Vehicle}, on an entity beneath the chassis.
 *
 * The entity's authored position is the hub: where the wheel sits with the car's weight on it. From
 * the moment the vehicle takes the wheel on, that entity is placed by the simulation each frame, so
 * anything that draws the wheel belongs to a child of it - which is also where a tire model's own
 * orientation is corrected, since the simulated wheel spins about its local X axis.
 *
 * What the wheel does is authored here rather than inferred from where it sits: {@link steerFactor},
 * {@link driveFactor}, {@link brakeFactor} and {@link handbrakeFactor} are fractions rather than
 * flags, so a torque split, a brake bias or a rear axle that steers slightly against the front are
 * all just numbers on a wheel.
 */
export class VehicleWheel extends Script {
    static scriptName = 'vehicleWheel';

    /**
     * The rolling radius of the wheel, in meters. This is the distance the ray reports a contact
     * at, so it sets how high the car rides as much as how fast the wheel appears to spin.
     *
     * @attribute
     * @type {number}
     */
    radius = 0.35;

    /**
     * The length of the suspension at full extension, in meters, measured down from its mount.
     *
     * @attribute
     * @type {number}
     */
    suspensionRestLength = 0.4;

    /**
     * The spring rate. Bullet's guide values run from 10 for an off-roader through 50 for a sports
     * car to 200 for a racing car. Bullet scales the spring force by the chassis mass, so this does
     * not have to be retuned when the car gets heavier.
     *
     * @attribute
     * @type {number}
     */
    suspensionStiffness = 20;

    /**
     * The damping as the suspension extends. Bullet suggests keeping this near
     * `0.46 * sqrt(stiffness)`; too little and the car pogos after a landing.
     *
     * @attribute
     * @type {number}
     */
    suspensionDamping = 2.3;

    /**
     * The damping as the suspension compresses, conventionally around 1.5 times the relaxation
     * damping.
     *
     * @attribute
     * @type {number}
     */
    suspensionCompression = 4.4;

    /**
     * How far the suspension may travel from its rest length, in meters.
     *
     * @attribute
     * @type {number}
     */
    maxSuspensionTravel = 0.3;

    /**
     * The ceiling on the force this spring may push the chassis with, in Newtons. Set it too low
     * and a heavy car bottoms out on landing.
     *
     * @attribute
     * @type {number}
     */
    maxSuspensionForce = 20000;

    /**
     * The grip of the tire: the friction coefficient of its contact. Around 1 slides freely and 3
     * corners hard. The very large values seen in older samples simply weld the car to the road.
     *
     * @attribute
     * @type {number}
     */
    grip = 2;

    /**
     * How much of this wheel's cornering force is allowed to roll the car, from 0 for a car that
     * cannot be tipped to 1 for the full physical moment. Tall vehicles need a little.
     *
     * @attribute
     * @type {number}
     */
    rollInfluence = 0.1;

    /**
     * How far outboard of the wheel's center its ray is cast, in meters, or 0 to cast it straight
     * down the middle.
     *
     * A raycast wheel has no width. It stands on a line, so the car pivots about the lines its
     * wheels stand on rather than about the outer edges of tires half a meter across, and it goes
     * over far more readily than the same vehicle would - the narrower the track and the higher the
     * body, the more it shows. Casting the ray a little further out buys back some of the width the
     * model cannot have. The wheel is still drawn where it belongs, not where the ray went.
     *
     * @attribute
     * @type {number}
     */
    trackOffset = 0;

    /**
     * How much of the steering angle this wheel takes. 1 is a front wheel, 0 a fixed one, and a
     * small negative value on a rear wheel steers it against the front to tighten the car's line.
     *
     * @attribute
     * @type {number}
     */
    steerFactor = 0;

    /**
     * This wheel's share of the drive. The shares are normalized across the car, so `1` on two
     * wheels and `1` on all four both send everything the engine makes to the road - what matters
     * is the ratio between them, which is the differential.
     *
     * @attribute
     * @type {number}
     */
    driveFactor = 0;

    /**
     * How much of the braking force reaches this wheel. Front wheels usually take more, since
     * braking throws the car's weight forward onto them.
     *
     * @attribute
     * @type {number}
     */
    brakeFactor = 1;

    /**
     * How much of the handbrake force reaches this wheel. A handbrake acts on the rear wheels only,
     * which is what lets it break the back of the car loose.
     *
     * @attribute
     * @type {number}
     */
    handbrakeFactor = 0;

    /**
     * The names of the parts that visibly follow this wheel's travel, separated by spaces - a
     * wishbone, a trailing arm, a coilover, a tie rod. Each one must have its own origin at the
     * point it pivots on the chassis, and each is turned about that pivot to keep reaching the hub.
     *
     * A coilover does not really pivot about the hub - its lower end is bolted to the arm - but
     * only the change in angle is used, not the direction itself, so it keeps the pose it was
     * modeled in and moves by about the right amount.
     *
     * @attribute
     * @type {string}
     */
    linkage = '';

    /**
     * The axis the linkage hinges about, in the chassis's frame. A wishbone swings in the vertical
     * plane across the car, so it hinges about the car's length - `0 0 1`. A trailing arm reaching
     * back from the chassis hinges about `1 0 0` instead.
     *
     * @attribute
     * @type {Vec3}
     */
    linkageAxis = new Vec3(0, 0, 1);

    /**
     * The vehicle this wheel belongs to, or null while it has not found one.
     *
     * @type {Vehicle|null}
     */
    _host = null;

    /** @type {*} */
    _vehicle = null;

    /** This wheel's index in the Bullet vehicle, or -1 before it is added. */
    _index = -1;

    /**
     * The authored hub position, in the chassis's frame - the only frame the car's geometry is
     * fixed in.
     *
     * @type {Vec3}
     */
    _hub = new Vec3();

    /**
     * Each linkage part, and the pose it was authored in: its pivot and the way it reached to meet
     * the hub, both in the chassis's frame, and how it was turned relative to the chassis.
     *
     * @type {{ entity: Entity, pivot: Vec3, rest: Vec3, rotation: Quat }[]}
     */
    _linkage = [];

    /** The normalized hinge axis. @type {Vec3} */
    _axis = new Vec3();

    /** Whether the tire was on the ground when the frame's simulation ended. */
    _contact = false;

    /** Whether the authored pose has been recorded, which happens once and never again. */
    _captured = false;

    initialize() {
        for (let node = this.entity.parent; node; node = node.parent) {
            const host = node.script?.vehicle;
            if (host) {
                this._host = host;
                host._attach(this);
                return;
            }
        }
        console.warn(`vehicleWheel on '${this.entity.name}' found no vehicle above it`);
    }

    /**
     * Bullet's record for this wheel, fetched on every use and never kept.
     *
     * Bullet holds the wheels in an array that reallocates as it grows, so the reference `addWheel`
     * returns dies the moment another wheel is added - silently, and with the settings written
     * through it landing in freed memory. Reading the record back by index is the only safe way to
     * hold one for longer than the call that produced it.
     *
     * @type {*}
     */
    get _info() {
        return this._index < 0 ? null : this._vehicle.getWheelInfo(this._index);
    }

    /**
     * Whether the tire is on the ground. A wheel in the air neither drives nor steers the car.
     *
     * Sampled once a frame in {@link _sync} rather than read here, because Bullet clears the flag
     * as the first act of working out where a wheel is - so by the time anything outside the
     * simulation could ask, every wheel claims to be airborne.
     *
     * @type {boolean}
     */
    get contact() {
        return this._contact;
    }

    /**
     * How much the tire is slipping, from 0 for full grip to 1 for none - wheelspin under power,
     * a locked wheel under braking, or a slide through a corner.
     *
     * @type {number}
     */
    get slip() {
        return this._info ? 1 - this._info.get_m_skidInfo() : 0;
    }

    /**
     * How far the spring is compressed, from 0 at full extension to 1 at the bump stop.
     *
     * @type {number}
     */
    get compression() {
        if (!this._info) {
            return 0;
        }
        const length = this._info.get_m_raycastInfo().get_m_suspensionLength();
        return math.clamp(1 - length / this.suspensionRestLength, 0, 1);
    }

    /**
     * Adds the wheel to the Bullet vehicle and records the pose the model was authored in.
     *
     * @param {Vehicle} host - The vehicle script.
     * @param {*} vehicle - The Bullet vehicle.
     * @param {*} tuning - The shared tuning, whose values are all overwritten below.
     * @param {Mat4} toChassis - The transform from world space into the chassis's frame.
     */
    _addTo(host, vehicle, tuning, toChassis) {
        const { Ammo } = globalThis;

        this._host = host;
        this._vehicle = vehicle;
        this._index = vehicle.getNumWheels();
        this._axis.copy(this.linkageAxis).normalize();

        // Only the first time: from here on the simulation places this entity, so asking it where it
        // is would return wherever the wheel happens to be rather than where it was authored.
        if (!this._captured) {
            this._capture(host, toChassis);
            this._captured = true;
        }

        const mount = new Ammo.btVector3(this._rayX, this._hub.y, this._hub.z);
        const direction = new Ammo.btVector3(0, -1, 0);
        const axle = new Ammo.btVector3(-1, 0, 0);

        // The reference addWheel hands back is deliberately dropped - see _info for why.
        vehicle.addWheel(mount, direction, axle, this.suspensionRestLength, this.radius, tuning,
            this.steerFactor !== 0);

        Ammo.destroy(mount);
        Ammo.destroy(direction);
        Ammo.destroy(axle);

        const info = this._info;
        info.set_m_suspensionStiffness(this.suspensionStiffness);
        info.set_m_wheelsDampingRelaxation(this.suspensionDamping);
        info.set_m_wheelsDampingCompression(this.suspensionCompression);
        info.set_m_maxSuspensionTravelCm(this.maxSuspensionTravel * 100);
        info.set_m_maxSuspensionForce(this.maxSuspensionForce);
        info.set_m_frictionSlip(this.grip);
        info.set_m_rollInfluence(this.rollInfluence);

    }

    /**
     * Records the pose the model was authored in: where the hub sits, and for each linkage part
     * where it pivots, which way it reached to meet the hub and how it was turned - all in the
     * chassis's frame, the only frame the car's geometry is fixed in.
     *
     * @param {Vehicle} host - The vehicle script.
     * @param {Mat4} toChassis - The transform from world space into the chassis's frame.
     */
    _capture(host, toChassis) {
        toChassis.transformPoint(this.entity.getPosition(), this._hub);

        for (const name of this.linkage.split(' ').filter(Boolean)) {
            const part = host.entity.findByName(name);
            if (!part) {
                console.warn(`vehicleWheel on '${this.entity.name}' found no linkage named '${name}'`);
                continue;
            }
            const pivot = toChassis.transformPoint(part.getPosition(), new Vec3());
            const rest = this._flatten(tmpVec.copy(this._hub).sub(pivot), new Vec3());
            const rotation = new Quat().copy(host.entity.getRotation()).invert().mul(part.getRotation());
            this._linkage.push({ entity: part, pivot, rest, rotation });
        }
    }

    /**
     * Places the top of the suspension. The authored hub position is where the wheel sits with the
     * car's weight on it, and Bullet measures the spring downwards from its mount, so the mount
     * belongs above the hub - but by less than a full rest length, or the car would settle onto its
     * springs and sink below the pose it was modeled in. Bullet scales spring force by chassis
     * mass, so the sag a spring settles at depends only on the load it carries and its stiffness.
     *
     * @param {number} share - This wheel's share of gravity, in m/s^2.
     */
    _mount(share) {
        const { Ammo } = globalThis;
        const sag = Math.min(share / this.suspensionStiffness, this.suspensionRestLength);

        const mount = new Ammo.btVector3(this._rayX, this._hub.y + this.suspensionRestLength - sag, this._hub.z);
        this._info.set_m_chassisConnectionPointCS(mount);
        Ammo.destroy(mount);
    }

    /**
     * Where across the car this wheel's ray is cast, which is its own center pushed outboard by
     * {@link trackOffset}.
     *
     * @type {number}
     */
    get _rayX() {
        return this._hub.x + Math.sign(this._hub.x) * this.trackOffset;
    }

    /**
     * Hands the wheel's three inputs to Bullet, and is the only place any of them is written - so
     * both of the conversions the boundary needs live here and nowhere else.
     *
     * Drive and steering run along the vehicle's forward axis, which Bullet has mirrored, so both
     * change sign. The brake changes units instead: Bullet turns an engine force into an impulse
     * itself, by the step it is about to take, but it takes the brake as an impulse limit already -
     * so the same number in the two calls would mean two very different things, and a brake quoted
     * in Newtons would come out sixty times too strong.
     *
     * @param {number} drive - The drive force at the contact patch, in Newtons.
     * @param {number} brake - The braking force, in Newtons.
     * @param {number} steer - The steering angle, in radians.
     * @param {number} step - The physics step Bullet is about to take, in seconds.
     */
    _apply(drive, brake, steer, step) {
        this._vehicle.applyEngineForce(drive * MIRROR, this._index);
        this._vehicle.setBrake(brake * step, this._index);
        this._vehicle.setSteeringValue(steer * MIRROR, this._index);
    }

    /**
     * Moves the wheel entity to wherever the simulation put it, and swings the arm to follow.
     */
    _sync() {
        this._contact = this._info.get_m_raycastInfo().get_m_isInContact();

        this._vehicle.updateWheelTransform(this._index, true);
        const transform = this._vehicle.getWheelTransformWS(this._index);
        const p = transform.getOrigin();
        const q = transform.getRotation();

        let x = p.x();
        let y = p.y();
        let z = p.z();

        // Bring the wheel back inboard of its ray. The widened track is a stand-in for a contact
        // patch, not a claim about where the tire sits, so nothing about it should be visible.
        if (this.trackOffset) {
            const right = this._host.entity.right;
            const back = -Math.sign(this._hub.x) * this.trackOffset;
            x += right.x * back;
            y += right.y * back;
            z += right.z * back;
        }

        // The linkage is swung before the wheel is placed, in case the model hangs the wheel off
        // the arm: the wheel's world transform is set outright, so it lands correctly either way.
        if (this._linkage.length) {
            this._swing(x, y, z);
        }

        this.entity.setPosition(x, y, z);
        this.entity.setRotation(q.x(), q.y(), q.z(), q.w());
    }

    /**
     * Turns each linkage part about its hinge until it reaches the hub again. The two directions are
     * compared in the chassis's frame, so the linkage stays honest however the car is lying, and the
     * hub is the one the simulation reported rather than the wheel entity's - which is what keeps
     * this correct on a model that parents the wheel to the arm.
     *
     * @param {number} x - The hub's world space x coordinate.
     * @param {number} y - The hub's world space y coordinate.
     * @param {number} z - The hub's world space z coordinate.
     */
    _swing(x, y, z) {
        const chassis = this._host.entity;

        tmpMat.copy(chassis.getWorldTransform()).invert();
        const hub = tmpMat.transformPoint(tmpVec.set(x, y, z), tmpVec);

        for (const part of this._linkage) {
            const direction = this._flatten(tmpDir.copy(hub).sub(part.pivot), tmpDir);
            const angle = Math.atan2(tmpCross.cross(part.rest, direction).dot(this._axis),
                part.rest.dot(direction));

            tmpHinge.setFromAxisAngle(this._axis, angle * math.RAD_TO_DEG);
            part.entity.setRotation(tmpRot.copy(chassis.getRotation()).mul(tmpHinge).mul(part.rotation));
        }
    }

    /**
     * Projects a direction into the plane the arm swings in and normalizes it, so that only the
     * part of the geometry the hinge can reach is compared.
     *
     * @param {Vec3} direction - The direction to project.
     * @param {Vec3} result - The vector to write to.
     * @returns {Vec3} The projected direction.
     */
    _flatten(direction, result) {
        const along = tmpAxis.copy(this._axis).mulScalar(direction.dot(this._axis));
        return result.copy(direction).sub(along).normalize();
    }
}

/**
 * The controls for a sibling {@link Vehicle}, and the only thing that writes to it. The keyboard
 * is read here - WASD or the arrow keys, space for the handbrake, R to go back to the start - and
 * anything else that wants a say sets {@link steer}, {@link throttle} and {@link handbrake}
 * instead of writing to the vehicle, which is what keeps two sources of input from overwriting
 * each other frame by frame. On-screen buttons use it in this example; a gamepad or a recorded
 * lap would arrive the same way.
 */
export class VehicleInput extends Script {
    static scriptName = 'vehicleInput';

    /**
     * Steering asked for from outside this script, -1 for full left to 1 for full right, added to
     * whatever the keys are asking for.
     *
     * @type {number}
     */
    steer = 0;

    /**
     * Throttle asked for from outside this script, -1 for full brake to 1 for full throttle,
     * added to whatever the keys are asking for.
     *
     * @type {number}
     */
    throttle = 0;

    /**
     * Non-zero to pull the handbrake from outside this script.
     *
     * @type {number}
     */
    handbrake = 0;

    /** Whether the reset key was down last frame, so that holding it fires once. */
    _resetHeld = false;

    update() {
        const vehicle = this.entity.script?.vehicle;
        if (!vehicle) {
            return;
        }

        const { keyboard } = this.app;
        const held = (...keys) => keys.some(key => keyboard.isPressed(key));

        const throttle = (held(KEY_W, KEY_UP) ? 1 : 0) - (held(KEY_S, KEY_DOWN) ? 1 : 0);
        const steer = (held(KEY_D, KEY_RIGHT) ? 1 : 0) - (held(KEY_A, KEY_LEFT) ? 1 : 0);

        vehicle.throttle = math.clamp(throttle + this.throttle, -1, 1);
        vehicle.steer = math.clamp(steer + this.steer, -1, 1);
        vehicle.handbrake = held(KEY_SPACE) || this.handbrake !== 0;

        const reset = held(KEY_R);
        if (reset && !this._resetHeld) {
            this.app.fire('vehicle:reset');
        }
        this._resetHeld = reset;
    }
}
