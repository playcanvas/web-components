import { GestureRecognizer } from '@mediapipe/tasks-vision';
import {
    BLEND_ADDITIVEALPHA,
    CULLFACE_NONE,
    Entity,
    PIXELFORMAT_RGBA8,
    Script,
    StandardMaterial,
    Texture,
    Vec3
} from 'playcanvas';

/** The number of landmarks that MediaPipe reports for each hand. */
const NUM_LANDMARKS = 21;

/** The distance in front of the camera, in world units, at which visuals are placed. */
const DEPTH = 2;

/** The z scale of the flat glow quads (the camera never rotates, so no billboarding). */
const QUAD_DEPTH = 0.001;

/** Landmark indices. */
const WRIST = 0;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const FINGERTIPS = [4, 8, 12, 16, 20];
const PALM = [0, 5, 9, 13, 17];

/** Skeleton sizing in CSS pixels. */
const JOINT_PX = 13;
const TIP_PX = 20;
const BONE_PX = 5;

/** Per-slot hand colors: cyan and magenta. */
const HAND_COLORS = [
    [0.1, 0.85, 1],
    [1, 0.25, 0.85]
];

/** Accent colors for gesture bursts. */
const GESTURE_COLORS = {
    Thumb_Up: [1, 0.65, 0.15],
    Thumb_Down: [0.4, 0.5, 1],
    Victory: [0.3, 1, 0.5],
    ILoveYou: [1, 0.25, 0.45],
    Pointing_Up: [1, 1, 1]
};

/** The overbright tint of the index fingertip while Pointing_Up is held. */
const COMET_COLOR = [4.5, 4.5, 4.5];

/** Orb layer sizes (CSS pixels), base opacities and pulse amplitudes. */
const ORB_SIZES = [44, 100, 210];
const ORB_ALPHAS = [0.95, 0.5, 0.2];
const ORB_PULSES = [0.08, 0.06, 0.04];

function rand(scale) {
    return (Math.random() - 0.5) * scale;
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t) {
    return t * t;
}

/**
 * Writes an intensity-scaled RGB color into a Float32Array uniform.
 * @param {Float32Array} target - The destination array.
 * @param {number[]} rgb - The base color.
 * @param {number} intensity - The brightness multiplier.
 */
function setGlowColor(target, rgb, intensity) {
    target[0] = rgb[0] * intensity;
    target[1] = rgb[1] * intensity;
    target[2] = rgb[2] * intensity;
}

/**
 * Lerps a Float32Array color towards a target color in place.
 * @param {Float32Array} color - The color to modify.
 * @param {Float32Array|number[]} to - The target color.
 * @param {number} k - The interpolation factor.
 */
function lerpColor(color, to, k) {
    color[0] += (to[0] - color[0]) * k;
    color[1] += (to[1] - color[1]) * k;
    color[2] += (to[2] - color[2]) * k;
}

/**
 * Renders neon visuals for hands tracked by the `handGestureController` script:
 *
 * - A glowing skeleton (joints and bones) per hand, colored per slot.
 * - A sparkle trail streaming from the index fingertip (boosted into a comet by the
 *   Pointing_Up gesture).
 * - An energy orb that charges above the palm on Open_Palm and is crushed into a burst
 *   by Closed_Fist.
 * - A color-coded particle burst for each recognized gesture.
 * - A multicolored celebration burst when the application fires `gestures:complete`.
 *
 * Everything is drawn with a single additive material and a procedural glow texture,
 * positioned in world space via `screenToWorld` so it aligns with the camera feed behind
 * the transparent canvas. Attach this script to the camera entity, after the
 * `handGestureController` script.
 */
export class HandVisuals extends Script {
    static scriptName = 'handVisuals';

    /** @private */
    _root = null;

    /** @private */
    _texture = null;

    /** @private */
    _material = null;

    /** @private */
    _states = [];

    /** @private */
    _fx = [];

    /** @private */
    _fxNext = 0;

    /** @private */
    _hands = [];

    /** @private */
    _worldPerPixel = 0.001;

    /** @private */
    _tmpA = new Vec3();

    /** @private */
    _tmpB = new Vec3();

    /** @private */
    _tmpC = new Vec3();

    initialize() {
        this._root = new Entity('hand-visuals');
        this.app.root.addChild(this._root);

        this._texture = this._createGlowTexture();
        this._material = this._createGlowMaterial(this._texture);

        for (let i = 0; i < HAND_COLORS.length; i++) {
            this._states.push(this._createHandState(i));
        }
        for (let i = 0; i < 160; i++) {
            this._fx.push(this._createFxSprite(i));
        }

        const onHandsUpdate = (hands) => {
            this._hands = hands;
        };
        const onGesture = (slot, name) => this._onGesture(slot, name);
        const onHandLost = (slot) => this._onHandLost(slot);
        const onCelebrate = () => this._celebrate();

        this.app.on('hands:update', onHandsUpdate);
        this.app.on('hand:gesture', onGesture);
        this.app.on('hand:lost', onHandLost);
        this.app.on('gestures:complete', onCelebrate);

        this.on('destroy', () => {
            this.app.off('hands:update', onHandsUpdate);
            this.app.off('hand:gesture', onGesture);
            this.app.off('hand:lost', onHandLost);
            this.app.off('gestures:complete', onCelebrate);
            this._root.destroy();
            this._material.destroy();
            this._texture.destroy();
        });
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        const camera = this.entity.camera;
        if (!camera) return;

        // World units per CSS pixel at the working depth (fov is vertical)
        const canvas = this.app.graphicsDevice.canvas;
        this._worldPerPixel = (2 * DEPTH * Math.tan((camera.fov * Math.PI) / 360)) / canvas.clientHeight;

        for (const state of this._states) {
            state.payload = null;
        }
        for (const hand of this._hands) {
            const state = this._states[hand.slot];
            if (state) state.payload = hand;
        }

        for (const state of this._states) {
            this._updateHand(state, dt, camera);
        }
        this._updateFx(dt);
    }

    /**
     * Creates a soft radial glow texture.
     * @returns {Texture} The texture.
     * @private
     */
    _createGlowTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
        gradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.15)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new Texture(this.app.graphicsDevice, {
            width: size,
            height: size,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false
        });
        texture.setSource(canvas);
        texture.upload();

        return texture;
    }

    /**
     * Creates the shared additive glow material. Individual mesh instances tint and fade
     * it through the `material_emissive` and `material_opacity` uniform overrides.
     * @param {Texture} texture - The glow texture.
     * @returns {StandardMaterial} The material.
     * @private
     */
    _createGlowMaterial(texture) {
        const material = new StandardMaterial();
        material.useLighting = false;
        material.diffuse.set(0, 0, 0);
        material.emissive.set(1, 1, 1);
        material.emissiveMap = texture;
        material.opacityMap = texture;
        material.blendType = BLEND_ADDITIVEALPHA;
        material.depthWrite = false;
        material.cull = CULLFACE_NONE;
        material.update();
        return material;
    }

    /**
     * Creates a pooled glow quad with its own color and opacity uniform overrides.
     * @param {string} name - The entity name.
     * @returns {object} The quad record.
     * @private
     */
    _createQuad(name) {
        const entity = new Entity(name);
        entity.addComponent('render', {
            type: 'box',
            material: this._material,
            castShadows: false,
            receiveShadows: false
        });
        entity.enabled = false;
        this._root.addChild(entity);

        const mi = entity.render.meshInstances[0];
        const color = new Float32Array([1, 1, 1]);
        mi.setParameter('material_emissive', color);
        mi.setParameter('material_opacity', 0);

        return { entity, mi, color };
    }

    /**
     * Creates the pooled visuals and bookkeeping for one hand slot.
     * @param {number} slot - The slot index.
     * @returns {object} The hand state.
     * @private
     */
    _createHandState(slot) {
        const rgb = HAND_COLORS[slot];

        const joints = [];
        for (let i = 0; i < NUM_LANDMARKS; i++) {
            const record = this._createQuad(`joint-${slot}-${i}`);
            record.tip = FINGERTIPS.includes(i);
            setGlowColor(record.color, rgb, record.tip ? 3 : 1.9);
            joints.push(record);
        }

        const bones = GestureRecognizer.HAND_CONNECTIONS.map((connection, i) => {
            const record = this._createQuad(`bone-${slot}-${i}`);
            setGlowColor(record.color, rgb, 1.1);
            return record;
        });

        const layers = [];
        for (let i = 0; i < ORB_SIZES.length; i++) {
            const record = this._createQuad(`orb-${slot}-${i}`);
            setGlowColor(record.color, rgb, i === 0 ? 3.5 : 1.4);
            if (i === 0) lerpColor(record.color, [4, 4, 4], 0.45);
            layers.push(record);
        }

        const world = [];
        for (let i = 0; i < NUM_LANDMARKS; i++) {
            world.push(new Vec3());
        }

        const tipColor = new Float32Array(3);
        setGlowColor(tipColor, rgb, 3);

        return {
            slot,
            rgb,
            payload: null,
            wasPresent: false,
            alpha: 0,
            visible: false,
            joints,
            bones,
            world,
            tipColor,
            comet: false,
            trailAccum: 0,
            prevTip: new Vec3(),
            tipVel: new Vec3(),
            hasPrevTip: false,
            orb: {
                state: 'idle',
                t: 0,
                phase: 0,
                seeded: false,
                emitAccum: 0,
                pos: new Vec3(),
                layers
            }
        };
    }

    /**
     * Creates one pooled particle sprite.
     * @param {number} i - The sprite index.
     * @returns {object} The sprite record.
     * @private
     */
    _createFxSprite(i) {
        const record = this._createQuad(`fx-${i}`);
        record.active = false;
        record.age = 0;
        record.life = 1;
        record.size = 10;
        record.alpha = 1;
        record.gravity = 0;
        record.drag = 0;
        record.pos = new Vec3();
        record.vel = new Vec3();
        return record;
    }

    /**
     * Updates the skeleton, trail and orb of one hand slot.
     * @param {object} state - The hand state.
     * @param {number} dt - The delta time in seconds.
     * @param {import('playcanvas').CameraComponent} camera - The camera component.
     * @private
     */
    _updateHand(state, dt, camera) {
        const present = !!state.payload;

        // Ease overall visibility so hands fade in and out
        const target = present ? 1 : 0;
        state.alpha += (target - state.alpha) * Math.min(1, 1 - Math.exp(-10 * dt));

        const visible = state.alpha > 0.01;
        if (visible !== state.visible) {
            state.visible = visible;
            for (const joint of state.joints) joint.entity.enabled = visible;
            for (const bone of state.bones) bone.entity.enabled = visible;
        }

        if (present) {
            const landmarks = state.payload.screenLandmarks;

            // Project the smoothed screen-space landmarks into world space
            for (let i = 0; i < NUM_LANDMARKS; i++) {
                camera.screenToWorld(landmarks[i].x, landmarks[i].y, DEPTH, state.world[i]);
            }

            // A little radial poof to greet a newly acquired hand
            if (!state.wasPresent) {
                this._burstRadial(state.world[WRIST], state.rgb, 12, 1.2, 2.2);
            }

            // The index fingertip glows white-hot while Pointing_Up is held
            lerpColor(
                state.joints[INDEX_TIP].color,
                state.comet ? COMET_COLOR : state.tipColor,
                Math.min(1, 1 - Math.exp(-8 * dt))
            );

            this._updateTrail(state, dt);
        } else {
            state.hasPrevTip = false;
        }

        if (visible) {
            const wpp = this._worldPerPixel;
            const landmarks = present ? state.payload.screenLandmarks : null;

            for (let i = 0; i < NUM_LANDMARKS; i++) {
                const joint = state.joints[i];
                joint.entity.setLocalPosition(state.world[i]);

                // MediaPipe z is negative towards the camera - use it to swell nearer joints
                const zBoost = landmarks ? Math.max(0.7, Math.min(1.7, 1 - landmarks[i].z * 5)) : 1;
                const s = (joint.tip ? TIP_PX : JOINT_PX) * zBoost * wpp;
                joint.entity.setLocalScale(s, s, QUAD_DEPTH);
                joint.mi.setParameter('material_opacity', state.alpha * 0.95);
            }

            const connections = GestureRecognizer.HAND_CONNECTIONS;
            for (let i = 0; i < connections.length; i++) {
                const bone = state.bones[i];
                const a = state.world[connections[i].start];
                const b = state.world[connections[i].end];

                this._tmpA.add2(a, b).mulScalar(0.5);
                bone.entity.setLocalPosition(this._tmpA);

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                bone.entity.setLocalEulerAngles(0, 0, (Math.atan2(dy, dx) * 180) / Math.PI);
                bone.entity.setLocalScale(length, BONE_PX * wpp, QUAD_DEPTH);
                bone.mi.setParameter('material_opacity', state.alpha * 0.55);
            }
        }

        this._updateOrb(state, dt);
        state.wasPresent = present;
    }

    /**
     * Emits trail sparkles from the index fingertip.
     * @param {object} state - The hand state.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateTrail(state, dt) {
        const tip = state.world[INDEX_TIP];

        if (state.hasPrevTip && dt > 0) {
            this._tmpA.sub2(tip, state.prevTip).mulScalar(1 / dt);
            state.tipVel.lerp(state.tipVel, this._tmpA, 0.5);
        }
        state.prevTip.copy(tip);
        state.hasPrevTip = true;

        state.trailAccum += dt * (state.comet ? 90 : 26);
        let count = Math.floor(state.trailAccum);
        state.trailAccum -= count;
        count = Math.min(count, 5);

        for (let i = 0; i < count; i++) {
            this._tmpA.set(tip.x + rand(0.04), tip.y + rand(0.04), tip.z);
            this._tmpB.set(state.tipVel.x * 0.2 + rand(0.3), state.tipVel.y * 0.2 + rand(0.3) + 0.15, 0);
            if (state.comet) {
                this._spawn(this._tmpA, this._tmpB, GESTURE_COLORS.Pointing_Up, 3.2, {
                    life: 0.45,
                    size: 15,
                    gravity: 0.2,
                    drag: 2
                });
            } else {
                this._spawn(this._tmpA, this._tmpB, state.rgb, 2.2, {
                    life: 0.6,
                    size: 9,
                    gravity: 0.25,
                    drag: 2.5
                });
            }
        }
    }

    /**
     * Updates the energy orb of one hand slot.
     * @param {object} state - The hand state.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateOrb(state, dt) {
        const orb = state.orb;
        const active = orb.state !== 'idle';

        for (const layer of orb.layers) {
            if (layer.entity.enabled !== active) layer.entity.enabled = active;
        }
        if (!active) return;

        // The orb hovers above the palm and chases it softly
        if (state.payload) {
            this._palmCenter(state, this._tmpA);
            this._tmpA.y += 0.42;
            if (!orb.seeded) {
                orb.pos.copy(this._tmpA);
                orb.seeded = true;
            } else {
                orb.pos.lerp(orb.pos, this._tmpA, Math.min(1, 1 - Math.exp(-12 * dt)));
            }
        }

        orb.phase += dt * 4.5;

        let scale = 1;
        let alpha = 1;
        let boost = 1;

        switch (orb.state) {
            case 'in':
                orb.t = Math.min(1, orb.t + dt / 0.35);
                scale = easeOutCubic(orb.t);
                if (orb.t >= 1) orb.state = 'active';
                break;
            case 'out':
                orb.t = Math.min(1, orb.t + dt / 0.45);
                alpha = 1 - easeInQuad(orb.t);
                scale = 1 - 0.25 * orb.t;
                if (orb.t >= 1) orb.state = 'idle';
                break;
            case 'crush':
                orb.t = Math.min(1, orb.t + dt / 0.22);
                scale = 1 - 0.85 * easeInQuad(orb.t);
                boost = 1 + orb.t * 2.5;
                if (orb.t >= 1) {
                    orb.state = 'idle';
                    this._burstRadial(orb.pos, state.rgb, 30, 2.6, 3, {
                        life: 0.75,
                        size: 13,
                        gravity: -0.6,
                        drag: 1.2
                    });
                }
                break;
            default:
                break;
        }

        // Sparkles drift up from an active orb
        if (orb.state === 'active') {
            orb.emitAccum += dt * 9;
            let count = Math.floor(orb.emitAccum);
            orb.emitAccum -= count;
            count = Math.min(count, 3);
            for (let i = 0; i < count; i++) {
                this._tmpA.set(orb.pos.x + rand(0.3), orb.pos.y + rand(0.3), orb.pos.z);
                this._tmpB.set(rand(0.4), 0.4 + Math.random() * 0.4, 0);
                this._spawn(this._tmpA, this._tmpB, state.rgb, 2.4, { life: 0.9, size: 7, drag: 0.5 });
            }
        }

        const a = alpha * state.alpha;
        for (let i = 0; i < orb.layers.length; i++) {
            const layer = orb.layers[i];
            const pulse = 1 + ORB_PULSES[i] * Math.sin(orb.phase + i * 1.3);
            const s = ORB_SIZES[i] * scale * pulse * this._worldPerPixel;
            layer.entity.setLocalPosition(orb.pos);
            layer.entity.setLocalScale(s, s, QUAD_DEPTH);
            layer.mi.setParameter('material_opacity', ORB_ALPHAS[i] * a * boost);
        }
    }

    /**
     * Integrates and fades the active particle sprites.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateFx(dt) {
        const wpp = this._worldPerPixel;

        for (const record of this._fx) {
            if (!record.active) continue;

            record.age += dt;
            if (record.age >= record.life) {
                record.active = false;
                record.entity.enabled = false;
                continue;
            }

            record.vel.y += record.gravity * dt;
            if (record.drag > 0) {
                record.vel.mulScalar(Math.max(0, 1 - record.drag * dt));
            }
            record.pos.x += record.vel.x * dt;
            record.pos.y += record.vel.y * dt;
            record.pos.z += record.vel.z * dt;
            record.entity.setLocalPosition(record.pos);

            const t = record.age / record.life;
            const fade = (1 - t) * (1 - t);
            const s = record.size * (1 - 0.7 * t) * wpp;
            record.entity.setLocalScale(s, s, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', record.alpha * fade);
        }
    }

    /**
     * Spawns one particle sprite from the pool.
     * @param {Vec3} pos - The spawn position.
     * @param {Vec3} vel - The initial velocity.
     * @param {number[]} rgb - The base color.
     * @param {number} intensity - The brightness multiplier.
     * @param {object} [opts] - The sprite options.
     * @param {number} [opts.life] - The lifetime in seconds.
     * @param {number} [opts.size] - The starting size in CSS pixels.
     * @param {number} [opts.alpha] - The base opacity.
     * @param {number} [opts.gravity] - The vertical acceleration in world units per second squared.
     * @param {number} [opts.drag] - The velocity damping factor.
     * @private
     */
    _spawn(pos, vel, rgb, intensity, { life = 0.7, size = 10, alpha = 1, gravity = 0, drag = 0 } = {}) {
        const record = this._fx[this._fxNext];
        this._fxNext = (this._fxNext + 1) % this._fx.length;

        record.active = true;
        record.age = 0;
        record.life = life;
        record.size = size;
        record.alpha = alpha;
        record.gravity = gravity;
        record.drag = drag;
        record.pos.copy(pos);
        record.vel.copy(vel);
        setGlowColor(record.color, rgb, intensity);
        record.entity.setLocalPosition(record.pos);
        record.entity.enabled = true;
    }

    /**
     * Computes the palm center of a hand in world space.
     * @param {object} state - The hand state.
     * @param {Vec3} out - The result.
     * @returns {Vec3} The palm center.
     * @private
     */
    _palmCenter(state, out) {
        out.set(0, 0, 0);
        for (const i of PALM) {
            out.add(state.world[i]);
        }
        return out.mulScalar(1 / PALM.length);
    }

    /**
     * Spawns a radial burst of sprites.
     * @param {Vec3} pos - The burst origin.
     * @param {number[]} rgb - The base color.
     * @param {number} count - The number of sprites.
     * @param {number} speed - The base outward speed.
     * @param {number} intensity - The brightness multiplier.
     * @param {object} [opts] - Overrides for the sprite options.
     * @private
     */
    _burstRadial(pos, rgb, count, speed, intensity, opts = { life: 0.55, size: 10, gravity: -0.8, drag: 1 }) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rand(0.5);
            const v = speed * (0.7 + Math.random() * 0.6);
            this._tmpB.set(Math.cos(angle) * v, Math.sin(angle) * v + 0.2, 0);
            this._spawn(pos, this._tmpB, rgb, intensity, opts);
        }
    }

    /**
     * Reacts to a stable gesture change on a hand.
     * @param {number} slot - The hand slot.
     * @param {string} name - The gesture name.
     * @private
     */
    _onGesture(slot, name) {
        const state = this._states[slot];
        if (!state) return;

        state.comet = name === 'Pointing_Up';

        const orb = state.orb;

        if (name === 'Open_Palm') {
            if (orb.state === 'idle' || orb.state === 'out') {
                orb.state = 'in';
                orb.t = 0;
                orb.seeded = false;
            }
            return;
        }

        if (name === 'Closed_Fist') {
            if (orb.state === 'in' || orb.state === 'active') {
                // Crush the orb - the burst fires when the collapse completes
                orb.state = 'crush';
                orb.t = 0;
            } else if (state.payload) {
                this._burstImplosion(state);
            }
            return;
        }

        // Any other gesture releases the orb gently
        if (orb.state === 'in' || orb.state === 'active') {
            orb.state = 'out';
            orb.t = 0;
        }

        if (!state.payload) return;

        switch (name) {
            case 'Thumb_Up':
                this._burstColumn(state, GESTURE_COLORS.Thumb_Up, 1);
                break;
            case 'Thumb_Down':
                this._burstColumn(state, GESTURE_COLORS.Thumb_Down, -1);
                break;
            case 'Victory':
                this._burstFountain(state.world[INDEX_TIP]);
                this._burstFountain(state.world[MIDDLE_TIP]);
                break;
            case 'ILoveYou':
                this._palmCenter(state, this._tmpA);
                this._burstRadial(this._tmpA, GESTURE_COLORS.ILoveYou, 30, 2, 2.8, {
                    life: 0.8,
                    size: 12,
                    gravity: -1,
                    drag: 1.2
                });
                break;
            case 'Pointing_Up':
                this._burstRadial(state.world[INDEX_TIP], GESTURE_COLORS.Pointing_Up, 8, 0.9, 3, {
                    life: 0.4,
                    size: 8,
                    drag: 2
                });
                break;
            default:
                break;
        }
    }

    /**
     * Spawns a rising or falling column burst from the palm.
     * @param {object} state - The hand state.
     * @param {number[]} rgb - The base color.
     * @param {number} dir - 1 for up, -1 for down.
     * @private
     */
    _burstColumn(state, rgb, dir) {
        this._palmCenter(state, this._tmpA);
        for (let i = 0; i < 24; i++) {
            this._tmpB.set(rand(0.9), dir * (1.5 + Math.random() * 1.5), 0);
            this._spawn(this._tmpA, this._tmpB, rgb, 2.6, {
                life: 0.8 + Math.random() * 0.4,
                size: 11,
                gravity: dir * -1.6,
                drag: 0.4
            });
        }
    }

    /**
     * Spawns an upward fountain burst from a fingertip.
     * @param {Vec3} tip - The fingertip position.
     * @private
     */
    _burstFountain(tip) {
        for (let i = 0; i < 14; i++) {
            this._tmpB.set(rand(1.4), 1.4 + Math.random() * 1.4, 0);
            this._spawn(tip, this._tmpB, GESTURE_COLORS.Victory, 2.8, {
                life: 0.7 + Math.random() * 0.3,
                size: 10,
                gravity: -1.8,
                drag: 0.4
            });
        }
    }

    /**
     * Spawns sprites that converge on the fist, ending in a small flash.
     * @param {object} state - The hand state.
     * @private
     */
    _burstImplosion(state) {
        const center = this._palmCenter(state, this._tmpA);
        const life = 0.32;
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2 + rand(0.4);
            const radius = 0.5 + Math.random() * 0.15;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            this._tmpB.set(center.x + dx * radius, center.y + dy * radius, center.z);
            this._tmpC.set((-dx * radius) / life, (-dy * radius) / life, 0);
            this._spawn(this._tmpB, this._tmpC, state.rgb, 2.4, { life, size: 9, alpha: 0.9 });
        }
        // A brief flash at the center
        this._tmpC.set(0, 0, 0);
        this._spawn(center, this._tmpC, state.rgb, 3.5, { life: 0.28, size: 42, alpha: 0.85 });
    }

    /**
     * Fires a large multicolored burst at the center of the screen.
     * @private
     */
    _celebrate() {
        const camera = this.entity.camera;
        if (!camera) return;

        const canvas = this.app.graphicsDevice.canvas;
        camera.screenToWorld(canvas.clientWidth * 0.5, canvas.clientHeight * 0.45, DEPTH, this._tmpA);

        const palette = [
            GESTURE_COLORS.Thumb_Up,
            GESTURE_COLORS.Victory,
            GESTURE_COLORS.ILoveYou,
            GESTURE_COLORS.Thumb_Down,
            HAND_COLORS[0],
            HAND_COLORS[1]
        ];

        for (let i = 0; i < 90; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.4 + Math.random() * 2.2;
            this._tmpB.set(Math.cos(angle) * speed, Math.sin(angle) * speed + 0.4, 0);
            this._spawn(this._tmpA, this._tmpB, palette[i % palette.length], 2.8, {
                life: 0.9 + Math.random() * 0.7,
                size: 10 + Math.random() * 6,
                gravity: -0.9,
                drag: 0.6
            });
        }
    }

    /**
     * Reacts to a hand disappearing.
     * @param {number} slot - The hand slot.
     * @private
     */
    _onHandLost(slot) {
        const state = this._states[slot];
        if (!state) return;

        state.comet = false;
        if (state.orb.state === 'in' || state.orb.state === 'active') {
            state.orb.state = 'out';
            state.orb.t = 0;
        }
    }
}
