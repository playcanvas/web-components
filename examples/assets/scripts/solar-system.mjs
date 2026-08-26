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
 * Drives the camera as a probe flying the line of tour stops — the children of a target
 * entity, in order, plus a final overview pose. The page reports a fractional stop index by
 * firing a 'tour:t' event on the application (typically mapped from scroll position) and the
 * camera follows it directly, so the shot is a function of the scroll rather than of elapsed
 * time. The stops are not framings cut between but points on one continuous trajectory: the
 * probe coasts down the line of subjects, passing each at that stop's framing distance, and
 * keeps the subject it is passing in shot until the pass is over before slewing to the next.
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
     * The distance the probe passes each stop at, as a multiple of the stop radius.
     *
     * @attribute
     * @type {number}
     */
    frame = 7;

    /**
     * The lateral framing offset, as a fraction of the half viewport width. Stops alternate
     * sides, and the offset gives way to `rise` on portrait aspect ratios.
     *
     * @attribute
     * @type {number}
     */
    side = 0.35;

    /**
     * The vertical framing offset, as a fraction of the half viewport height. The portrait
     * counterpart of `side`: where a landscape viewport seats the narrative beside the
     * subject, a portrait one stacks it below, so the subject has to lift clear of it.
     *
     * @attribute
     * @type {number}
     */
    rise = 0.6;

    /**
     * The exponential smoothing applied to the reported stop index, in seconds. The camera is
     * a function of scroll position, so smoothing here is pure lag - keep it short enough to
     * merely absorb the discrete steps of a mouse wheel, or 0 to track the scroll exactly.
     *
     * @attribute
     * @type {number}
     */
    smoothing = 0.04;

    /**
     * The ease applied across each pass, as a power. 1 coasts at a constant rate; much above
     * that and the pass becomes a hold and a lurch. Keep it close to 1 and let the flattened
     * ends do no more than take the edge off the swing through closest approach.
     *
     * @attribute
     * @type {number}
     */
    ease = 1.4;

    /**
     * The fraction of a segment spent slewing from one subject to the next, centered on the
     * midpoint between them. Smaller values hold a subject in shot for longer - ideally for as
     * long as its narrative is on screen - at the cost of a faster pan between subjects.
     *
     * @attribute
     * @type {number}
     */
    track = 0.4;

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

        this._position = new Vec3();
        this._look = new Vec3();
        this._subject = new Vec3();
        this._forward = new Vec3();
        this._right = new Vec3();
        this._up = new Vec3();

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
                radius:
                    (override && override.radius) ||
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
     * The distance the probe passes a stop at. Dividing by the viewport fit holds the subject
     * to the same share of the frame on a narrow viewport as on a wide one. The overview stop
     * has no subject, and so no standoff.
     *
     * @param {number} index - The stop index.
     * @returns {number} The standoff distance.
     */
    _standoff(index) {
        const { width, height } = this.app.graphicsDevice;
        const fit = Math.min(1, width / Math.max(1, height));
        return ((this._stops[index].radius ?? 0) * this.frame) / fit;
    }

    /**
     * Eases progress across one segment. Barely off linear: just enough flattening at the ends
     * to blunt the angular swing through a closest approach, while leaving the pass a coast.
     *
     * @param {number} u - The progress across the segment, 0 to 1.
     * @returns {number} The eased progress.
     */
    _ease(u) {
        return u < 0.5 ?
            0.5 * (2 * u) ** this.ease :
            1 - 0.5 * (2 - 2 * u) ** this.ease;
    }

    /**
     * Computes the probe pose partway from one stop to the next. The probe coasts along the
     * line joining the two subjects, and its standoff from that line changes only while it is
     * slewing between them, never during a pass. The look target holds on the subject being
     * passed and slews to the next across the middle of the segment, so each subject is
     * watched through its whole pass - closing, abeam, then receding - and its closest
     * approach can only fall on that subject's own stop.
     *
     * The subjects are strung along the world Y axis, so the standoff is taken along Z: the
     * probe flies the line from the same side throughout.
     *
     * @param {number} index - The stop being passed.
     * @param {number} u - The progress towards the next stop, 0 to 1.
     * @param {Vec3} position - The vector to receive the camera position.
     * @param {Vec3} look - The vector to receive the look target.
     */
    _flyby(index, u, position, look) {
        const a = this._stops[index];
        const b = this._stops[index + 1];

        // The slew from one subject to the next, held off until the pass of the first is over
        const slew = math.clamp((u - 0.5) / Math.max(0.0001, this.track) + 0.5, 0, 1);
        const hand = slew * slew * (3 - 2 * slew);
        this._subject.lerp(a.position, b.position, hand);

        // Coast along the line joining the two subjects, changing standoff only while slewing
        // between them. Holding it steady through a pass leaves the separation along the line
        // as the only thing changing, so the subject in shot closes and then recedes evenly
        // however different the two framing distances are
        position.lerp(a.position, b.position, this._ease(u));
        position.z += math.lerp(this._standoff(index), this._standoff(index + 1), hand);

        // Offset the look target in the camera's own frame rather than along world axes. A
        // tracking shot swings through steep angles as a subject goes by, and a world-space
        // offset would slide the subject around the frame as it did so
        const { width, height } = this.app.graphicsDevice;
        const aspect = width / Math.max(1, height);
        const ramp = math.clamp((aspect - 0.9) / 0.4, 0, 1);
        const halfHeight = Math.tan(this.entity.camera.fov * 0.5 * math.DEG_TO_RAD) *
            position.distance(this._subject);
        const sign = index % 2 === 0 ? 1 : -1;

        this._forward.sub2(this._subject, position).normalize();
        this._right.cross(this._forward, Vec3.UP).normalize();
        this._up.cross(this._right, this._forward);

        // Sides alternate per stop, so the bias hands over with the look target
        const dx = -math.lerp(sign, -sign, hand) * this.side * halfHeight * aspect * ramp;
        const dy = -this.rise * halfHeight * (1 - ramp);
        look.set(
            this._subject.x + this._right.x * dx + this._up.x * dy,
            this._subject.y + this._right.y * dx + this._up.y * dy,
            this._subject.z + this._right.z * dx + this._up.z * dy
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

        // Track the reported stop index. Every term below is a function of that index, so
        // the shot is tied to the scroll and this smoothing is the only lag in the chain
        this._t = this.smoothing > 0 ?
            this._t + (this._target - this._t) * (1 - Math.exp(-dt / this.smoothing)) :
            this._target;
        this._time += dt;

        const t = math.clamp(this._t, 0, count - 1);
        const index = Math.max(0, Math.min(Math.floor(t), count - 2));
        const u = math.clamp(t - index, 0, 1);
        const overview = this._stops[index + 1].target;

        // The overview stop has no subject to fly past, so the closing segment holds the probe
        // at its last closest approach and blends from there into the explicit overview pose
        this._flyby(index, overview ? 0 : u, this._position, this._look);
        if (overview) {
            const e = this._ease(u);
            this._position.lerp(this._position, this._stops[index + 1].position, e);
            this._look.lerp(this._look, overview, e);
        }

        // A gentle idle drift, scaled to the current viewing distance
        const sway = this._position.distance(this._look) * 0.02 * this.drift;
        this._position.x += Math.sin(this._time * 0.4) * sway;
        this._position.y += Math.cos(this._time * 0.3) * sway * 0.7;

        this.entity.setPosition(this._position);
        this.entity.lookAt(this._look);
    }
}
