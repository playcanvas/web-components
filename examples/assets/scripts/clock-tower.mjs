import { Color, Quat, Script, Vec2, Vec3, math } from 'playcanvas';

/**
 * @import { Entity, GraphNode, LightComponent, SoundComponent, StandardMaterial } from 'playcanvas';
 */

/**
 * The scripts behind the clock tower. A TowerClock runs the movement and its hands at the time of
 * day, TowerChimes rings the quarters and strikes the hours it reports, TowerDaylight lights the
 * room for whatever time the hands show, LampSway swings a lamp when the bells shake the tower,
 * and BeamDust keeps motes of dust in the sunbeam.
 */
const SECONDS_PER_DAY = 86400;
const HALF_DAY = SECONDS_PER_DAY / 2;

/** How long the escape wheel takes to advance once the pendulum frees it, in seconds. */
const STEP_TIME = 0.09;

const tmpQuat = new Quat();
const toLight = new Vec3();
const tmpColor = new Color();
const beamDir = new Vec3();
const beamMid = new Vec3();
const away = new Vec3();

/**
 * Seconds of local time since the epoch, read from the wall clock without allocating. Not wrapped
 * to the day, so midnight is a second like any other.
 *
 * @param {number} utcOffset - The timezone offset in minutes, as Date#getTimezoneOffset gives it.
 * @returns {number} Local seconds.
 */
const localSeconds = utcOffset => Date.now() / 1000 - utcOffset * 60;

/** A time in seconds as seconds since midnight. */
const timeOfDay = seconds => ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;

/** A time difference the shorter way round the dial: within half a day either side of zero. */
const wrapDelta = (seconds) => {
    const s = timeOfDay(seconds);
    return s > HALF_DAY ? s - SECONDS_PER_DAY : s;
};

/**
 * Time as an escapement delivers it: held for most of each second, then a quick advance with a
 * little overshoot as the wheel drops onto the next pallet.
 *
 * @param {number} t - Continuous time in seconds.
 * @returns {number} The time the wheel train shows.
 */
const escapementTime = (t) => {
    const whole = Math.floor(t);
    const f = (t - whole) / STEP_TIME;
    if (f >= 1) {
        return whole + 1;
    }
    return whole + 1 - (1 - f) * (1 - f) + Math.sin(f * Math.PI) * 0.06;
};

/**
 * The movement of a turret clock and the hands it drives.
 *
 * The model's moving parts are nodes with the names listed below, each authored to turn about its
 * own local Z axis, and each turns at the rate its gearing gives it: the great wheel on the
 * winding barrel drives the center wheel through a 10 leaf pinion, the center wheel the third and
 * the third the escape wheel, whose 30 teeth turn once a minute under a seconds pendulum - one
 * beat a second, two to a swing.
 *
 * As on a real turret clock, the hands are set through a friction clutch. setTime() carries the
 * hands, the leading-off rod and the dial's motion work to a new time, quickly and smoothly, while
 * the pendulum and the going train keep their beat underneath. Until a time is set the clock keeps
 * the local time of the machine it runs on.
 *
 * Each beat fires `tick` with its parity (0 or 1), and plays the `tick` or `tock` slot of the
 * first sound component at or below this entity, if there is one - put it on an entity at the
 * escapement, where the sound comes from. Each time the hands reach a quarter of their own accord,
 * `quarter` fires with the quarter (1, 2 or 3, and 4 on the hour) and the hour on the dial (1 to
 * 12). Setting the hands past a quarter fires nothing.
 */
export class TowerClock extends Script {
    static scriptName = 'towerClock';

    /**
     * How far the pendulum swings either side of the vertical, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [0, 8]
     */
    amplitude = 3.5;

    /**
     * How smoothly setTime() carries the hands to their new time: roughly the seconds they take
     * to settle.
     *
     * @attribute
     * @type {number}
     * @range [0.05, 2]
     */
    settingTime = 0.45;

    /**
     * The fastest the hands turn while being set, in hours of the dial per second.
     *
     * @attribute
     * @type {number}
     * @range [0.1, 24]
     */
    settingSpeed = 5;

    /**
     * The going train, which turns with the pendulum's beat whatever the hands show. Each rate is
     * in turns per hour, positive counterclockwise about the part's local Z.
     *
     * @type {[string, number][]}
     */
    static TRAIN = [
        ['great-wheel', 1 / 12],
        ['center-wheel', -1],
        ['third-wheel', 8],
        ['escape-wheel', -60]
    ];

    /**
     * The hands' side of the clutch. The dial faces out of the tower down -Z, so its hands turn
     * positively about +Z - clockwise to someone in the street. The setting dial faces the room.
     *
     * @type {[string, number][]}
     */
    static HANDS = [
        ['minute-hand', 1],
        ['hour-hand', 1 / 12],
        ['dial-cannon', 1],
        ['dial-minute-wheel', -1 / 3],
        ['dial-hour-wheel', 1 / 12],
        ['setting-minute-hand', -1],
        ['setting-hour-hand', -1 / 12],
        ['leading-off-rod', 1]
    ];

    /** @type {{ node: GraphNode, base: Quat, rate: number }[]} */
    _train = [];

    /** @type {{ node: GraphNode, base: Quat, rate: number }[]} */
    _hands = [];

    /** @type {GraphNode[]} */
    _swinging = [];

    /** @type {SoundComponent|null} */
    _sound = null;

    _bound = false;

    _utcOffset = 0;

    _offset = 0;

    _targetOffset = 0;

    _velocity = 0;

    _setting = false;

    _lastBeat = 0;

    _lastQuarter = 0;

    initialize() {
        this._utcOffset = new Date().getTimezoneOffset();
        const now = localSeconds(this._utcOffset);
        this._lastBeat = Math.floor(now);
        this._lastQuarter = Math.floor(now / 900);
    }

    /**
     * The time the hands show, in seconds since midnight.
     *
     * @type {number}
     */
    get time() {
        return timeOfDay(localSeconds(this._utcOffset) + this._offset);
    }

    /**
     * The time the hands are being set to, in seconds since midnight. The same as `time` once
     * they get there, and whenever the clock is running on its own.
     *
     * @type {number}
     */
    get targetTime() {
        return timeOfDay(localSeconds(this._utcOffset) + this._targetOffset);
    }

    /**
     * Whether the hands are on their way to a time given to setTime().
     *
     * @type {boolean}
     */
    get setting() {
        return this._setting;
    }

    /**
     * Whether the clock is keeping local time, rather than a time given to setTime().
     *
     * @type {boolean}
     */
    get keepingLocalTime() {
        return this._targetOffset === 0;
    }

    /**
     * Sets the hands to a time of day. The clock runs on from the new time.
     *
     * @param {number} seconds - The time of day, in seconds since midnight.
     * @param {boolean} [shorterWay] - Whether to turn the hands the shorter way round the dial, as
     * someone setting a clock would. False sends them straight there through the day, forward or
     * back, the way a timeline of the day reads. Defaults to true.
     */
    setTime(seconds, shorterWay = true) {
        const delta = seconds - this.time;
        // whole seconds, so the hands go on stepping with the pendulum's beat - rounded up, so
        // they never land short of the time asked for
        this._targetOffset = Math.ceil(this._offset + (shorterWay ? wrapDelta(delta) : delta));
        this._setting = this._targetOffset !== this._offset;
    }

    /** Sets the hands back to local time. */
    keepLocalTime() {
        this._targetOffset = 0;
        this._setting = this._offset !== 0;
    }

    _bind() {
        const find = ([name, rate]) => {
            const node = this.entity.findByName(name);
            return node ? { node, base: node.getLocalRotation().clone(), rate } : null;
        };
        const train = TowerClock.TRAIN.map(find);
        const hands = TowerClock.HANDS.map(find);
        const swinging = ['pendulum', 'anchor'].map(name => this.entity.findByName(name));
        // the model loads after the script starts, so wait until every part is there
        if (train.includes(null) || hands.includes(null) || swinging.includes(null)) {
            return false;
        }
        this._train = train;
        this._hands = hands;
        this._swinging = swinging;
        this._sound = this.entity.findComponent('sound');
        return true;
    }

    _turn(parts, hours) {
        for (const { node, base, rate } of parts) {
            tmpQuat.setFromAxisAngle(Vec3.BACK, ((hours * rate) % 1) * 360);
            node.setLocalRotation(tmpQuat.mul2(base, tmpQuat));
        }
    }

    _followTarget(dt) {
        // a critically damped approach, capped in speed, that lands exactly on the target second
        const smooth = Math.max(0.01, this.settingTime);
        const omega = 2 / smooth;
        const x = omega * dt;
        const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const maxChange = this.settingSpeed * 3600 * smooth;
        const change = math.clamp(this._offset - this._targetOffset, -maxChange, maxChange);
        const target = this._offset - change;
        const temp = (this._velocity + omega * change) * dt;
        this._velocity = (this._velocity - omega * temp) * decay;
        let offset = target + (change + temp) * decay;
        // never overshoot
        if ((this._targetOffset - this._offset > 0) === (offset > this._targetOffset)) {
            offset = this._targetOffset;
            this._velocity = 0;
        }
        this._offset = offset;
        if (Math.abs(offset - this._targetOffset) < 0.25) {
            // arrived. Whole days make no difference to the dial, so drop them: that keeps the way
            // back to local time within half a day
            const days = Math.round(this._targetOffset / SECONDS_PER_DAY) * SECONDS_PER_DAY;
            this._offset = this._targetOffset -= days;
            this._velocity = 0;
            this._setting = false;
        }
    }

    update(dt) {
        if (!this._bound && !(this._bound = this._bind())) {
            return;
        }
        if (this._setting) {
            this._followTarget(dt);
        }

        const real = localSeconds(this._utcOffset);
        const shown = real + this._offset;

        // the pendulum passes the vertical on each whole second, which is when the wheel is freed
        const swing = this.amplitude * Math.sin(Math.PI * real);
        for (const node of this._swinging) {
            node.setLocalEulerAngles(0, 0, swing);
        }
        this._turn(this._train, escapementTime(real) / 3600);
        this._turn(this._hands, (this._setting ? shown : escapementTime(shown)) / 3600);

        const beat = Math.floor(real);
        if (beat !== this._lastBeat) {
            this._lastBeat = beat;
            this._sound?.play(beat & 1 ? 'tock' : 'tick');
            this.fire('tick', beat & 1);
        }

        const quarter = Math.floor(shown / 900);
        if (quarter !== this._lastQuarter) {
            if (!this._setting && quarter === this._lastQuarter + 1) {
                const q = ((quarter % 4) + 4) % 4 || 4;
                const hour = Math.floor(timeOfDay(shown) / 3600) % 12 || 12;
                this.fire('quarter', q, hour);
            }
            this._lastQuarter = quarter;
            // picks up a change to or from summer time within the quarter hour
            this._utcOffset = new Date().getTimezoneOffset();
        }
    }
}

/**
 * The Westminster changes, on four bells numbered from the highest: G#, F#, E and B.
 *
 * @type {number[][]}
 */
const CHANGES = [
    [1, 2, 3, 4],
    [3, 1, 2, 4],
    [3, 2, 1, 3],
    [1, 3, 2, 4],
    [4, 2, 1, 3]
];

/**
 * The changes rung at each quarter: past, half past, to, and on the hour.
 *
 * @type {number[][]}
 */
const QUARTERS = [
    [0],
    [1, 2],
    [3, 4, 0],
    [1, 2, 3, 4]
];

/**
 * Rings a clock's quarters and strikes its hours: the Westminster Quarters on four bells, then
 * one stroke of the hour bell for each hour.
 *
 * The bells are this entity's sound slots: `bell-1` to `bell-4` for the quarter bells, highest
 * first, and `hour` for the hour bell. Give the slots `overlap`, since a bell is still ringing when
 * the next is struck. `clock` is any entity running a TowerClock; the chimes follow its `quarter`
 * event, and ring() can be called directly too. Each stroke fires `stroke` with the bell's slot
 * name, as it sounds.
 */
export class TowerChimes extends Script {
    static scriptName = 'towerChimes';

    /**
     * The entity running the TowerClock to follow.
     *
     * @attribute
     * @type {Entity}
     */
    clock = null;

    /**
     * Seconds between the strokes of a change.
     *
     * @attribute
     * @type {number}
     * @range [0.3, 2]
     */
    interval = 0.72;

    /**
     * Seconds between the strokes of the hour.
     *
     * @attribute
     * @type {number}
     * @range [1, 6]
     */
    hourInterval = 2.6;

    /** @type {{ at: number, slot: string }[]} */
    _queue = [];

    _time = 0;

    /** @type {TowerClock|null} */
    _source = null;

    initialize() {
        this.on('destroy', () => this._source?.off('quarter', this.ring, this));
    }

    /**
     * Rings a quarter, and after the fourth strikes the hour.
     *
     * @param {number} quarter - 1, 2 or 3 for the quarters, 4 on the hour.
     * @param {number} hour - The hour to strike after the fourth quarter, 1 to 12.
     */
    ring(quarter, hour) {
        let at = Math.max(this._time, this._queue.at(-1)?.at ?? 0) + 0.05;
        for (const change of QUARTERS[quarter - 1]) {
            for (const bell of CHANGES[change]) {
                this._queue.push({ at, slot: `bell-${bell}` });
                at += this.interval;
            }
            // the last stroke of each change is held for two
            at += this.interval;
        }
        if (quarter === 4) {
            at += this.interval;
            for (let i = 0; i < hour; i++) {
                this._queue.push({ at, slot: 'hour' });
                at += this.hourInterval;
            }
        }
    }

    update(dt) {
        const source = this.clock?.script?.towerClock ?? null;
        if (source !== this._source) {
            this._source?.off('quarter', this.ring, this);
            source?.on('quarter', this.ring, this);
            this._source = source;
        }

        this._time += dt;
        while (this._queue.length && this._queue[0].at <= this._time) {
            const { slot } = this._queue.shift();
            this.entity.sound?.play(slot);
            this.fire('stroke', slot);
        }
    }
}

/**
 * The sunlight through the day, keyed by the sun's elevation in degrees: its color, and the share
 * of full intensity it has.
 *
 * @type {[number, Color, number][]}
 */
const SUNLIGHT = [
    [0, new Color(1, 0.36, 0.14), 0],
    [3, new Color(1, 0.46, 0.2), 0.3],
    [9, new Color(1, 0.64, 0.36), 0.68],
    [18, new Color(1, 0.82, 0.6), 0.9],
    [30, new Color(1, 0.92, 0.8), 1]
];

/**
 * Lights the tower for the time on its clock: a sun that crosses the sky behind the dial from six
 * in the morning to six at night, a moon that takes the same path through the night, and lamps
 * inside that come on as the daylight goes.
 *
 * The day is an equinox's and the dial faces the midday sun, down -Z, so the light falls through
 * the dial around noon and slants in through the side windows early and late. One directional
 * light plays both the sun and the moon, so the camera's volumetric fog, which one light can
 * light, has shafts all night too. The fog's ambient glow and the scene's skybox lighting follow.
 *
 * A lamp is any entity tagged `lampTag`. Every light below it is dimmed from the intensity it was
 * authored with, and every glowing material below it - a bulb's filament and the glass round it -
 * from the emissive intensity it was authored with. Lamps are looked for every second, so one that
 * arrives with a model is found too.
 * `glass` is an entity rendering the dial's glass, whose material glows at night with the lamps
 * behind it.
 */
export class TowerDaylight extends Script {
    static scriptName = 'towerDaylight';

    /**
     * The entity running the TowerClock whose time is shown.
     *
     * @attribute
     * @type {Entity}
     */
    clock = null;

    /**
     * The entity with the directional light that plays the sun and the moon.
     *
     * @attribute
     * @type {Entity}
     */
    sun = null;

    /**
     * The camera entity whose cameraFrame script renders the volumetric fog.
     *
     * @attribute
     * @type {Entity}
     */
    camera = null;

    /**
     * The tag of the lamps that light the room at night.
     *
     * @attribute
     * @type {string}
     */
    lampTag = 'lamp';

    /**
     * An entity rendering the dial's glass.
     *
     * @attribute
     * @type {Entity}
     */
    glass = null;

    /**
     * How high the sun climbs at noon, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [10, 80]
     */
    noonElevation = 42;

    /**
     * The sun's intensity when it is high.
     *
     * @attribute
     * @type {number}
     */
    sunIntensity = 4;

    /**
     * The moon's intensity when it is high.
     *
     * @attribute
     * @type {number}
     */
    moonIntensity = 0.55;

    /**
     * The moonlight's color.
     *
     * @attribute
     * @type {Color}
     */
    moonColor = new Color(0.5, 0.62, 1);

    /**
     * How much more brightly the fog scatters moonlight than sunlight, so the moon's shafts
     * still read in the dark.
     *
     * @attribute
     * @type {number}
     */
    moonShafts = 4;

    /**
     * The scene's skybox lighting intensity in full daylight (x) and at night (y).
     *
     * @attribute
     * @type {Vec2}
     */
    ambient = new Vec2(1, 0.05);

    /**
     * The fog's ambient glow in full daylight (x) and at night (y).
     *
     * @attribute
     * @type {Vec2}
     */
    fogAmbient = new Vec2(0.02, 0.004);

    /**
     * The color the dial's glass glows at night.
     *
     * @attribute
     * @type {Color}
     */
    glassGlow = new Color(0.45, 0.36, 0.25);

    _day = 1;

    _night = 0;

    _lastNight = -1;

    _scan = 0;

    /**
     * The lights of each lamp and the intensities they were authored with, keyed by the lamp.
     *
     * @type {Map<Entity, { light: LightComponent, intensity: number }[]>}
     */
    _lamps = new Map();

    /**
     * The authored emissive intensity of each glowing material below a lamp, taken the first time
     * it is seen: lamps share their bulbs' materials, and a lamp found later must not take the
     * dimmed value for its own.
     *
     * @type {Map<StandardMaterial, number>}
     */
    _glows = new Map();

    _fogDay = new Color(1, 0.9, 0.75);

    _fogNight = new Color(0.45, 0.55, 1);

    /**
     * How much of full daylight there is, from 0 at night to 1.
     *
     * @type {number}
     */
    get daylight() {
        return this._day;
    }

    /**
     * How far up the lamps are, from 0 by day to 1 at night.
     *
     * @type {number}
     */
    get lamplight() {
        return this._night;
    }

    /**
     * The sun's elevation and azimuth at a time of day, in degrees. The azimuth is measured from
     * the dial's facing (-Z), positive toward +X.
     *
     * @param {number} hours - The time of day in hours.
     * @returns {number[]} The elevation and the azimuth.
     */
    sunPosition(hours) {
        return [this.noonElevation * Math.sin(Math.PI * (hours - 6) / 12), (hours - 12) * 15];
    }

    _findLamps() {
        for (const lamp of this.app.root.findByTag(this.lampTag)) {
            const lights = lamp.findComponents('light');
            if (!lights.length || this._lamps.has(lamp)) {
                continue;
            }
            for (const render of lamp.findComponents('render')) {
                for (const { material } of render.meshInstances) {
                    const { r, g, b } = material.emissive;
                    if (r + g + b > 0 && !this._glows.has(material)) {
                        this._glows.set(material, material.emissiveIntensity);
                    }
                }
            }
            this._lamps.set(lamp, lights.map(light => ({ light, intensity: light.intensity })));
            this._lastNight = -1;
        }
    }

    _aim(elevation, azimuth) {
        const e = elevation * math.DEG_TO_RAD;
        const a = azimuth * math.DEG_TO_RAD;
        toLight.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
        // point -Z along the light's travel, then tip the entity so -Y, which a light shines
        // down, points there instead
        this.sun.setPosition(0, 0, 0);
        this.sun.lookAt(toLight.mulScalar(-1));
        this.sun.rotateLocal(90, 0, 0);
    }

    update(dt) {
        const clock = this.clock?.script?.towerClock;
        const light = this.sun?.light;
        if (!clock || !light) {
            return;
        }
        if ((this._scan -= dt) <= 0) {
            this._scan = 1;
            this._findLamps();
        }

        const hours = clock.time / 3600;
        const [elevation, azimuth] = this.sunPosition(hours);
        const fog = this.camera?.script?.cameraFrame?.volumetricFog;

        if (elevation > 0) {
            // the sun, colored and dimmed by its height
            this._aim(elevation, azimuth);
            let i = 1;
            while (i < SUNLIGHT.length - 1 && elevation > SUNLIGHT[i][0]) {
                i++;
            }
            const [e0, c0, s0] = SUNLIGHT[i - 1];
            const [e1, c1, s1] = SUNLIGHT[i];
            const t = math.clamp((elevation - e0) / (e1 - e0), 0, 1);
            this._day = math.lerp(s0, s1, t);
            light.color = tmpColor.lerp(c0, c1, t);
            light.intensity = this.sunIntensity * this._day;
            if (fog) {
                fog.intensity = 1;
            }
        } else {
            // the moon, rising at six and setting at six
            const [moonElevation, moonAzimuth] = this.sunPosition(hours - 12);
            this._aim(Math.max(moonElevation, 0.5), moonAzimuth);
            this._day = 0;
            light.color = this.moonColor;
            light.intensity = this.moonIntensity * math.smoothstep(0, 12, moonElevation);
            if (fog) {
                fog.intensity = this.moonShafts;
            }
        }
        light.enabled = light.intensity > 0.001;

        // the lamps come up as the sun goes down
        this._night = 1 - math.smoothstep(-2, 5, elevation);
        if (this._night !== this._lastNight) {
            this._lastNight = this._night;
            for (const lights of this._lamps.values()) {
                for (const { light: lampLight, intensity } of lights) {
                    lampLight.intensity = intensity * this._night;
                    lampLight.enabled = this._night > 0.001;
                }
            }
            for (const [material, emissive] of this._glows) {
                material.emissiveIntensity = emissive * this._night;
                material.update();
            }
            const glass = this.glass?.render?.meshInstances[0]?.material;
            if (glass) {
                glass.emissive.copy(this.glassGlow).mulScalar(this._night);
                glass.update();
            }
        }

        this.app.scene.skyboxIntensity = math.lerp(this.ambient.y, this.ambient.x, this._day);
        if (fog) {
            fog.ambientColor.lerp(this._fogNight, this._fogDay, this._day);
            fog.ambientIntensity = math.lerp(this.fogAmbient.y, this.fogAmbient.x, this._day);
        }
    }
}

/**
 * Swings a pendant lamp on its cord when the bells ring: this entity turns about its own origin,
 * where the cord hangs from, as a lightly damped pendulum of the cord's length. Each stroke of a
 * bell pushes it away from the belfry - a little for a quarter bell, three times as much for the
 * hour bell - so the lamp, and the pool of light under it, sways on after the strike.
 */
export class LampSway extends Script {
    static scriptName = 'lampSway';

    /**
     * The entity running the TowerChimes to feel.
     *
     * @attribute
     * @type {Entity}
     */
    chimes = null;

    /**
     * The length of the cord, in meters, which sets how slowly the lamp swings.
     *
     * @attribute
     * @type {number}
     */
    length = 3.6;

    /**
     * How quickly a swing dies away, as the fraction of its speed lost per second.
     *
     * @attribute
     * @type {number}
     * @range [0, 1]
     */
    damping = 0.07;

    /**
     * How hard a quarter bell's stroke pushes the lamp, in degrees per second.
     *
     * @attribute
     * @type {number}
     */
    push = 0.8;

    /** The swing about X (x) and Z (y), in degrees. */
    _angle = new Vec2();

    /** How fast each swing angle is changing, in degrees per second. */
    _rate = new Vec2();

    /** @type {TowerChimes|null} */
    _source = null;

    initialize() {
        this.on('destroy', () => this._source?.off('stroke', this.strike, this));
    }

    /**
     * Pushes the lamp as a bell sounds.
     *
     * @param {string} slot - The bell's slot name. The hour bell pushes hardest.
     */
    strike(slot) {
        const strength = this.push * (slot === 'hour' ? 3 : 1);
        away.sub2(this.entity.getPosition(), this.chimes.getPosition());
        away.y = 0;
        away.normalize();
        // a swing about +Z carries the lamp toward +X, one about +X toward -Z
        this._rate.x -= away.z * strength;
        this._rate.y += away.x * strength;
    }

    update(dt) {
        const source = this.chimes?.script?.towerChimes ?? null;
        if (source !== this._source) {
            this._source?.off('stroke', this.strike, this);
            source?.on('stroke', this.strike, this);
            this._source = source;
        }

        // a pendulum: an angular acceleration of g / L times the angle, less the damping
        const stiffness = 9.81 / Math.max(0.1, this.length);
        for (const axis of ['x', 'y']) {
            this._rate[axis] -= (stiffness * this._angle[axis] + 2 * this.damping * this._rate[axis]) * dt;
            this._angle[axis] += this._rate[axis] * dt;
        }
        this.entity.setLocalEulerAngles(this._angle.x, 0, this._angle.y);
    }
}

/**
 * Keeps a particle emitter in a beam of light: this entity is set halfway along the stretch of
 * the beam between `origin`, where the light comes in, and the floor, and turned to face along
 * it, so an emitter box long in Z fills the beam rather than the room.
 *
 * Dust glows brightest looking into the light, which lit particles - shaded as if facing the
 * camera - get backward, so the motes are unlit and the emitter simply stops while the light
 * falls weakly or not at all through the window facing `normal`. Stopped, the particles in the
 * air live out their lifetimes and fade, rather than vanishing.
 */
export class BeamDust extends Script {
    static scriptName = 'beamDust';

    /**
     * The entity of the directional light the beam is of.
     *
     * @attribute
     * @type {Entity}
     */
    light = null;

    /**
     * Where the light comes into the room.
     *
     * @attribute
     * @type {Vec3}
     */
    origin = new Vec3();

    /**
     * The direction the window lets light in along.
     *
     * @attribute
     * @type {Vec3}
     */
    normal = new Vec3(0, 0, 1);

    /**
     * The furthest along the beam to follow it, in meters.
     *
     * @attribute
     * @type {number}
     */
    reach = 6;

    /**
     * The least light through the window - the light's intensity times how squarely it falls
     * through - for which the emitter runs.
     *
     * @attribute
     * @type {number}
     */
    threshold = 1.5;

    // Whether the emitter was last told to run, kept here because isPlaying() can't say: a
    // stopped emitter still reports playing until its particles have lived out their lifetime,
    // and every stop() pushes that deadline back
    /** @type {boolean|null} */
    _emitting = null;

    update() {
        const light = this.light?.light;
        const ps = this.entity.particlesystem;
        if (!light || !ps) {
            return;
        }
        // a light shines down its entity's -Y
        beamDir.copy(this.light.up).mulScalar(-1);
        const through = light.enabled ? light.intensity * Math.max(0, beamDir.dot(this.normal)) : 0;
        const emitting = through >= this.threshold;
        if (emitting !== this._emitting) {
            this._emitting = emitting;
            if (emitting) {
                ps.play();
            } else {
                ps.stop();
            }
        }
        const toFloor = beamDir.y < -0.001 ? this.origin.y / -beamDir.y : this.reach;
        beamMid.copy(beamDir).mulScalar(Math.min(this.reach, toFloor) / 2).add(this.origin);
        this.entity.setPosition(beamMid);
        this.entity.lookAt(beamDir.add(beamMid));
    }
}
