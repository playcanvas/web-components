import { Color, Script, Vec3, math } from 'playcanvas';

/**
 * @import { Entity, LightComponent, StandardMaterial } from 'playcanvas';
 */

/**
 * The scripts behind the area lights showroom, smallest first: a LightBar is one strip light, a
 * LightWave moves the rig of joints the bars hang from, a LightShow switches the bars on and
 * cycles their colors, a LightFadeIn brings up a panel, fill or headlight, and the AreaLightsShow
 * is the camera loop that runs them all.
 */
const between = new Vec3();
const toTarget = new Vec3();
const up = new Vec3();
const ahead = new Vec3();
const midpoint = new Vec3();

/** The brightness of the letter 'm' - a lit tube in Valve's light style strings. */
const NORMAL_LEVEL = 12.5;

/**
 * A strip light slung between two points.
 *
 * Every frame the bar centers itself between `pointA` and `pointB`, lies along the line joining
 * them and turns its face toward `target` - the scene origin when none is given - so a rig of
 * these can be hung off a set of joint entities and driven by moving the joints alone, which is
 * what a LightWave does. What the bar looks like is left to its children: a child named `strip`
 * with a render component wearing an emissive material is the visible tube, and the light
 * component found below the bar is what actually lights the scene. Both are picked up on the first
 * frame, once the hierarchy under the bar exists.
 *
 * The bar owns its brightness and color from then on. The light's authored intensity is taken as
 * full brightness, the strip's material is cloned so each bar can carry its own color, and the
 * strip's opacity follows the brightness - a bar switched off goes dark rather than glowing at
 * full emissive strength with no light behind it. setColor(), setIntensity() and flicker() are
 * what a controller such as a LightShow drives; left alone, a bar starts dark.
 */
export class LightBar extends Script {
    static scriptName = 'lightBar';

    /**
     * One end of the bar.
     *
     * @attribute
     * @type {Entity}
     */
    pointA = null;

    /**
     * The other end of the bar.
     *
     * @attribute
     * @type {Entity}
     */
    pointB = null;

    /**
     * What the lit face turns toward. The scene origin when unset.
     *
     * @attribute
     * @type {Entity}
     */
    target = null;

    /**
     * The stutter of a fluorescent tube starting up, one letter per step: 'a' is dark, 'm' is
     * normal brightness and 'z' is twice normal. This is the format of Valve's light styles.
     *
     * @attribute
     * @type {string}
     */
    flickerPattern = 'abcdefaaaammmmabcdefaaaammmmmmmmmmmmm';

    /**
     * Steps of the flicker pattern played per second.
     *
     * @attribute
     * @type {number}
     * @range [1, 60]
     * @precision 0
     */
    flickerRate = 10;

    /** @type {LightComponent|null} */
    _light = null;

    /** @type {StandardMaterial|null} */
    _material = null;

    _maxIntensity = 1;

    _intensity = 0;

    _color = new Color(1, 1, 1);

    _flickerTime = -1;

    _flickerDuration = 0;

    /** The intensity the bar is lit to, in the light's units. */
    get intensity() {
        return this._intensity;
    }

    /**
     * Lights the bar to an intensity; the strip's opacity follows as a fraction of full brightness.
     * Ends a flicker in progress.
     *
     * @param {number} intensity - The light intensity.
     */
    setIntensity(intensity) {
        this._flickerTime = -1;
        this._intensity = intensity;
        if (this._light) {
            this._light.intensity = intensity;
            this._material.opacity = math.clamp(intensity / this._maxIntensity, 0, 1);
            this._material.update();
        }
    }

    /**
     * Colors both the light and the strip.
     *
     * @param {Color} color - The color.
     */
    setColor(color) {
        this._color.copy(color);
        if (this._light) {
            this._light.color = this._color;
            this._material.emissive = this._color;
            this._material.update();
        }
    }

    /**
     * Switches the bar on with a stutter, settling at full brightness when the time is up.
     *
     * @param {number} duration - Seconds of flicker before the bar holds steady.
     */
    flicker(duration) {
        this._flickerTime = 0;
        this._flickerDuration = duration;
    }

    /**
     * Finds the light and the strip under the bar. They are built after the script is created, so
     * this runs on the first frame rather than in initialize().
     *
     * @returns {boolean} Whether the bar is ready to be driven.
     */
    _bind() {
        if (this._light) {
            return true;
        }

        const light = this.entity.findComponent('light');
        const strip = this.entity.findByName('strip');
        if (!light || !strip?.render?.material) {
            return false;
        }

        this._light = light;
        this._maxIntensity = light.intensity;
        this._material = strip.render.material.clone();
        strip.render.material = this._material;
        this.setColor(this._color);
        this.setIntensity(this._intensity);
        return true;
    }

    _place() {
        const a = this.pointA.getPosition();
        const b = this.pointB.getPosition();
        midpoint.add2(a, b).mulScalar(0.5);
        between.sub2(a, b);
        toTarget.sub2(this.target ? this.target.getPosition() : Vec3.ZERO, midpoint);

        // The face normal is the part of the direction to the target perpendicular to the bar
        up.cross(between, toTarget);
        if (up.lengthSq() < 1e-8) {
            return;
        }
        ahead.cross(up, between).add(midpoint);

        this.entity.setPosition(midpoint);
        this.entity.lookAt(ahead, up);
    }

    _stepFlicker(dt) {
        const time = this._flickerTime + dt;
        if (time >= this._flickerDuration) {
            this.setIntensity(this._maxIntensity);
            return;
        }

        const step = Math.floor(time * this.flickerRate) % this.flickerPattern.length;
        const level = (this.flickerPattern.charCodeAt(step) - 97) / NORMAL_LEVEL;
        this.setIntensity(level * this._maxIntensity);
        this._flickerTime = time;
    }

    update(dt) {
        if (!this._bind()) {
            return;
        }

        if (this.pointA && this.pointB) {
            this._place();
        }

        if (this._flickerTime >= 0) {
            this._stepFlicker(dt);
        }
    }
}

/**
 * Rolls a slow wave through a grid of joints: the rows are this entity's children and the joints
 * are their children. Each row bobs as a whole, each joint bobs within its row, and both motions
 * are cosines whose phase advances with the row's index and with the joint's distance from the
 * middle of its row, so the grid undulates rather than pumping up and down in step. Anything hung
 * off the joints - a LightBar between two of them, say - follows.
 *
 * The rest pose is the authored positions plus one full amplitude, since a cosine starts at its
 * crest; the wave itself begins after `delay` and eases in over a few seconds instead of lurching
 * into full speed.
 */
export class LightWave extends Script {
    static scriptName = 'lightWave';

    /**
     * Seconds to hold the rest pose before the wave starts.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    delay = 0;

    /**
     * How far each row rises and falls, in meters.
     *
     * @attribute
     * @type {number}
     * @range [0, 5]
     * @precision 2
     */
    rowAmplitude = 0.44;

    /**
     * Angular speed of the row wave, in radians per second.
     *
     * @attribute
     * @type {number}
     * @range [0, 10]
     * @precision 2
     */
    rowSpeed = 1;

    /**
     * Phase difference between neighboring rows, in radians.
     *
     * @attribute
     * @type {number}
     * @range [0, 6.28]
     * @precision 2
     */
    rowPhase = 0.61;

    /**
     * How far each joint rises and falls within its row, in meters.
     *
     * @attribute
     * @type {number}
     * @range [0, 5]
     * @precision 2
     */
    jointAmplitude = 0.37;

    /**
     * Angular speed of the joint wave, in radians per second.
     *
     * @attribute
     * @type {number}
     * @range [0, 10]
     * @precision 2
     */
    jointSpeed = 2;

    /**
     * Phase difference between a joint and its neighbor nearer the middle of the row, in radians.
     *
     * @attribute
     * @type {number}
     * @range [0, 6.28]
     * @precision 2
     */
    jointPhase = 0.25;

    /**
     * Seconds the wave takes to reach full speed once it starts.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    rampTime = 3.3;

    /** @type {{ row: Entity, rest: Vec3, joints: { joint: Entity, rest: Vec3 }[] }[]} */
    _rows = null;

    _time = 0;

    _rowTime = 0;

    _jointTime = 0;

    _speed = 0;

    _running = true;

    /** Returns the grid to its rest pose and starts the wave over, delay included. */
    start() {
        this.stop();
        this._running = true;
    }

    /** Returns the grid to its rest pose and holds it there until start(). */
    stop() {
        this._time = 0;
        this._rowTime = 0;
        this._jointTime = 0;
        this._speed = 0;
        this._running = false;
        if (this._capture()) {
            this._pose();
        }
    }

    /**
     * Records the authored positions. The rows are built after this script is created, so this
     * waits for the first frame that finds them.
     *
     * @returns {boolean} Whether there is a grid to move.
     */
    _capture() {
        if (this._rows) {
            return true;
        }
        if (!this.entity.children.length) {
            return false;
        }

        this._rows = this.entity.children.map((row) => ({
            row,
            rest: row.getLocalPosition().clone(),
            joints: row.children.map((joint) => ({ joint, rest: joint.getLocalPosition().clone() }))
        }));
        return true;
    }

    _pose() {
        for (let i = 0; i < this._rows.length; i++) {
            const { row, rest, joints } = this._rows[i];
            const position = row.getLocalPosition();
            position.y = rest.y + Math.cos(this._rowTime + i * this.rowPhase) * this.rowAmplitude;
            row.setLocalPosition(position);

            const middle = (joints.length - 1) / 2;
            for (let j = 0; j < joints.length; j++) {
                const phase = Math.abs(j - middle) * this.jointPhase;
                const jointPosition = joints[j].joint.getLocalPosition();
                jointPosition.y = joints[j].rest.y + Math.cos(this._jointTime + phase) * this.jointAmplitude;
                joints[j].joint.setLocalPosition(jointPosition);
            }
        }
    }

    update(dt) {
        if (!this._running || !this._capture()) {
            return;
        }

        this._time += dt;
        if (this._time >= this.delay) {
            this._speed = this.rampTime > 0 ? Math.min(1, this._speed + dt / this.rampTime) : 1;
            this._rowTime += dt * this.rowSpeed * this._speed;
            this._jointTime += dt * this.jointSpeed * this._speed;
        }
        this._pose();
    }
}

const color = new Color();

/**
 * Sets a color from hue, saturation and value, each in 0-1.
 *
 * @param {Color} out - The color to write.
 * @param {number} h - The hue.
 * @param {number} s - The saturation.
 * @param {number} v - The value.
 * @returns {Color} The color.
 */
const hsv = (out, h, s, v) => {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            return out.set(v, t, p);
        case 1:
            return out.set(q, v, p);
        case 2:
            return out.set(p, v, t);
        case 3:
            return out.set(p, q, v);
        case 4:
            return out.set(t, p, v);
        default:
            return out.set(v, p, q);
    }
};

/**
 * Runs the light bars under this entity - every child carrying a LightBar - as one show. After
 * `delay`, the bars stutter on a few at a time, front of the list first; from then on each bar's
 * hue walks round the color wheel, offset a little from its neighbor's so the color travels along
 * the rig, while a slow swell in saturation drifts them between pastel and vivid.
 *
 * Bars added under the entity before the show starts are picked up, so a page that stamps its bars
 * out from a template after the scene is ready still gets them all.
 */
export class LightShow extends Script {
    static scriptName = 'lightShow';

    /**
     * Seconds before the first bars switch on.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    delay = 1.5;

    /**
     * Bars that switch on together.
     *
     * @attribute
     * @type {number}
     * @range [1, 20]
     * @precision 0
     */
    groupSize = 3;

    /**
     * Seconds between one group switching on and the next.
     *
     * @attribute
     * @type {number}
     * @range [0, 5]
     * @precision 2
     */
    stagger = 0.1;

    /**
     * Seconds each bar stutters before it holds steady.
     *
     * @attribute
     * @type {number}
     * @range [0, 5]
     * @precision 2
     */
    flickerDuration = 1;

    /**
     * Seconds for a bar's hue to go once round the color wheel.
     *
     * @attribute
     * @type {number}
     * @range [1, 120]
     * @precision 1
     */
    hueCycle = 10;

    /**
     * Where on the wheel (0-1) the first bar starts.
     *
     * @attribute
     * @type {number}
     * @range [0, 1]
     * @precision 2
     */
    hueStart = 0.3;

    /**
     * How far round the wheel (0-1) each bar sits from the one before it.
     *
     * @attribute
     * @type {number}
     * @range [0, 1]
     * @precision 3
     */
    hueStep = 0.01;

    /**
     * Angular speed of the saturation swell, in radians per second.
     *
     * @attribute
     * @type {number}
     * @range [0, 5]
     * @precision 3
     */
    saturationSpeed = 0.325;

    /**
     * Phase difference in the saturation swell between neighboring bars, in radians.
     *
     * @attribute
     * @type {number}
     * @range [0, 3.14]
     * @precision 2
     */
    saturationStep = 0.05;

    /** @type {LightBar[]} */
    _bars = [];

    _lit = 0;

    _time = 0;

    _running = true;

    /** Puts every bar out and starts the show over, delay included. */
    start() {
        this._gather();
        this.stop();
        this._time = 0;
        this._lit = 0;
        this._running = true;
    }

    /** Puts every bar out and holds it there until start(). */
    stop() {
        for (const bar of this._bars) {
            bar.setIntensity(0);
        }
        this._running = false;
    }

    _gather() {
        if (this._bars.length === this.entity.children.length) {
            return;
        }
        this._bars = this.entity.children.map((child) => child.script?.lightBar).filter((bar) => bar);
    }

    update(dt) {
        if (!this._running) {
            return;
        }

        this._time += dt;
        if (this._time < this.delay) {
            this._gather();
            return;
        }

        const elapsed = this._time - this.delay;

        // Switch on group by group
        while (this._lit < this._bars.length && elapsed >= Math.ceil((this._lit + 1) / this.groupSize) * this.stagger) {
            this._bars[this._lit++].flicker(this.flickerDuration);
        }

        // Then keep the colors moving
        const saturationTime = elapsed * this.saturationSpeed;
        for (let i = 0; i < this._bars.length; i++) {
            const hue = (this.hueStart + elapsed / this.hueCycle + i * this.hueStep) % 1;
            const saturation = (Math.sin(saturationTime + i * this.saturationStep) + 1) / 2;
            this._bars[i].setColor(hsv(color, hue, saturation, 1));
        }
    }
}

/**
 * Brings a light up from dark to its authored intensity over `duration` seconds, after `delay`.
 * If a child named `strip` carries a render component - the visible panel of an area light, say -
 * its material is cloned and its opacity rises with the light, reaching full opacity a quarter of
 * the way through so the panel reads as lit well before the light peaks.
 *
 * The light is the component on this entity, or the first found below it.
 */
export class LightFadeIn extends Script {
    static scriptName = 'lightFadeIn';

    /**
     * Seconds to stay dark before the fade starts.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    delay = 0;

    /**
     * Seconds the fade takes.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    duration = 2;

    /** @type {LightComponent|null} */
    _light = null;

    /** @type {StandardMaterial|null} */
    _material = null;

    _intensity = 0;

    _time = 0;

    _done = false;

    /** Puts the light out and runs the fade again, delay included. */
    start() {
        this.stop();
        this._time = 0;
        this._done = false;
    }

    /** Puts the light out and holds it there until start(). */
    stop() {
        this._done = true;
        if (this._bind()) {
            this._apply(0);
        }
    }

    _apply(fraction) {
        this._light.intensity = fraction * this._intensity;
        if (this._material) {
            this._material.opacity = Math.min(1, fraction * 4);
            this._material.update();
        }
    }

    /**
     * Takes hold of the light and the strip. Children are built after the script is created, so
     * this runs on the first frame rather than in initialize().
     *
     * @returns {boolean} Whether there is a light to fade.
     */
    _bind() {
        if (this._light) {
            return true;
        }

        const light = this.entity.light ?? this.entity.findComponent('light');
        if (!light) {
            return false;
        }

        this._light = light;
        this._intensity = light.intensity;
        light.intensity = 0;

        const strip = this.entity.findByName('strip');
        if (strip?.render?.material) {
            this._material = strip.render.material.clone();
            this._material.opacity = 0;
            this._material.update();
            strip.render.material = this._material;
        }
        return true;
    }

    update(dt) {
        if (this._done || !this._bind()) {
            return;
        }

        this._time += dt;
        const fraction = math.clamp((this._time - this.delay) / Math.max(this.duration, 1e-6), 0, 1);
        this._apply(fraction);
        this._done = fraction >= 1;
    }
}

const position = new Vec3();

/** Eases in and out: slow away from a stop, slow into the next. */
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Eases out only: fast away, slowing into the stop. */
const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);

/**
 * The attract loop of the area lights showroom: an orbit camera cut between three shots, with a
 * fade up from black on each cut, and every light in the scene switched off at the end and on
 * again at the start. The lights are whatever LightShow, LightWave and LightFadeIn scripts the
 * scene holds; they carry their own delays, so this only has to say when a loop begins.
 *
 * The camera orbits `focusPoint` the way an orbit camera does: `pitch` degrees of tilt (negative
 * looks down from above), `yaw` degrees round the focus, `distance` meters away. The loop runs:
 *
 * 1. The front, level, while the lights come up.
 * 2. A cut to a low three-quarter view that sweeps round the front of the car.
 * 3. A cut to a high view that sinks back to level.
 * 4. The lights go out; a moment later the loop starts again.
 */
export class AreaLightsShow extends Script {
    static scriptName = 'areaLightsShow';

    /**
     * The camera to drive.
     *
     * @attribute
     * @type {Entity}
     */
    camera = null;

    /**
     * The point the camera orbits.
     *
     * @attribute
     * @type {Vec3}
     */
    focusPoint = new Vec3(0, 1.72, -3.15);

    /**
     * An element the fades are drawn with: its opacity goes from 1 to 0 over `fadeDuration` after
     * each cut. Optional.
     *
     * @attribute
     * @type {Entity}
     */
    fade = null;

    /**
     * Distance of the opening and closing shots, in meters.
     *
     * @attribute
     * @type {number}
     * @range [1, 50]
     * @precision 2
     */
    distance = 8.71;

    /**
     * Distance of the sweeping shot, in meters.
     *
     * @attribute
     * @type {number}
     * @range [1, 50]
     * @precision 2
     */
    orbitDistance = 6.04;

    /**
     * Seconds the opening shot holds while the lights come up.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    startHold = 4;

    /**
     * Seconds of the sweeping shot.
     *
     * @attribute
     * @type {number}
     * @range [0, 60]
     * @precision 2
     */
    orbitDuration = 8;

    /**
     * The sweep runs from minus this yaw to plus it, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [0, 180]
     * @precision 1
     */
    orbitAngle = 60;

    /**
     * Pitch of the sweeping shot, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [-89, 89]
     * @precision 2
     */
    orbitPitch = -3.9;

    /**
     * Seconds of the descending shot.
     *
     * @attribute
     * @type {number}
     * @range [0, 60]
     * @precision 2
     */
    descentDuration = 3;

    /**
     * Pitch the descending shot starts from, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [-89, 89]
     * @precision 2
     */
    descentPitch = -37.2;

    /**
     * Pitch of the level shots, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [-89, 89]
     * @precision 2
     */
    levelPitch = -1.32;

    /**
     * Seconds between the descent settling and the lights going out.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    endHold = 1;

    /**
     * Seconds of darkness before the next loop.
     *
     * @attribute
     * @type {number}
     * @range [0, 30]
     * @precision 2
     */
    darkTime = 1;

    /**
     * Seconds a fade up from black takes.
     *
     * @attribute
     * @type {number}
     * @range [0, 10]
     * @precision 2
     */
    fadeDuration = 2;

    _time = 0;

    _fadeTime = Infinity;

    /** The shot in progress, so a cut happens once. */
    _shot = -1;

    _lightsOn = false;

    _lightScripts = null;

    /**
     * Every light controller in the scene. They are created with the hierarchy, after this
     * script, so they are gathered on the first frame.
     *
     * @returns {object[]} The scripts with start() and stop().
     */
    _lights() {
        if (!this._lightScripts) {
            this._lightScripts = this.app.root
                .findComponents('script')
                .flatMap((component) => ['lightShow', 'lightWave', 'lightFadeIn'].map((name) => component[name]))
                .filter((script) => script);
        }
        return this._lightScripts;
    }

    _setLights(on) {
        if (this._lightsOn === on) {
            return;
        }
        this._lightsOn = on;
        for (const script of this._lights()) {
            if (on) {
                script.start();
            } else {
                script.stop();
            }
        }
    }

    _cut(shot) {
        if (this._shot === shot) {
            return;
        }
        this._shot = shot;
        // The opening shot is where a loop lands from the dark, so it needs no fade
        this._fadeTime = shot === 0 ? Infinity : 0;
    }

    _place(pitch, yaw, distance) {
        const camera = this.camera;
        camera.setEulerAngles(pitch, yaw, 0);
        position.copy(camera.forward).mulScalar(-distance).add(this.focusPoint);
        camera.setPosition(position);
    }

    update(dt) {
        if (!this.camera) {
            return;
        }

        this._time += dt;
        const t = this._time;
        const orbitEnd = this.startHold + this.orbitDuration;
        const descentEnd = orbitEnd + this.descentDuration;
        const lightsOut = descentEnd + this.endHold;

        if (t < this.startHold) {
            this._setLights(true);
            this._cut(0);
            this._place(this.levelPitch, 0, this.distance);
        } else if (t < orbitEnd) {
            this._cut(1);
            const f = easeInOutSine((t - this.startHold) / this.orbitDuration);
            this._place(this.orbitPitch, math.lerp(-this.orbitAngle, this.orbitAngle, f), this.orbitDistance);
        } else if (t < descentEnd) {
            this._cut(2);
            const f = easeOutSine((t - orbitEnd) / this.descentDuration);
            this._place(math.lerp(this.descentPitch, this.levelPitch, f), 0, this.distance);
        } else if (t < lightsOut) {
            this._place(this.levelPitch, 0, this.distance);
        } else if (t < lightsOut + this.darkTime) {
            this._setLights(false);
        } else {
            this._time = 0;
        }

        if (this.fade?.element) {
            this._fadeTime += dt;
            // The element is composited in linear light, before tone mapping, where black at 80%
            // opacity still reads as mid gray. Shaping the opacity by the display gamma makes the
            // fade look even.
            const progress = math.clamp(this._fadeTime / this.fadeDuration, 0, 1);
            this.fade.element.opacity = 1 - progress ** 2.2;
        }
    }
}
