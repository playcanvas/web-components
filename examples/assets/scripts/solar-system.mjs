import { BoundingBox, Script, Vec3, math } from 'playcanvas';

/**
 * Computes the world-space bounds of an entity as the union of the axis-aligned bounding
 * boxes of all render components in its hierarchy.
 *
 * @param {import('playcanvas').Entity} entity - The entity to measure.
 * @returns {BoundingBox|null} The bounds, or null if the entity has no mesh instances.
 */
const computeWorldBounds = (entity) => {
    const aabb = new BoundingBox();
    let first = true;
    for (const render of entity.findComponents('render')) {
        for (const meshInstance of render.meshInstances) {
            if (first) {
                aabb.copy(meshInstance.aabb);
                first = false;
            } else {
                aabb.add(meshInstance.aabb);
            }
        }
    }
    return first ? null : aabb;
};

/**
 * Returns the radius (largest half-extent) of a bounding box.
 *
 * @param {BoundingBox} aabb - The bounding box.
 * @returns {number} The radius.
 */
const boundsRadius = (aabb) => {
    return Math.max(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z);
};

/**
 * Scales the entity so that the bounds of its render hierarchy match a target radius. Useful
 * for displaying models of wildly different intrinsic sizes at a consistent scale.
 */
export class NormalizeScale extends Script {
    static scriptName = 'normalizeScale';

    /**
     * The world-space radius to scale the entity's render bounds to.
     *
     * @attribute
     * @type {number}
     */
    radius = 1;

    initialize() {
        const bounds = computeWorldBounds(this.entity);
        if (bounds) {
            const factor = this.radius / boundsRadius(bounds);
            this.entity.setLocalScale(factor, factor, factor);
        }
    }
}

/**
 * Tilts the entity to its axial tilt once, then spins it continuously around its tilted
 * local Y axis.
 */
export class PlanetSpin extends Script {
    static scriptName = 'planetSpin';

    /**
     * The rotation speed in degrees per second. Negative values spin retrograde.
     *
     * @attribute
     * @type {number}
     */
    speed = 5;

    /**
     * The axial tilt in Euler degrees, applied once on initialize.
     *
     * @attribute
     * @type {Vec3}
     */
    tilt = new Vec3();

    initialize() {
        this.entity.setLocalEulerAngles(this.tilt.x, this.tilt.y, this.tilt.z);
    }

    update(dt) {
        this.entity.rotateLocal(0, this.speed * dt, 0);
    }
}

/**
 * Boosts the emissive intensity of every material in the entity's render hierarchy. Applied
 * once on initialize.
 */
export class SunGlow extends Script {
    static scriptName = 'sunGlow';

    /**
     * The emissive intensity to apply.
     *
     * @attribute
     * @type {number}
     */
    intensity = 6;

    initialize() {
        for (const render of this.entity.findComponents('render')) {
            for (const meshInstance of render.meshInstances) {
                const material = meshInstance.material;
                material.emissiveIntensity = this.intensity;
                material.update();
            }
        }
    }
}

/**
 * Overrides the radius the tour frames for this stop. Without it, a stop is framed on its
 * authored normalizeScale radius, which for a model much wider than its ball (e.g. Saturn's
 * rings) leaves the subject looking small - a tighter framing radius lets it fill the frame.
 */
export class TourStop extends Script {
    static scriptName = 'tourStop';

    /**
     * The world-space radius the tour should frame for this stop.
     *
     * @attribute
     * @type {number}
     */
    radius = 1;
}

/**
 * Drives the camera along a line of tour stops — the children of a target entity, in order,
 * plus a final overview pose. The page reports a fractional stop index by firing a 'tour:t'
 * event on the application (typically mapped from scroll position) and the camera chases it
 * with frame-rate independent damping, framing each stop off-center on alternating sides.
 */
export class PlanetTour extends Script {
    static scriptName = 'planetTour';

    /**
     * The entity whose children are the tour stops, in order.
     *
     * @attribute
     * @type {import('playcanvas').Entity}
     */
    planets = null;

    /**
     * The camera distance from each stop, as a multiple of the stop's radius.
     *
     * @attribute
     * @type {number}
     */
    frame = 7;

    /**
     * The lateral framing offset, as a fraction of the half viewport width. Stops alternate
     * sides, and the offset fades out on portrait aspect ratios to center the subject.
     *
     * @attribute
     * @type {number}
     */
    side = 0.35;

    /**
     * The camera height above each stop, as a fraction of the camera distance.
     *
     * @attribute
     * @type {number}
     */
    lift = 0.12;

    /**
     * The exponential rate at which the camera chases the requested stop index.
     *
     * @attribute
     * @type {number}
     */
    damping = 5;

    /**
     * The fraction of each segment spent holding on its stop before and after the transit,
     * so a subject stays framed while its narrative is in view. Must be below 0.5.
     *
     * @attribute
     * @type {number}
     */
    dwell = 0.18;

    /**
     * The idle drift amplitude multiplier. Set to 0 to disable drift.
     *
     * @attribute
     * @type {number}
     */
    drift = 1;

    /**
     * The camera position of the final overview stop.
     *
     * @attribute
     * @type {Vec3}
     */
    overviewPosition = new Vec3(7, -250, 22);

    /**
     * The look target of the final overview stop.
     *
     * @attribute
     * @type {Vec3}
     */
    overviewTarget = new Vec3(-20, -150, 0);

    initialize() {
        this._t = 0;
        this._target = 0;
        this._time = 0;
        this._stops = null;

        this._posA = new Vec3();
        this._posB = new Vec3();
        this._lookA = new Vec3();
        this._lookB = new Vec3();
        this._position = new Vec3();
        this._look = new Vec3();

        this.app.on('tour:t', (t) => {
            this._target = t;
        });

        // Adopt any progress the page reported before this script initialized (e.g. a
        // reload with restored scroll) - an event fired back then had no listener yet
        if (typeof this.app.tourT === 'number') {
            this._t = this.app.tourT;
            this._target = this.app.tourT;
        }
    }

    /**
     * Builds the tour stops from the children of the planets entity, with the overview pose
     * appended as the final stop. Stops center on the world bounds of their subject (models
     * are not necessarily centered on their entity's origin). The framing radius comes from
     * a tourStop override if present, else the authored normalizeScale radius - axial tilt
     * inflates a world-space AABB, so the measured bounds are only a fallback.
     *
     * @returns {object[]} The tour stops.
     */
    _buildStops() {
        const stops = this.planets.children.map((child) => {
            const bounds = computeWorldBounds(child);
            const override = child.script && child.script.tourStop;
            const normalize = child.script && child.script.normalizeScale;
            return {
                position: bounds ? bounds.center.clone() : child.getPosition().clone(),
                radius: (override && override.radius) ||
                    (normalize && normalize.radius) ||
                    (bounds ? boundsRadius(bounds) : 1)
            };
        });
        stops.push({
            position: this.overviewPosition.clone(),
            target: this.overviewTarget.clone()
        });
        return stops;
    }

    /**
     * Computes the camera pose for a stop. Regular stops frame their subject at a distance
     * proportional to its radius, biased sideways so the subject composes off-center; the
     * overview stop uses its explicit position and target.
     *
     * @param {number} index - The stop index.
     * @param {Vec3} position - The vector to receive the camera position.
     * @param {Vec3} look - The vector to receive the look target.
     */
    _stopPose(index, position, look) {
        const stop = this._stops[index];
        if (stop.target) {
            position.copy(stop.position);
            look.copy(stop.target);
            return;
        }

        const { width, height } = this.app.graphicsDevice;
        const aspect = width / Math.max(1, height);
        const fit = Math.min(1, aspect);
        const distance = stop.radius * this.frame / fit;

        position.set(
            stop.position.x,
            stop.position.y + distance * this.lift,
            stop.position.z + distance
        );

        // Bias the look target so the subject composes off-center: sideways on landscape
        // (alternating sides per stop) and upward on portrait, where the narrative sits
        // below the subject instead of beside it
        const halfHeight = Math.tan(this.entity.camera.fov * 0.5 * math.DEG_TO_RAD) * distance;
        const halfWidth = halfHeight * aspect;
        const ramp = math.clamp((aspect - 0.9) / 0.4, 0, 1);
        const sign = index % 2 === 0 ? 1 : -1;
        look.set(
            stop.position.x - sign * this.side * halfWidth * ramp,
            stop.position.y - 0.3 * halfHeight * (1 - ramp),
            stop.position.z
        );
    }

    postUpdate(dt) {
        if (!this.planets) return;

        // Build the stop list lazily so that sibling scripts (e.g. normalizeScale) have
        // already run their initialize()
        if (!this._stops) {
            this._stops = this._buildStops();
        }
        const count = this._stops.length;

        // Chase the requested stop index with frame-rate independent damping
        this._t += (this._target - this._t) * (1 - Math.exp(-this.damping * dt));
        this._time += dt;

        // Blend the camera pose between the two neighboring stops. The blend holds on each
        // stop for the dwell fraction at both ends of the segment (keeping the subject
        // framed while its narrative is read) and eases through the transit between them
        const t = math.clamp(this._t, 0, count - 1);
        const index = Math.max(0, Math.min(Math.floor(t), count - 2));
        const next = Math.min(index + 1, count - 1);
        const span = Math.max(0.0001, 1 - 2 * this.dwell);
        let blend = math.clamp((t - index - this.dwell) / span, 0, 1);
        blend = blend * blend * (3 - 2 * blend);

        this._stopPose(index, this._posA, this._lookA);
        this._stopPose(next, this._posB, this._lookB);

        this._position.lerp(this._posA, this._posB, blend);
        this._look.lerp(this._lookA, this._lookB, blend);

        // A gentle idle drift, scaled to the current viewing distance
        const sway = this._position.distance(this._look) * 0.02 * this.drift;
        this._position.x += Math.sin(this._time * 0.4) * sway;
        this._position.y += Math.cos(this._time * 0.3) * sway * 0.7;

        this.entity.setPosition(this._position);
        this.entity.lookAt(this._look);
    }
}
