import { Script, Vec3, math } from 'playcanvas';

/**
 * @import { Entity } from 'playcanvas';
 */

const tmpVec = new Vec3();
const tmpFrom = new Vec3();
const tmpTo = new Vec3();

/**
 * The shorter way round from one heading to another, in radians, so that a camera swinging past
 * south does not take the long way about.
 *
 * @param {number} from - The heading to turn from.
 * @param {number} to - The heading to turn to.
 * @returns {number} The signed angle between them, never more than half a turn.
 */
const shortest = (from, to) => {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) {
        delta -= Math.PI * 2;
    } else if (delta < -Math.PI) {
        delta += Math.PI * 2;
    }
    return delta;
};

/**
 * Trails a vehicle from behind and above, the way a driving game does it.
 *
 * The camera is not carried behind the vehicle: it orbits at a heading of its own, which chases the
 * vehicle's. That lag is what the shot is made of - turn hard and the camera is still pointing the
 * way you were going, so the vehicle swings across the frame and shows you its flank before the
 * camera comes round behind it. Following rigidly instead pins the vehicle dead center and reads as
 * though the scenery is what is turning.
 *
 * Three things keep it watchable over rough ground. The orbit is taken from the vehicle's heading
 * flattened into the ground plane, so a jump or a landing pitches the vehicle within the frame
 * rather than throwing the camera at the sky. It looks at a point above the vehicle rather than at
 * its origin, which sits the vehicle low in frame with the horizon in view. And it refuses to go
 * below the ground, because on a climb the ground behind a vehicle is higher than the vehicle is.
 */
export class ChaseCamera extends Script {
    static scriptName = 'chaseCamera';

    /**
     * The entity to follow.
     *
     * @attribute
     * @type {Entity}
     */
    target = null;

    /**
     * How far behind the target to orbit, in meters, when it is standing still.
     *
     * @attribute
     * @type {number}
     */
    distance = 8;

    /**
     * How far above the target to sit, in meters.
     *
     * @attribute
     * @type {number}
     */
    height = 2.8;

    /**
     * How high above the target to look, in meters. Aiming above the origin rather than at it drops
     * the vehicle into the lower half of the frame and leaves the horizon showing.
     *
     * @attribute
     * @type {number}
     */
    aim = 1.4;

    /**
     * How quickly the camera closes any gap in its position, in fractions of the remaining distance
     * per second. This takes the edge off bumps; the shape of a turn comes from {@link turnRate}.
     *
     * @attribute
     * @type {number}
     */
    rate = 8;

    /**
     * How quickly the camera swings round to sit behind the target again, in fractions of the
     * remaining angle per second. This is the dial that decides the character of the shot: high
     * values sit obediently behind the vehicle, low ones let it slide right across the frame
     * through a turn before the camera catches up.
     *
     * @attribute
     * @type {number}
     */
    turnRate = 2.4;

    /**
     * How much further back the camera drifts at speed, in meters, so that going fast reads as going
     * fast rather than as the scenery moving.
     *
     * @attribute
     * @type {number}
     */
    pullback = 3;

    /**
     * The speed, in km/h, at which the full {@link pullback} has been reached.
     *
     * @attribute
     * @type {number}
     */
    pullbackAt = 70;

    /**
     * How far above the ground the camera is kept, in meters, or 0 to let it go where it likes.
     * Needs a physics world to raycast against.
     *
     * @attribute
     * @type {number}
     */
    clearance = 1.2;

    /** The camera's own orbit heading, in radians, which chases the target's. */
    _heading = 0;

    /** The smoothed speed of the target, in m/s, measured from how far it actually travels. */
    _speed = 0;

    /** Whether the camera has taken up its position behind the target yet. */
    _placed = false;

    initialize() {
        this._position = this.entity.getPosition().clone();
        this._previous = new Vec3();
    }

    postUpdate(dt) {
        if (!this.target || dt <= 0) {
            return;
        }

        const target = this.target.getPosition();
        const forward = this.target.forward;
        const heading = Math.atan2(-forward.x, -forward.z);

        // Start behind the target rather than swinging round to it from wherever the camera was
        // authored, which would open the scene on a pan.
        const placing = !this._placed;
        if (placing) {
            this._heading = heading;
            this._previous.copy(target);
            this._placed = true;
        }

        // Speed is measured from the ground the target covers, not asked of its rigid body, so this
        // works for anything that moves - a physics vehicle, an animation, a tween.
        const traveled = tmpVec.copy(target).sub(this._previous).length();
        this._previous.copy(target);
        this._speed = math.lerp(this._speed, traveled / dt, 1 - Math.exp(-4 * dt));

        this._heading += shortest(this._heading, heading) * (1 - Math.exp(-this.turnRate * dt));

        const reached = Math.max(this.pullbackAt, 1) / 3.6;
        const reach = this.distance + this.pullback * math.clamp(this._speed / reached, 0, 1);

        tmpVec.set(
            target.x + Math.sin(this._heading) * reach,
            target.y + this.height,
            target.z + Math.cos(this._heading) * reach
        );
        this._position.lerp(this._position, tmpVec, placing ? 1 : 1 - Math.exp(-this.rate * dt));

        // Lifted after the smoothing, not before, or the camera would spend the climb easing its way
        // into the hill it is meant to be staying out of.
        const ground = this._groundBelow();
        if (ground !== null) {
            this._position.y = Math.max(this._position.y, ground + this.clearance);
        }

        this.entity.setPosition(this._position);
        this.entity.lookAt(target.x, target.y + this.aim, target.z);
    }

    /**
     * The height of the ground under the camera, or null if there is nothing to stand on - or no
     * physics world to ask.
     *
     * @returns {number|null} The height found.
     */
    _groundBelow() {
        const system = this.app.systems.rigidbody;
        if (this.clearance <= 0 || !system?.physicsWorld) {
            return null;
        }

        const { x, y, z } = this._position;
        const hit = system.raycastFirst(tmpFrom.set(x, y + 60, z), tmpTo.set(x, y - 60, z));
        return hit ? hit.point.y : null;
    }
}
