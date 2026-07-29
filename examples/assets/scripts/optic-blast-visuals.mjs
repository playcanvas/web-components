import {
    ADDRESS_CLAMP_TO_EDGE,
    BLEND_ADDITIVEALPHA,
    CULLFACE_NONE,
    Entity,
    LAYERID_WORLD,
    Layer,
    PIXELFORMAT_RGBA8,
    Script,
    StandardMaterial,
    Texture,
    Vec3
} from 'playcanvas';

/** The z scale of the flat glow quads. */
const QUAD_DEPTH = 0.001;

/** The world-space beam direction (canonical face space faces +Z). */
const BEAM_DIR_Z = 1;

/** The seconds the beam takes to erupt to full length. */
const ERUPT_TIME = 0.12;

/** The seconds an aborted charge takes to fizzle out. */
const FIZZLE_TIME = 0.3;

/**
 * The nested beam layers, inside out - elliptical cylinders shaped like the visor slit:
 * wide and thin. Each layer drifts between two ruby-adjacent colors so the blast subtly
 * shifts across the spectrum while it fires. Sizes are full extents in centimeters.
 */
const BEAM_LAYERS = [
    { width: 11, height: 1.4, alpha: 0.95, colorA: [5.0, 0.85, 0.9], colorB: [5.0, 0.55, 1.3] },
    { width: 13.5, height: 3.6, alpha: 0.65, colorA: [2.4, 0.14, 0.2], colorB: [2.2, 0.26, 0.5] },
    { width: 16, height: 7, alpha: 0.34, colorA: [1.2, 0.05, 0.1], colorB: [1.0, 0.09, 0.28] }
];

/** The muzzle flash layer sizes in centimeters and their base opacities. */
const MUZZLE_SIZES = [10, 22, 40];
const MUZZLE_ALPHAS = [0.9, 0.45, 0.16];

/** The per-eye charge glow layer sizes at full charge and their base opacities. */
const CHARGE_SIZES = [7, 15];
const CHARGE_ALPHAS = [0.9, 0.45];

/** The base ruby tint used by sparks and markers. */
const RUBY = [1, 0.07, 0.16];

/** The near-white tint of crackle arcs and the beam flash. */
const HOT_PINK = [1, 0.55, 0.6];

/** The half extent of the visor slit in centimeters, used to place crackle arcs. */
const SLIT_HALF_WIDTH = 6;

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
 * Maps a value smoothly from 0 to 1 across an edge range.
 * @param {number} a - The lower edge.
 * @param {number} b - The upper edge.
 * @param {number} x - The value.
 * @returns {number} The smoothed result.
 */
function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
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
 * Renders the visor's ruby optic blast, driven by the events of the `opticBlastTracking`
 * script:
 *
 * - Touching the side of the head starts a charge: a glow builds over each eye while
 *   energy crackles across the visor slit and the visor itself glows hotter. As the
 *   charge completes, the two glows merge at the center of the slit.
 * - Once fully charged the blast erupts: a pulsing, vibrating energy beam of nested
 *   additive cylinders that fires along the head's +Z axis for as long as the touch is
 *   held, its ruby tint drifting subtly across the spectrum.
 * - Releasing the touch shuts the beam off quickly; releasing during the charge fizzles
 *   it out instead. Pulsing ring markers hint at the two touch zones until the first
 *   successful hand-triggered blast.
 *
 * Because the tracking script expresses head motion by moving the camera, the beam is
 * static in world space - turning your head naturally sweeps the blast across the frame.
 * Charge, blast, beam and shutdown sound effects accompany the experience (audio unlocks
 * on the first pointer interaction).
 *
 * Everything is drawn with additive materials and procedural glow textures. Attach this
 * script to the camera entity, after the `opticBlastTracking` script.
 *
 * Fires the following events on the application:
 *
 * - `blast:charging` - Fired with (side) when a charge begins.
 * - `blast:fire` - Fired with (side) when the beam erupts.
 * - `blast:end` - Fired when the beam has shut off or the charge has fizzled.
 */
export class OpticBlastVisuals extends Script {
    static scriptName = 'opticBlastVisuals';

    /**
     * The muzzle position of the beam - the center of the visor slit - in world
     * (canonical face space) centimeters.
     * @type {Vec3}
     * @attribute
     */
    beamOrigin = new Vec3(0, 3, 9.5);

    /**
     * The full length of the beam in centimeters.
     * @type {number}
     * @attribute
     */
    beamLength = 600;

    /**
     * The seconds a touch must be held before the blast fires.
     * @type {number}
     * @attribute
     */
    chargeTime = 3;

    /**
     * The seconds the beam takes to shut off once the touch is released.
     * @type {number}
     * @attribute
     */
    shutoffTime = 0.2;

    /**
     * The sideways offset of each eye's charge glow from the beam origin, in world
     * centimeters.
     * @type {number}
     * @attribute
     */
    eyeOffset = 3.2;

    /**
     * The position of the right ear touch marker in world centimeters (the left marker is
     * mirrored across x).
     * @type {Vec3}
     * @attribute
     */
    markerOffset = new Vec3(8.8, 3, 0.5);

    /**
     * The camera shake intensity while charging and firing. Set to 0 to disable.
     * @type {number}
     * @attribute
     */
    shake = 1;

    /**
     * Whether to play the blast sound effects.
     * @type {boolean}
     * @attribute
     */
    sound = true;

    /**
     * The visor entity whose materials glow during the blast. Defaults to the entity
     * named 'visor'.
     * @type {Entity|null}
     * @attribute
     */
    visorEntity = null;

    /**
     * Whether to hide the parts of the visor (like its arms) that pass behind the head,
     * using an invisible depth-only ellipsoid.
     * @type {boolean}
     * @attribute
     */
    occludeHead = true;

    /**
     * The center of the head occluder ellipsoid in world centimeters.
     * @type {Vec3}
     * @attribute
     */
    occluderCenter = new Vec3(0, 0.5, -1.5);

    /**
     * The size of the head occluder ellipsoid in world centimeters.
     * @type {Vec3}
     * @attribute
     */
    occluderSize = new Vec3(15.5, 21, 19);

    /** @private */
    _root = null;

    /** @private */
    _beamPivot = null;

    /** @private */
    _beamLayers = [];

    /** @private */
    _muzzle = [];

    /** @private */
    _chargeGlow = [];

    /** @private */
    _markers = [];

    /** @private */
    _rings = [];

    /** @private */
    _ringNext = 0;

    /** @private */
    _fx = [];

    /** @private */
    _fxNext = 0;

    /** @private */
    _arcs = [];

    /** @private */
    _arcNext = 0;

    /** @private */
    _blobTexture = null;

    /** @private */
    _beamTexture = null;

    /** @private */
    _ringTexture = null;

    /** @private */
    _blobMaterial = null;

    /** @private */
    _beamMaterial = null;

    /** @private */
    _ringMaterial = null;

    /** @private */
    _state = 'idle';

    /** @private */
    _stateT = 0;

    /** @private */
    _touchSides = new Set();

    /** @private */
    _lastTouchSide = 'screen';

    /** @private */
    _handBlastDone = false;

    /** @private */
    _faceVisible = false;

    /** @private */
    _phase = 0;

    /** @private */
    _huePhase = 0;

    /** @private */
    _sparkAccum = 0;

    /** @private */
    _emberAccum = 0;

    /** @private */
    _arcAccum = 0;

    /** @private */
    _convergeAccum = 0;

    /** @private */
    _visor = null;

    /** @private */
    _visorMis = null;

    /** @private */
    _visorGlow = new Float32Array([1, 1, 1]);

    /** @private */
    _occluder = null;

    /** @private */
    _audio = null;

    /** @private */
    _audioFailed = false;

    /** @private */
    _chargeNodes = null;

    /** @private */
    _roarNodes = null;

    /** @private */
    _tmpA = new Vec3();

    /** @private */
    _tmpB = new Vec3();

    initialize() {
        this._root = new Entity('optic-blast');
        this._root.enabled = false;
        this.app.root.addChild(this._root);

        this._blobTexture = this._createBlobTexture();
        this._beamTexture = this._createBeamTexture();
        this._ringTexture = this._createRingTexture();
        this._blobMaterial = this._createFxMaterial(this._blobTexture);
        this._beamMaterial = this._createFxMaterial(this._beamTexture);
        this._ringMaterial = this._createFxMaterial(this._ringTexture);

        this._createBeam();
        this._createMuzzle();
        this._createMarkers();
        if (this.occludeHead) this._createOccluder();
        for (let i = 0; i < 3; i++) {
            this._rings.push(this._createRing(i));
        }
        for (let i = 0; i < 120; i++) {
            this._fx.push(this._createFxSprite(i));
        }
        for (let i = 0; i < 24; i++) {
            this._arcs.push(this._createArc(i));
        }

        const onTouch = side => this._onTouch(side);
        const onRelease = side => this._onRelease(side);
        const onFaceFound = () => this._onFaceFound();
        const onFaceLost = () => this._onFaceLost();
        // Any input gesture may be the one that unlocks audio playback - the sim mode is
        // driven by the space bar and never produces a pointer event
        const onUnlock = () => this._audio?.ctx.resume().catch(() => {});

        this.app.on('visor:touch', onTouch);
        this.app.on('visor:release', onRelease);
        this.app.on('face:found', onFaceFound);
        this.app.on('face:lost', onFaceLost);
        window.addEventListener('pointerdown', onUnlock);
        window.addEventListener('keydown', onUnlock);

        this._ensureAudio();

        this.on('destroy', () => {
            this.app.off('visor:touch', onTouch);
            this.app.off('visor:release', onRelease);
            this.app.off('face:found', onFaceFound);
            this.app.off('face:lost', onFaceLost);
            window.removeEventListener('pointerdown', onUnlock);
            window.removeEventListener('keydown', onUnlock);
            this._audio?.ctx.close().catch(() => {});
            this._audio = null;
            if (this._occluder) {
                this.app.scene.layers.remove(this._occluder.layer);
                this._occluder.material.destroy();
                this._occluder = null;
            }
            this._root.destroy();
            this._blobMaterial.destroy();
            this._beamMaterial.destroy();
            this._ringMaterial.destroy();
            this._blobTexture.destroy();
            this._beamTexture.destroy();
            this._ringTexture.destroy();
        });
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        this._phase += dt;
        this._huePhase += dt * 2.1;
        this._stateT += dt;

        this._updateVisor();
        this._updateState(dt);
        this._updateMarkers();
        this._updateArcs(dt);
        this._updateRings(dt);
        this._updateFx(dt);
        this._applyShake(dt);
    }

    // -------------------------------------------------------------------------------- //
    //  State machine                                                                    //
    // -------------------------------------------------------------------------------- //

    /**
     * Reacts to a touch beginning on an ear (or the pointer fallback).
     * @param {string} side - The touch side.
     * @private
     */
    _onTouch(side) {
        this._touchSides.add(side);
        this._lastTouchSide = side;

        // Without a tracked face there is nothing to render - the held touch starts its
        // charge when the face appears (see the idle case of _enterState)
        if (!this._faceVisible) return;

        if (this._state === 'idle' || this._state === 'fizzle' || this._state === 'shutoff') {
            this._enterState('charging');
        }
    }

    /**
     * Reacts to a touch ending.
     * @param {string} side - The touch side.
     * @private
     */
    _onRelease(side) {
        this._touchSides.delete(side);
        if (this._touchSides.size > 0) return;

        if (this._state === 'charging') {
            this._enterState('fizzle');
        } else if (this._state === 'firing') {
            this._enterState('shutoff');
        }
    }

    /**
     * Reacts to the face being detected or reacquired.
     * @private
     */
    _onFaceFound() {
        this._faceVisible = true;
        this._root.enabled = true;
        if (this._touchSides.size > 0 && this._state === 'idle') {
            this._enterState('charging');
        }
    }

    /**
     * Reacts to the face being lost: everything hides and a live blast shuts down.
     * @private
     */
    _onFaceLost() {
        this._faceVisible = false;
        this._root.enabled = false;
        if (this._state === 'charging') {
            this._enterState('fizzle');
        } else if (this._state === 'firing') {
            this._enterState('shutoff');
        }
    }

    /**
     * Switches the blast state machine to a new state and runs its entry actions.
     * @param {string} state - The new state.
     * @private
     */
    _enterState(state) {
        this._state = state;
        this._stateT = 0;

        switch (state) {
            case 'charging':
                // A re-touch can interrupt the shutoff state - never leave its beam behind
                this._setBeamEnabled(false);
                this._soundCharge();
                this.app.fire('blast:charging', this._lastTouchSide);
                break;
            case 'firing': {
                let side = this._lastTouchSide;
                for (const s of this._touchSides) {
                    if (s !== 'screen') side = s;
                }
                if (side !== 'screen') this._handBlastDone = true;
                this._erupt();
                this.app.fire('blast:fire', side);
                break;
            }
            case 'shutoff':
                this._soundShutoff();
                this._burstRadial(this.beamOrigin, RUBY, 10, 60, 2.2, { life: 0.4, size: 3.5, drag: 2 });
                break;
            case 'fizzle':
                this._soundChargeEnd(true);
                break;
            case 'idle':
                this.app.fire('blast:end');
                // A touch still held (e.g. through a face loss) starts a fresh charge
                if (this._faceVisible && this._touchSides.size > 0) {
                    this._enterState('charging');
                }
                break;
            default:
                break;
        }
    }

    /**
     * Advances the active blast state.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateState(dt) {
        switch (this._state) {
            case 'charging': {
                const t = Math.min(1, this._stateT / Math.max(0.01, this.chargeTime));
                this._updateCharge(t, dt);
                if (t >= 1) this._enterState('firing');
                break;
            }
            case 'firing':
                this._setChargeGlow(0, 0);
                this._updateBeam(dt, 1);
                break;
            case 'shutoff': {
                const t = Math.min(1, this._stateT / Math.max(0.01, this.shutoffTime));
                this._updateBeam(dt, 1 - easeInQuad(t));
                if (t >= 1) {
                    this._setBeamEnabled(false);
                    this._enterState('idle');
                }
                break;
            }
            case 'fizzle': {
                const t = Math.min(1, this._stateT / FIZZLE_TIME);
                const fade = 1 - t;
                this._setChargeGlow(fade * 0.5, fade);
                if (t >= 1) {
                    this._setChargeGlow(0, 0);
                    this._enterState('idle');
                }
                break;
            }
            default:
                this._setChargeGlow(0, 0);
                break;
        }
    }

    // -------------------------------------------------------------------------------- //
    //  Charge                                                                           //
    // -------------------------------------------------------------------------------- //

    /**
     * Animates the building charge: a growing slit glow, crackling arcs and sparks that
     * converge on the visor.
     * @param {number} t - The normalized charge progress.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateCharge(t, dt) {
        this._setChargeGlow(t, 1);

        // Crackle arcs jitter across the slit at an escalating rate
        this._arcAccum += dt * (6 + 40 * t * t);
        let arcs = Math.floor(this._arcAccum);
        this._arcAccum -= arcs;
        arcs = Math.min(arcs, 4);
        for (let i = 0; i < arcs; i++) {
            this._spawnArc(t);
        }

        // Energy motes stream inward and vanish into one eye or the other
        this._convergeAccum += dt * (5 + 30 * t);
        let motes = Math.floor(this._convergeAccum);
        this._convergeAccum -= motes;
        motes = Math.min(motes, 4);
        for (let i = 0; i < motes; i++) {
            const eyeX = this.beamOrigin.x + (Math.random() < 0.5 ? 1 : -1) * this.eyeOffset;
            const angle = Math.random() * Math.PI * 2;
            const radius = 10 + Math.random() * 10;
            const life = 0.32;
            this._tmpA.set(
                eyeX + Math.cos(angle) * radius,
                this.beamOrigin.y + Math.sin(angle) * radius * 0.7,
                this.beamOrigin.z + rand(3)
            );
            this._tmpB.set(
                (eyeX - this._tmpA.x) / life,
                (this.beamOrigin.y - this._tmpA.y) / life,
                (this.beamOrigin.z - this._tmpA.z) / life
            );
            this._spawn(this._tmpA, this._tmpB, RUBY, 2.4 + t * 1.2, { life, size: 2.6, alpha: 0.9 });
        }
    }

    /**
     * Sets the size and opacity of the charge glow building over each eye. As the charge
     * nears completion the two glows drift together, merging into the central eruption.
     * @param {number} amount - The normalized charge amount driving the size.
     * @param {number} alpha - An additional opacity multiplier.
     * @private
     */
    _setChargeGlow(amount, alpha) {
        const camRot = this.entity.getRotation();
        const gather = 1 - 0.8 * smoothstep(0.55, 1, amount);

        for (const record of this._chargeGlow) {
            const visible = amount > 0.001 && alpha > 0.001;
            if (record.entity.enabled !== visible) record.entity.enabled = visible;
            if (!visible) continue;

            const pulse = 1 + 0.12 * Math.sin(this._phase * 11 + record.layer * 1.7 + record.eye * 1.3);
            const size = (1.5 + CHARGE_SIZES[record.layer] * amount) * pulse;
            this._tmpA.set(
                this.beamOrigin.x + record.eye * this.eyeOffset * gather,
                this.beamOrigin.y,
                this.beamOrigin.z
            );
            record.entity.setPosition(this._tmpA);
            record.entity.setRotation(camRot);
            record.entity.setLocalScale(size * 1.4, size * 0.8, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', CHARGE_ALPHAS[record.layer] * alpha * (0.35 + 0.65 * amount));
        }
    }

    // -------------------------------------------------------------------------------- //
    //  Beam                                                                             //
    // -------------------------------------------------------------------------------- //

    /**
     * Runs the eruption moment: flash, shockwave ring and radial burst.
     * @private
     */
    _erupt() {
        this._setBeamEnabled(true);
        this._soundChargeEnd(false);
        this._soundFire();

        // A blinding flash at the muzzle
        this._tmpB.set(0, 0, 0);
        this._spawn(this.beamOrigin, this._tmpB, HOT_PINK, 4, { life: 0.28, size: 55, alpha: 0.95 });

        // An expanding shockwave ring
        this._spawnRing(this.beamOrigin, 0.45, 8, 85, 0.9);

        // Sparks scatter in all directions
        this._burstRadial(this.beamOrigin, RUBY, 26, 130, 3, { life: 0.5, size: 3.5, drag: 1.5 });
    }

    /**
     * Animates the firing beam: length, pulse, vibration and spectral drift.
     * @param {number} dt - The delta time in seconds.
     * @param {number} strength - The overall beam strength (ramps down during shutoff).
     * @private
     */
    _updateBeam(dt, strength) {
        // Erupt to full length quickly, then hold
        const grow = this._state === 'firing' ?
            easeOutCubic(Math.min(1, this._stateT / ERUPT_TIME)) : 1;
        const length = this.beamLength * grow;

        // The beam reads as a disc when it fires straight at (or away from) the viewer, so
        // ease it off and let the muzzle flash carry that pose
        const towards = Math.abs(this.entity.forward.z * BEAM_DIR_Z);
        const att = 1 - 0.5 * smoothstep(0.85, 0.98, towards);

        // Pulse and vibrate: layered oscillations plus a little per-frame noise
        const pulse = 1 +
            0.09 * Math.sin(this._phase * Math.PI * 2 * 11) +
            0.05 * Math.sin(this._phase * Math.PI * 2 * 17 + 1.7) +
            rand(0.05);
        const flicker = 0.9 + 0.1 * Math.sin(this._phase * Math.PI * 2 * 13 + 0.7) + rand(0.08);

        // The whole beam trembles about its origin
        this._beamPivot.setLocalPosition(
            this.beamOrigin.x + rand(0.7) * strength,
            this.beamOrigin.y + rand(0.7) * strength,
            this.beamOrigin.z
        );

        const widthScale = pulse * (0.35 + 0.65 * strength);
        const hueMix = 0.5 + 0.5 * Math.sin(this._huePhase);

        for (let i = 0; i < this._beamLayers.length; i++) {
            const record = this._beamLayers[i];
            const layer = BEAM_LAYERS[i];

            // Drift each layer between its two spectral endpoints, offset in phase so the
            // core, body and halo shimmer independently
            const mix = 0.5 + 0.5 * Math.sin(this._huePhase + i * 1.15);
            for (let c = 0; c < 3; c++) {
                record.color[c] = layer.colorA[c] + (layer.colorB[c] - layer.colorA[c]) * mix;
            }

            // The cylinder's local x spans the slit width and local z its height
            record.entity.setLocalScale(layer.width * widthScale, length, layer.height * widthScale);
            record.entity.setLocalPosition(0, length * 0.5, 0);
            record.mi.setParameter('material_opacity', layer.alpha * att * strength * flicker);
        }

        // The muzzle flash core stays white-hot while its halo follows the spectral drift.
        // It is stretched horizontally so the glow hugs the visor slit.
        const camRot = this.entity.getRotation();
        for (let i = 0; i < this._muzzle.length; i++) {
            const record = this._muzzle[i];
            const size = MUZZLE_SIZES[i] * (0.8 + 0.25 * pulse) * (0.4 + 0.6 * strength);
            record.entity.setPosition(this.beamOrigin);
            record.entity.setRotation(camRot);
            record.entity.setLocalScale(size * 1.9, size * 0.75, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', MUZZLE_ALPHAS[i] * strength * flicker);
            if (i > 0) {
                setGlowColor(record.color, RUBY, 2.4);
                record.color[1] += 0.2 * hueMix;
                record.color[2] += 0.3 * hueMix;
            }
        }

        if (this._state !== 'firing') return;

        // Sparks spray forward from the muzzle in a tight cone
        this._sparkAccum += dt * 34;
        let sparks = Math.floor(this._sparkAccum);
        this._sparkAccum -= sparks;
        sparks = Math.min(sparks, 4);
        for (let i = 0; i < sparks; i++) {
            this._tmpA.set(
                this.beamOrigin.x + rand(SLIT_HALF_WIDTH * 2),
                this.beamOrigin.y + rand(2),
                this.beamOrigin.z + rand(2)
            );
            this._tmpB.set(rand(70), rand(70), BEAM_DIR_Z * (150 + Math.random() * 200));
            this._spawn(this._tmpA, this._tmpB, Math.random() < 0.3 ? HOT_PINK : RUBY, 2.8, {
                life: 0.3 + Math.random() * 0.2, size: 3, drag: 1
            });
        }

        // Embers drift inside the beam to give it an energetic interior
        this._emberAccum += dt * 26;
        let embers = Math.floor(this._emberAccum);
        this._emberAccum -= embers;
        embers = Math.min(embers, 3);
        for (let i = 0; i < embers; i++) {
            const along = Math.random() * length * 0.9;
            this._tmpA.set(
                this.beamOrigin.x + rand(10),
                this.beamOrigin.y + rand(2.5),
                this.beamOrigin.z + BEAM_DIR_Z * along
            );
            this._tmpB.set(rand(14), rand(14), BEAM_DIR_Z * 50);
            this._spawn(this._tmpA, this._tmpB, HOT_PINK, 2.2, { life: 0.25, size: 2, alpha: 0.8 });
        }
    }

    /**
     * Shows or hides the beam cylinders and muzzle flash.
     * @param {boolean} enabled - Whether the beam is visible.
     * @private
     */
    _setBeamEnabled(enabled) {
        this._beamPivot.enabled = enabled;
        for (const record of this._muzzle) {
            record.entity.enabled = enabled;
        }
    }

    // -------------------------------------------------------------------------------- //
    //  Visor and camera                                                                 //
    // -------------------------------------------------------------------------------- //

    /**
     * Locates the visor entity and pulses its material emissive with the blast.
     * @private
     */
    _updateVisor() {
        if (!this._visor) {
            this._visor = this.visorEntity || this.app.root.findByName('visor');
            if (!this._visor) return;
        }

        if (this._visor.enabled !== this._faceVisible) {
            this._visor.enabled = this._faceVisible;
        }

        // The model instantiates asynchronously, so keep looking until it has meshes
        if (!this._visorMis || this._visorMis.length === 0) {
            this._visorMis = [];
            for (const render of this._visor.findComponents('render')) {
                this._visorMis.push(...render.meshInstances);
            }
            if (this._visorMis.length === 0) return;
        }

        let glow = 0;
        switch (this._state) {
            case 'charging':
                glow = easeInQuad(Math.min(1, this._stateT / Math.max(0.01, this.chargeTime)));
                glow *= 0.9 + 0.1 * Math.sin(this._phase * 14);
                break;
            case 'firing':
                glow = 0.9 + 0.1 * Math.sin(this._phase * Math.PI * 2 * 11);
                break;
            case 'shutoff':
                // The shutoff state lasts shutoffTime, not FIZZLE_TIME - fade the glow
                // on the same clock as the beam, starting from the firing level
                glow = Math.max(0, 1 - this._stateT / Math.max(0.01, this.shutoffTime)) * 0.9;
                break;
            case 'fizzle':
                glow = Math.max(0, 1 - this._stateT / FIZZLE_TIME) * 0.5;
                break;
            default:
                break;
        }

        this._visorGlow[0] = 1 + glow * 3.2;
        this._visorGlow[1] = 1 + glow * 0.5;
        this._visorGlow[2] = 1 + glow * 0.7;
        for (const mi of this._visorMis) {
            mi.setParameter('material_emissive', this._visorGlow);
        }
    }

    /**
     * Shakes the camera while the blast charges and fires. Runs after the tracking script
     * has written the camera pose for this frame, so the offset never accumulates.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _applyShake(dt) {
        if (!this.shake) return;

        let amp = 0;
        if (this._state === 'charging') {
            const t = Math.min(1, this._stateT / Math.max(0.01, this.chargeTime));
            amp = 0.12 * t * t;
        } else if (this._state === 'firing') {
            amp = 0.35;
        } else if (this._state === 'shutoff') {
            amp = 0.35 * (1 - this._stateT / Math.max(0.01, this.shutoffTime));
        }
        if (amp <= 0) return;

        this.entity.translateLocal(rand(amp * this.shake), rand(amp * this.shake), 0);
    }

    // -------------------------------------------------------------------------------- //
    //  Markers, arcs, rings and sprites                                                 //
    // -------------------------------------------------------------------------------- //

    /**
     * Pulses the ear touch markers until the first hand-triggered blast.
     * @private
     */
    _updateMarkers() {
        const visible = this._faceVisible && !this._handBlastDone && this._state === 'idle';
        const camRot = this.entity.getRotation();

        for (let i = 0; i < this._markers.length; i++) {
            const record = this._markers[i];
            if (record.entity.enabled !== visible) record.entity.enabled = visible;
            if (!visible) continue;

            const pulse = 1 + 0.14 * Math.sin(this._phase * 3.2 + i * Math.PI);
            const size = 5.5 * pulse;
            this._tmpA.set(
                (i === 0 ? 1 : -1) * this.markerOffset.x,
                this.markerOffset.y,
                this.markerOffset.z
            );
            record.entity.setPosition(this._tmpA);
            record.entity.setRotation(camRot);
            record.entity.setLocalScale(size, size, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', 0.4 + 0.2 * Math.sin(this._phase * 3.2 + i * Math.PI));
        }
    }

    /**
     * Spawns one crackle arc near the visor slit.
     * @param {number} charge - The normalized charge progress.
     * @private
     */
    _spawnArc(charge) {
        const record = this._arcs[this._arcNext];
        this._arcNext = (this._arcNext + 1) % this._arcs.length;

        record.active = true;
        record.age = 0;
        record.life = 0.05 + Math.random() * 0.08;

        this._tmpA.set(
            this.beamOrigin.x + rand(SLIT_HALF_WIDTH * 2),
            this.beamOrigin.y + rand(2.5),
            this.beamOrigin.z + rand(1.5)
        );
        record.entity.setPosition(this._tmpA);
        record.entity.setRotation(this.entity.getRotation());
        record.entity.rotateLocal(0, 0, Math.random() * 360);

        const length = (2 + Math.random() * 5) * (0.5 + charge);
        record.entity.setLocalScale(length, 0.7, QUAD_DEPTH);
        setGlowColor(record.color, HOT_PINK, 3 + charge * 1.5);
        record.entity.enabled = true;
    }

    /**
     * Fades and expires the active crackle arcs.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateArcs(dt) {
        for (const record of this._arcs) {
            if (!record.active) continue;

            record.age += dt;
            if (record.age >= record.life) {
                record.active = false;
                record.entity.enabled = false;
                continue;
            }
            record.mi.setParameter('material_opacity', 1 - record.age / record.life);
        }
    }

    /**
     * Spawns an expanding shockwave ring.
     * @param {Vec3} pos - The ring center.
     * @param {number} life - The lifetime in seconds.
     * @param {number} fromSize - The starting diameter in centimeters.
     * @param {number} toSize - The final diameter in centimeters.
     * @param {number} alpha - The starting opacity.
     * @private
     */
    _spawnRing(pos, life, fromSize, toSize, alpha) {
        const record = this._rings[this._ringNext];
        this._ringNext = (this._ringNext + 1) % this._rings.length;

        record.active = true;
        record.age = 0;
        record.life = life;
        record.fromSize = fromSize;
        record.toSize = toSize;
        record.alpha = alpha;
        record.entity.setPosition(pos);
        record.entity.enabled = true;
    }

    /**
     * Expands and fades the active shockwave rings.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateRings(dt) {
        const camRot = this.entity.getRotation();

        for (const record of this._rings) {
            if (!record.active) continue;

            record.age += dt;
            if (record.age >= record.life) {
                record.active = false;
                record.entity.enabled = false;
                continue;
            }

            const t = record.age / record.life;
            const size = record.fromSize + (record.toSize - record.fromSize) * easeOutCubic(t);
            record.entity.setRotation(camRot);
            record.entity.setLocalScale(size, size, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', record.alpha * (1 - t) * (1 - t));
        }
    }

    /**
     * Integrates and fades the active particle sprites.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateFx(dt) {
        const camRot = this.entity.getRotation();

        for (const record of this._fx) {
            if (!record.active) continue;

            record.age += dt;
            if (record.age >= record.life) {
                record.active = false;
                record.entity.enabled = false;
                continue;
            }

            if (record.drag > 0) {
                record.vel.mulScalar(Math.max(0, 1 - record.drag * dt));
            }
            record.pos.x += record.vel.x * dt;
            record.pos.y += record.vel.y * dt;
            record.pos.z += record.vel.z * dt;
            record.entity.setPosition(record.pos);
            record.entity.setRotation(camRot);

            const t = record.age / record.life;
            const fade = (1 - t) * (1 - t);
            const s = record.size * (1 - 0.6 * t);
            record.entity.setLocalScale(s, s, QUAD_DEPTH);
            record.mi.setParameter('material_opacity', record.alpha * fade);
        }
    }

    /**
     * Spawns one particle sprite from the pool.
     * @param {Vec3} pos - The spawn position.
     * @param {Vec3} vel - The initial velocity in centimeters per second.
     * @param {number[]} rgb - The base color.
     * @param {number} intensity - The brightness multiplier.
     * @param {object} [opts] - The sprite options.
     * @param {number} [opts.life] - The lifetime in seconds.
     * @param {number} [opts.size] - The starting size in centimeters.
     * @param {number} [opts.alpha] - The base opacity.
     * @param {number} [opts.drag] - The velocity damping factor.
     * @private
     */
    _spawn(pos, vel, rgb, intensity, { life = 0.7, size = 3, alpha = 1, drag = 0 } = {}) {
        const record = this._fx[this._fxNext];
        this._fxNext = (this._fxNext + 1) % this._fx.length;

        record.active = true;
        record.age = 0;
        record.life = life;
        record.size = size;
        record.alpha = alpha;
        record.drag = drag;
        record.pos.copy(pos);
        record.vel.copy(vel);
        setGlowColor(record.color, rgb, intensity);
        record.entity.setPosition(record.pos);
        record.entity.enabled = true;
    }

    /**
     * Spawns a radial burst of sprites in the camera-facing plane.
     * @param {Vec3} pos - The burst origin.
     * @param {number[]} rgb - The base color.
     * @param {number} count - The number of sprites.
     * @param {number} speed - The base outward speed in centimeters per second.
     * @param {number} intensity - The brightness multiplier.
     * @param {object} [opts] - Overrides for the sprite options.
     * @private
     */
    _burstRadial(pos, rgb, count, speed, intensity, opts = { life: 0.5, size: 3, drag: 1 }) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rand(0.5);
            const v = speed * (0.7 + Math.random() * 0.6);
            this._tmpB.set(Math.cos(angle) * v, Math.sin(angle) * v, rand(speed * 0.4));
            this._spawn(pos, this._tmpB, rgb, intensity, opts);
        }
    }

    // -------------------------------------------------------------------------------- //
    //  Construction                                                                     //
    // -------------------------------------------------------------------------------- //

    /**
     * Creates the beam pivot and its nested cylinders. The pivot is rotated so the
     * cylinders' local +Y axis runs along the world +Z beam direction.
     * @private
     */
    _createBeam() {
        this._beamPivot = new Entity('beam');
        this._beamPivot.setLocalPosition(this.beamOrigin);
        this._beamPivot.setLocalEulerAngles(90 * BEAM_DIR_Z, 0, 0);
        this._beamPivot.enabled = false;
        this._root.addChild(this._beamPivot);

        for (let i = 0; i < BEAM_LAYERS.length; i++) {
            const entity = new Entity(`beam-layer-${i}`);
            entity.addComponent('render', {
                type: 'cylinder',
                material: this._beamMaterial,
                castShadows: false,
                receiveShadows: false
            });
            this._beamPivot.addChild(entity);

            const mi = entity.render.meshInstances[0];
            const color = new Float32Array(BEAM_LAYERS[i].colorA);
            mi.setParameter('material_emissive', color);
            mi.setParameter('material_opacity', 0);

            this._beamLayers.push({ entity, mi, color });
        }
    }

    /**
     * Creates the layered muzzle flash quads.
     * @private
     */
    _createMuzzle() {
        for (let i = 0; i < MUZZLE_SIZES.length; i++) {
            const record = this._createQuad(`muzzle-${i}`, this._blobMaterial);
            setGlowColor(record.color, i === 0 ? [4, 2.2, 2.2] : RUBY, i === 0 ? 1 : 2.4);
            this._muzzle.push(record);
        }
        for (let eye = 0; eye < 2; eye++) {
            for (let i = 0; i < CHARGE_SIZES.length; i++) {
                const record = this._createQuad(`charge-${eye}-${i}`, this._blobMaterial);
                setGlowColor(record.color, i === 0 ? HOT_PINK : RUBY, i === 0 ? 3.2 : 2.2);
                record.eye = eye === 0 ? 1 : -1;
                record.layer = i;
                this._chargeGlow.push(record);
            }
        }
    }

    /**
     * Creates an invisible ellipsoid that only writes depth, rendered before the world
     * layer. The visor arms behind the head depth-fail against it and the transparent
     * canvas reveals the camera feed instead - so the head appears to occlude them. Only
     * the visor is affected: the energy effects do not depth test (see _createFxMaterial).
     * @private
     */
    _createOccluder() {
        const layers = this.app.scene.layers;
        const world = layers.getLayerById(LAYERID_WORLD);
        const layer = new Layer({ name: 'headOccluder' });
        layers.insertOpaque(layer, layers.getOpaqueIndex(world));

        const camera = this.entity.camera;
        if (camera) camera.layers = camera.layers.concat(layer.id);

        const material = new StandardMaterial();
        material.redWrite = false;
        material.greenWrite = false;
        material.blueWrite = false;
        material.alphaWrite = false;
        material.depthWrite = true;
        material.update();

        const entity = new Entity('head-occluder');
        entity.addComponent('render', {
            type: 'sphere',
            material,
            castShadows: false,
            receiveShadows: false,
            layers: [layer.id]
        });
        entity.setLocalPosition(this.occluderCenter);
        entity.setLocalScale(this.occluderSize);
        this._root.addChild(entity);

        this._occluder = { layer, material, entity };
    }

    /**
     * Creates the two pulsing ear touch markers.
     * @private
     */
    _createMarkers() {
        for (let i = 0; i < 2; i++) {
            const record = this._createQuad(`marker-${i}`, this._ringMaterial);
            setGlowColor(record.color, RUBY, 2.2);
            this._markers.push(record);
        }
    }

    /**
     * Creates one pooled shockwave ring.
     * @param {number} i - The ring index.
     * @returns {object} The ring record.
     * @private
     */
    _createRing(i) {
        const record = this._createQuad(`ring-${i}`, this._ringMaterial);
        setGlowColor(record.color, RUBY, 2.8);
        record.active = false;
        record.age = 0;
        record.life = 1;
        record.fromSize = 0;
        record.toSize = 1;
        record.alpha = 1;
        return record;
    }

    /**
     * Creates one pooled particle sprite.
     * @param {number} i - The sprite index.
     * @returns {object} The sprite record.
     * @private
     */
    _createFxSprite(i) {
        const record = this._createQuad(`fx-${i}`, this._blobMaterial);
        record.active = false;
        record.age = 0;
        record.life = 1;
        record.size = 3;
        record.alpha = 1;
        record.drag = 0;
        record.pos = new Vec3();
        record.vel = new Vec3();
        return record;
    }

    /**
     * Creates one pooled crackle arc quad.
     * @param {number} i - The arc index.
     * @returns {object} The arc record.
     * @private
     */
    _createArc(i) {
        const record = this._createQuad(`arc-${i}`, this._blobMaterial);
        record.active = false;
        record.age = 0;
        record.life = 0.1;
        return record;
    }

    /**
     * Creates a pooled glow quad with its own color and opacity uniform overrides.
     * @param {string} name - The entity name.
     * @param {StandardMaterial} material - The shared material to render with.
     * @returns {object} The quad record.
     * @private
     */
    _createQuad(name, material) {
        const entity = new Entity(name);
        entity.addComponent('render', {
            type: 'box',
            material,
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
     * Creates a soft radial glow texture.
     * @returns {Texture} The texture.
     * @private
     */
    _createBlobTexture() {
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

        return this._toTexture(canvas);
    }

    /**
     * Creates the beam texture: opaque at the muzzle end, fading out along the length.
     * The cylinder's side UVs run v along its height.
     * @returns {Texture} The texture.
     * @private
     */
    _createBeamTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 256;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 256, 0, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 16, 256);

        return this._toTexture(canvas);
    }

    /**
     * Creates a soft ring texture for shockwaves and the touch markers.
     * @returns {Texture} The texture.
     * @private
     */
    _createRingTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.72, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        return this._toTexture(canvas);
    }

    /**
     * Uploads a canvas to a clamped, unmipped texture.
     * @param {HTMLCanvasElement} canvas - The source canvas.
     * @returns {Texture} The texture.
     * @private
     */
    _toTexture(canvas) {
        const texture = new Texture(this.app.graphicsDevice, {
            width: canvas.width,
            height: canvas.height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(canvas);
        texture.upload();
        return texture;
    }

    /**
     * Creates a shared additive glow material. Individual mesh instances tint and fade it
     * through the `material_emissive` and `material_opacity` uniform overrides.
     * @param {Texture} texture - The emissive and opacity texture.
     * @returns {StandardMaterial} The material.
     * @private
     */
    _createFxMaterial(texture) {
        const material = new StandardMaterial();
        material.useLighting = false;
        material.diffuse.set(0, 0, 0);
        material.emissive.set(1, 1, 1);
        material.emissiveMap = texture;
        material.opacityMap = texture;
        material.blendType = BLEND_ADDITIVEALPHA;
        material.depthWrite = false;
        // Energy glows over everything: without depth testing, the beam and sparks are
        // never clipped by the invisible head occluder (which should only hide the visor)
        material.depthTest = false;
        material.cull = CULLFACE_NONE;
        material.update();
        return material;
    }

    // -------------------------------------------------------------------------------- //
    //  Audio                                                                            //
    // -------------------------------------------------------------------------------- //

    /**
     * Lazily creates the audio context and starts loading the sound effects. Playback
     * stays silent until the browser unlocks the context on a pointer interaction.
     * @private
     */
    _ensureAudio() {
        if (!this.sound || this._audio || this._audioFailed) return;

        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) {
                this._audioFailed = true;
                return;
            }
            const ctx = new Ctor();
            const master = ctx.createGain();
            master.gain.value = 0.6;
            master.connect(ctx.destination);

            this._audio = { ctx, master, sounds: {} };
            this._loadSounds();
        } catch {
            this._audioFailed = true;
        }
    }

    /**
     * Fetches and decodes the sound effects. Each entry stores the buffer along with the
     * duration of its usable (pre fade-out) portion, and the beam loop additionally gets
     * loop points confined to its steadiest stretch so it can repeat without pulsing.
     * @private
     */
    async _loadSounds() {
        const names = ['charge', 'fire', 'beam', 'shutoff', 'fizzle'];

        await Promise.all(names.map(async (name) => {
            try {
                const response = await fetch(`assets/sounds/optic-${name}.mp3`);
                const encoded = await response.arrayBuffer();
                if (!this._audio) return;
                const buffer = await this._audio.ctx.decodeAudioData(encoded);
                if (!this._audio) return;

                const entry = { buffer, usable: buffer.duration };

                if (name === 'beam') {
                    // The beam must hold a perfectly continuous roar
                    entry.buffer = this._buildLoop(buffer);
                    entry.usable = entry.buffer.duration;
                } else {
                    // Windowed RMS profile: the usable portion of a one-shot ends where
                    // its trailing fade-out begins
                    const data = buffer.getChannelData(0);
                    const windows = 24;
                    const size = Math.floor(data.length / windows);
                    const rms = [];
                    for (let w = 0; w < windows; w++) {
                        let sum = 0;
                        for (let i = w * size; i < (w + 1) * size; i += 4) {
                            sum += data[i] * data[i];
                        }
                        rms.push(Math.sqrt(sum / (size / 4)));
                    }
                    const peak = Math.max(...rms);
                    let lastLoud = windows - 1;
                    while (lastLoud > 0 && rms[lastLoud] < peak * 0.5) lastLoud--;
                    entry.usable = ((lastLoud + 1) / windows) * buffer.duration;
                }

                this._audio.sounds[name] = entry;
            } catch {
                // Missing or undecodable sounds are simply skipped
            }
        }));
    }

    /**
     * Rebuilds a sample as a seamless loop. The loudness envelope is flattened so the
     * roar holds perfectly steady (the generated sample swells and dips), and the tail
     * is crossfaded into the head so it repeats without a seam.
     * @param {AudioBuffer} buffer - The decoded source sample.
     * @returns {AudioBuffer} The loopable buffer.
     * @private
     */
    _buildLoop(buffer) {
        const rate = buffer.sampleRate;
        const trim = Math.floor(rate * 0.2);
        const length = buffer.length - trim * 2;
        const xfade = Math.floor(rate * 0.25);
        if (length < xfade * 3) return buffer;

        // Smooth loudness envelope of the trimmed region
        const win = 2048;
        const windows = Math.ceil(length / win);
        const source = buffer.getChannelData(0);
        const env = new Float32Array(windows);
        for (let w = 0; w < windows; w++) {
            const start = trim + w * win;
            const end = Math.min(trim + length, start + win);
            let sum = 0;
            for (let i = start; i < end; i++) {
                sum += source[i] * source[i];
            }
            env[w] = Math.sqrt(sum / Math.max(1, end - start));
        }
        const target = Math.max(1e-3, Array.from(env).sort((a, b) => a - b)[windows >> 1]);

        // Per-sample gain that flattens the envelope, capped so quiet stretches do not
        // amplify into noise
        const gainAt = (i) => {
            const pos = Math.max(0, Math.min(windows - 1, i / win - 0.5));
            const w0 = Math.floor(pos);
            const w1 = Math.min(windows - 1, w0 + 1);
            const e = env[w0] + (env[w1] - env[w0]) * (pos - w0);
            return Math.min(3, target / Math.max(e, 1e-4));
        };

        const outLength = length - xfade;
        const out = this._audio.ctx.createBuffer(buffer.numberOfChannels, outLength, rate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            const dst = out.getChannelData(ch);
            for (let i = 0; i < outLength; i++) {
                let sample = data[trim + i] * gainAt(i);
                if (i < xfade) {
                    // Equal-power crossfade of the tail into the head
                    const t = i / xfade;
                    const tail = data[trim + outLength + i] * gainAt(outLength + i);
                    sample = sample * Math.sqrt(t) + tail * Math.sqrt(1 - t);
                }
                dst[i] = sample;
            }
        }

        // Flattening lands at the sample's median level, which can be timid - normalize
        // the loop to a strong level so the roar holds its own against the eruption
        let peak = 0;
        let sum = 0;
        const first = out.getChannelData(0);
        for (let i = 0; i < outLength; i++) {
            const a = Math.abs(first[i]);
            if (a > peak) peak = a;
            sum += first[i] * first[i];
        }
        const rms = Math.sqrt(sum / outLength);
        const scale = Math.min(0.22 / Math.max(rms, 1e-4), 0.95 / Math.max(peak, 1e-4));
        for (let ch = 0; ch < out.numberOfChannels; ch++) {
            const dst = out.getChannelData(ch);
            for (let i = 0; i < outLength; i++) {
                dst[i] *= scale;
            }
        }

        return out;
    }

    /**
     * Starts one of the loaded sound effects.
     * @param {string} name - The sound name.
     * @param {object} [opts] - The playback options.
     * @param {number} [opts.gain] - The playback gain.
     * @param {number} [opts.rate] - The playback rate.
     * @param {boolean} [opts.loop] - Whether to loop the sound.
     * @param {number} [opts.fadeIn] - The fade-in time in seconds.
     * @returns {{ src: AudioBufferSourceNode, gain: GainNode }|null} The playing nodes.
     * @private
     */
    _playSound(name, { gain = 1, rate = 1, loop = false, fadeIn = 0 } = {}) {
        const entry = this._audio?.sounds[name];
        if (!entry) return null;

        const { ctx, master } = this._audio;
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = entry.buffer;
        src.playbackRate.value = rate;
        src.loop = loop;

        const gainNode = ctx.createGain();
        if (fadeIn > 0) {
            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.exponentialRampToValueAtTime(gain, now + fadeIn);
        } else {
            gainNode.gain.value = gain;
        }

        src.connect(gainNode).connect(master);
        src.start(now);
        return { src, gain: gainNode };
    }

    /**
     * Starts the rising charge whine, stretched so its loudest point lands exactly when
     * the blast erupts, with a swelling gain ramp for extra drama.
     * @private
     */
    _soundCharge() {
        if (!this._audio) return;

        try {
            // Best-effort unlock: succeeds whenever the page already has user activation
            this._audio.ctx.resume().catch(() => {});

            const entry = this._audio.sounds.charge;
            const duration = Math.max(0.1, this.chargeTime);
            const rate = entry ?
                Math.max(0.6, Math.min(1.8, entry.usable / duration)) : 1;
            const nodes = this._playSound('charge', { gain: 0.35, rate });
            if (!nodes) return;

            const now = this._audio.ctx.currentTime;
            nodes.gain.gain.setValueAtTime(0.35, now);
            nodes.gain.gain.linearRampToValueAtTime(1, now + duration);
            this._chargeNodes = nodes;
        } catch {
            // Audio is best-effort
        }
    }

    /**
     * Ends the charge sound, either fizzling down or cutting into the eruption.
     * @param {boolean} fizzle - Whether the charge was aborted.
     * @private
     */
    _soundChargeEnd(fizzle) {
        const nodes = this._chargeNodes;
        this._chargeNodes = null;
        if (!this._audio) return;

        try {
            if (nodes) {
                const { ctx } = this._audio;
                const now = ctx.currentTime;
                const release = fizzle ? 0.2 : 0.06;
                nodes.gain.gain.cancelScheduledValues(now);
                nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
                nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
                nodes.src.stop(now + release + 0.05);
            }
            if (fizzle) {
                this._playSound('fizzle', { gain: 0.6 });
            }
        } catch {
            // Audio is best-effort
        }
    }

    /**
     * Plays the eruption blast and starts the sustained beam roar, tremolo-modulated in
     * time with the beam pulse.
     * @private
     */
    _soundFire() {
        if (!this._audio) return;

        try {
            this._playSound('fire', { gain: 0.9 });

            const roar = this._playSound('beam', { gain: 0.8, loop: true, fadeIn: 0.15 });
            if (!roar) return;

            const { ctx } = this._audio;
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 11;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 0.025;
            lfo.connect(lfoGain).connect(roar.gain.gain);
            lfo.start(ctx.currentTime);

            this._roarNodes = { src: roar.src, gain: roar.gain, lfo, lfoGain };
        } catch {
            // Audio is best-effort
        }
    }

    /**
     * Cuts the beam roar off with a power-down snap.
     * @private
     */
    _soundShutoff() {
        const nodes = this._roarNodes;
        this._roarNodes = null;
        if (!this._audio) return;

        try {
            if (nodes) {
                const { ctx } = this._audio;
                const now = ctx.currentTime;
                nodes.gain.gain.cancelScheduledValues(now);
                nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), now);
                nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
                nodes.src.stop(now + 0.2);
                nodes.lfo.stop(now + 0.2);
            }
            this._playSound('shutoff', { gain: 0.6 });
        } catch {
            // Audio is best-effort
        }
    }
}
