import { Layer, Script, Vec2, Vec3, math } from 'playcanvas';

/** @import { Entity } from 'playcanvas' */

/**
 * Smootherstep: zero velocity and acceleration at both ends, so a rail settles on each shot.
 *
 * @param {number} t - Progress, 0 to 1.
 * @returns {number} The eased progress.
 */
const settle = t => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Uniform Catmull-Rom between p1 and p2, with p0 and p3 as their neighbors.
 *
 * @param {Vec3} out - Receives the point.
 * @param {Vec3} p0 - The point before p1.
 * @param {Vec3} p1 - The start of the span.
 * @param {Vec3} p2 - The end of the span.
 * @param {Vec3} p3 - The point after p2.
 * @param {number} t - Progress along the span, 0 to 1.
 * @returns {Vec3} The point.
 */
const catmullRom = (out, p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    const spline = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return out.set(spline(p0.x, p1.x, p2.x, p3.x), spline(p0.y, p1.y, p2.y, p3.y), spline(p0.z, p1.z, p2.z, p3.z));
};

/**
 * A camera shot: the entity's position is where the camera stands, and the attributes say where
 * it looks and how its lens is set. Nothing renders from a shot - a {@link CameraRail} reads it.
 */
export class Shot extends Script {
    static scriptName = 'shot';

    /**
     * The point the camera looks at, in world space.
     *
     * @attribute
     */
    target = new Vec3();

    /**
     * The vertical field of view, in degrees.
     *
     * @attribute
     * @range [5, 120]
     */
    fov = 30;

    /**
     * The distance the lens is focused at, in world units. 0 focuses on the target.
     *
     * @attribute
     */
    focus = 0;

    /**
     * How soft out-of-focus areas are: the depth-of-field blur radius, 0 for none.
     *
     * @attribute
     */
    blur = 0;

    /**
     * Roll about the view direction, in degrees.
     *
     * @attribute
     */
    roll = 0;

    /**
     * Where on screen the target sits, in normalized device coordinates: (0, 0) is the middle,
     * (0.3, 0) a little right of it, leaving the left of the frame for something else. The
     * camera turns to put it there for whatever shape the screen is.
     *
     * @attribute
     */
    offset = new Vec2();

    /**
     * Where on screen the target sits when the screen is taller than it is wide.
     *
     * @attribute
     */
    portraitOffset = new Vec2(0, 0.36);
}

/**
 * Moves its camera along a sequence of {@link Shot}s. `position` is where along them the camera
 * is - 1.5 is halfway from the second shot to the third - and the camera settles on every shot,
 * stopping there before it moves on. It travels a smooth curve through the shots' positions,
 * turns to follow a target travelling a curve through their targets, and blends field of view,
 * roll, the target's place on screen and, when the camera has a cameraFrame script, its
 * depth-of-field focus and blur. On a screen taller than it is wide, the camera backs away from
 * the target so the frame's narrower width still holds it.
 */
export class CameraRail extends Script {
    static scriptName = 'cameraRail';

    /**
     * The shots, in order. A shot may appear more than once.
     *
     * @attribute
     * @type {Entity[]}
     */
    shots = [];

    /**
     * Where along the shots the camera is, from 0 to one less than their count.
     *
     * @attribute
     */
    position = 0;

    /**
     * How much of a tall screen's lost width the camera makes up by backing off: 0 never moves
     * it, 1 keeps the target the same width on screen as on a square one.
     *
     * @attribute
     * @range [0, 1]
     */
    portraitFit = 0.65;

    /** @private */
    _p = new Vec3();

    /** @private */
    _t = new Vec3();

    /** @private */
    _up = new Vec3(0, 1, 0);

    /** @private */
    _offset = new Vec2();

    update() {
        const shots = this.shots.filter(e => e?.script?.shot);
        if (!shots.length) {
            return;
        }
        const last = shots.length - 1;
        const at = math.clamp(this.position, 0, last);
        const i = Math.min(Math.floor(at), Math.max(last - 1, 0));
        const t = last === 0 ? 0 : settle(at - i);
        const s = k => shots[math.clamp(k, 0, last)];
        const a = s(i).script.shot;
        const b = s(i + 1).script.shot;

        catmullRom(this._p, s(i - 1).getPosition(), s(i).getPosition(), s(i + 1).getPosition(), s(i + 2).getPosition(), t);
        catmullRom(this._t, s(i - 1).script.shot.target, a.target, b.target, s(i + 2).script.shot.target, t);

        const entity = this.entity;
        const camera = entity.camera;
        const aspect = camera ? camera.aspectRatio : 1;
        const portrait = aspect < 1;
        const fov = math.lerp(a.fov, b.fov, t);

        // on a tall screen, back away along the view so the target still fits across
        if (portrait) {
            const fit = 1 + (1 / aspect - 1) * this.portraitFit;
            this._p.sub(this._t).mulScalar(fit).add(this._t);
        }
        entity.setPosition(this._p);
        entity.lookAt(this._t, this._up);

        // then turn away from the target, by just enough to put it at its place on screen
        this._offset.lerp(portrait ? a.portraitOffset : a.offset, portrait ? b.portraitOffset : b.offset, t);
        const tanHalf = Math.tan(fov * math.DEG_TO_RAD * 0.5);
        const yaw = Math.atan(this._offset.x * tanHalf * aspect) * math.RAD_TO_DEG;
        const pitch = Math.atan(this._offset.y * tanHalf) * math.RAD_TO_DEG;
        entity.rotateLocal(-pitch, yaw, math.lerp(a.roll, b.roll, t));

        if (camera) {
            camera.fov = fov;
        }
        const dof = entity.script?.cameraFrame?.dof;
        if (dof) {
            const focusA = a.focus || this._p.distance(this._t);
            const focusB = b.focus || this._p.distance(this._t);
            dof.focusDistance = math.lerp(focusA, focusB, t);
            dof.blurRadius = math.lerp(a.blur, b.blur, t);
        }
    }
}

/**
 * Holds its entity's anim component on one clip at a chosen time, so something else - a scroll
 * position, a slider - can scrub the animation instead of the clock playing it.
 */
export class ClipScrubber extends Script {
    static scriptName = 'clipScrubber';

    /**
     * The clip (anim state) to scrub. Empty scrubs the first one assigned.
     *
     * @attribute
     */
    clip = '';

    /**
     * The time into the clip, in seconds.
     *
     * @attribute
     */
    time = 0;

    /** @private */
    _shown = NaN;

    update() {
        const anim = this.entity.anim;
        const layer = anim?.baseLayer;
        if (!layer) {
            return;
        }
        const name = this.clip || layer.states.find(s => s !== 'START' && s !== 'END' && s !== 'ANY');
        if (!name) {
            return;
        }
        if (layer.activeState !== name) {
            layer.play(name);
            this._shown = NaN;
        }
        // The component flag stops the system advancing the clip; the layer flag makes a seek
        // repaint, since the layer only re-evaluates a pose on a seek while it is paused
        anim.playing = false;
        layer.playing = false;
        if (this.time !== this._shown) {
            const duration = layer.activeStateDuration || 0;
            layer.activeStateCurrentTime = duration > 0 ? math.clamp(this.time, 0, duration - 1e-4) : this.time;
            this._shown = this.time;
        }
    }
}

/**
 * Turns its entity's light to face a point. Lights shine down their entity's -Y axis, so after
 * looking at the target the entity is pitched a quarter turn to put -Y where -Z was.
 */
export class AimLight extends Script {
    static scriptName = 'aimLight';

    /**
     * The point to shine at, in world space.
     *
     * @attribute
     */
    target = new Vec3();

    initialize() {
        this.aim();
        this.on('attr:target', this.aim, this);
    }

    aim() {
        this.entity.lookAt(this.target);
        this.entity.rotateLocal(90, 0, 0);
    }
}

/**
 * Puts its entity's render component on a layer of its own, drawn straight after World, and adds
 * that layer to a camera. For a surface that must stay out of a camera's view of everything else:
 * a planar reflection's mirror camera, for one, renders every layer but its ground's.
 */
export class GroundLayer extends Script {
    static scriptName = 'groundLayer';

    /**
     * The name of the layer, created when the scene has none of that name.
     *
     * @attribute
     */
    layerName = 'Ground';

    /**
     * The camera that should see the ground.
     *
     * @attribute
     * @type {Entity}
     */
    camera = null;

    initialize() {
        const layers = this.app.scene.layers;
        let layer = layers.getLayerByName(this.layerName);
        if (!layer) {
            layer = new Layer({ name: this.layerName });
            const world = layers.getLayerByName('World');
            layers.insertOpaque(layer, layers.getOpaqueIndex(world) + 1);
            layers.insertTransparent(layer, layers.getTransparentIndex(world) + 1);
        }
        if (this.entity.render) {
            this.entity.render.layers = [layer.id];
        }
        const camera = this.camera?.camera;
        if (camera && !camera.layers.includes(layer.id)) {
            camera.layers = [...camera.layers, layer.id];
        }
    }
}
