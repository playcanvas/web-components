import { Mat4, Vec3 } from 'playcanvas';

import { FaceTracking } from './face-tracking.mjs';

/** Centimeters (MediaPipe's metric face space) to meters (the scene). */
const CM_TO_M = 0.01;

/** The eye distance in meters below which tracking is treated as implausible. */
const EYE_DISTANCE_MIN = 0.15;

/**
 * The largest share of the eye-to-window distance that may be spent on pop-out. Leaning
 * right up to the display shrinks the pop-out instead of inverting the frustum.
 */
const POP_OUT_FRACTION_MAX = 0.5;

/** The near plane's minimum distance in meters, for when the eye is very close. */
const NEAR_MIN = 0.02;

/**
 * How strongly new velocity estimates replace the running ones (0-1 per sample). Lower is
 * steadier prediction; higher follows changes of direction faster.
 */
const VELOCITY_SMOOTHING = 0.35;

/** The assumed webcam capture latency in seconds, folded into the prediction lead. */
const CAPTURE_LATENCY = 0.03;

/** The maximum prediction horizon in seconds. */
const MAX_PREDICTION = 0.1;

/** The largest distance in meters the prediction may lead the measured eye position. */
const MAX_PREDICTION_SHIFT = 0.08;

/**
 * Turns the display into a window onto the scene, using MediaPipe face tracking to follow
 * the viewer's head.
 *
 * Where the AR examples lock a model to the face, a window needs the opposite
 * decomposition of the same tracking data. Head *position* becomes the apex of the view
 * frustum; head *rotation* is discarded, because where you point your nose does not change
 * what a window shows. The camera therefore never rotates - it stays axis-aligned with the
 * display and translates only, and the *projection* becomes asymmetric.
 *
 * The scene is authored in a screen-space frame: the window is the rectangle of the canvas,
 * centered on the origin, in the plane z = 0, with +x right, +y up and +z out of the
 * display toward the viewer. Everything at negative z is behind the glass; content between
 * the window and the eye reads as popping out of the display. Each frame the script builds
 * the off-axis frustum whose apex is the tracked eye and whose cross-section is the window
 * rectangle, and installs it through {@link CameraComponent#calculateProjection}. Because
 * the projection is overridden, the camera's `fov` and `aspect-ratio` are inert.
 *
 * Two things the browser cannot know have to be measured once per display and supplied as
 * attributes: the physical width of the canvas (`screen-width`) and the height of the
 * webcam above its center (`camera-height`). A third, `tracking-scale`, absorbs the error
 * in MediaPipe's assumed field of view and canonical head size. The lateral parallax is
 * what sells the illusion, so the defaults (a laptop) give a convincing effect well before
 * the numbers are exact; getting them right mostly changes how much the view zooms as the
 * viewer leans in.
 *
 * The `smoothing`, `motion-boost` and `prediction` attributes inherited from the base class
 * apply to the eye position here. They matter more than they do for a face-locked model:
 * tracking lag shears the whole world rather than sliding a model on a face, so it reads as
 * the scene swimming.
 *
 * A true window swings the view by the head's offset divided by the window's half-width,
 * whatever the depth of the subject, which on a small display turns a few centimeters of
 * sway into a large reframing. `parallax-scale` damps that, trading physical fidelity for a
 * composition that holds still.
 *
 * Appending `?sim` to the page URL drives a synthetic head motion instead of MediaPipe,
 * which is how the effect can be previewed without a webcam.
 *
 * Fires the face events of the base class (`face:ready`, `face:found`, `face:lost`).
 */
export class HeadTrackedWindow extends FaceTracking {
    static scriptName = 'headTrackedWindow';

    /**
     * The physical width of the canvas across the display, in meters. Together with the
     * canvas aspect ratio this fixes the window rectangle. There is no way to read this
     * from the browser - `window.screen` reports CSS pixels, and the nominal 96 pixels per
     * inch is a fiction on most displays - so it has to be measured.
     * @type {number}
     * @attribute
     */
    screenWidth = 0.31;

    /**
     * The height of the webcam above the center of the canvas, in meters. Positive for the
     * usual case of a camera above the display. Assumed to be horizontally centered.
     * @type {number}
     * @attribute
     */
    cameraHeight = 0.11;

    /**
     * Corrects the scale of MediaPipe's reported head position, which depends on its
     * assumed field of view and canonical head size. A single factor is the right
     * correction: fitting a head that is actually larger than the canonical one puts it
     * proportionally further away *and* proportionally further off-axis, so distance and
     * lateral offset are wrong by the same ratio. Raise it if the view zooms too little as
     * you lean in.
     * @type {number}
     * @attribute
     */
    trackingScale = 1;

    /**
     * How far in front of the window, in meters, the scene is allowed to reach. The near
     * plane is placed to clear this, so content between it and the window pops out of the
     * display. Set to 0 for a pure window with nothing in front of the glass.
     * @type {number}
     * @attribute
     */
    popOut = 0.15;

    /**
     * Scales how far the eye moves laterally in the scene relative to how far the head
     * actually moves. 1 is the true window, which swings the view by a full half-width for
     * every half-width of head movement and reframes a close subject drastically. Lower
     * values keep the subject where it was framed while preserving the depth cue, since
     * near and far content still separate - just by less. Leaning in and out is unaffected.
     * @type {number}
     * @attribute
     */
    parallaxScale = 0.75;

    /**
     * The far clip distance in meters.
     * @type {number}
     * @attribute
     */
    farClip = 50;

    // The base class smooths the inverted, face-locked pose; this script smooths the head
    // position instead, so none of that is wanted here.
    matchVideoFov = false;

    anchorCorrection = false;

    /** @override */
    _drivesEntityTransform = false;

    /** The tracked eye position in screen space, in meters. @private */
    _eye = new Vec3();

    /** The smoothed eye position actually rendered from. @private */
    _smoothEye = new Vec3();

    /** @private */
    _eyeVel = new Vec3();

    /** @private */
    _prevEye = new Vec3();

    /** @private */
    _predEye = new Vec3();

    /** @private */
    _eyeSeeded = false;

    /** @private */
    _eyeSpeed = 0;

    /** @private */
    _sampleTime = 0;

    /** @private */
    _simTimer = 0;

    /** @private */
    _projMat = new Mat4();

    /** @private */
    _tmpVec = new Vec3();

    /** The window's half-extents in meters, x by y. @private */
    _halfWidth = 0.155;

    /** @private */
    _halfHeight = 0.097;

    async initialize() {
        // Everything this script takes over on the camera is captured first, so destroying it
        // hands back whatever was there rather than assuming the defaults. Note the clip
        // planes have to be read before the first _applyEye writes them.
        const camera = this.entity.camera;
        const restore = camera && {
            calculateProjection: camera.calculateProjection ?? null,
            nearClip: camera.nearClip,
            farClip: camera.farClip
        };

        // Own the projection before the first frame renders, so the camera never shows a
        // frame through the default symmetric frustum
        this._updateWindowRect();
        this._seedEye();
        this._applyEye();

        if (camera) {
            camera.calculateProjection = (projMat) => {
                projMat.copy(this._projMat);
            };
            camera.farClip = this.farClip;
        }

        this.on('destroy', () => {
            if (!restore) return;
            camera.calculateProjection = restore.calculateProjection;
            camera.nearClip = restore.nearClip;
            camera.farClip = restore.farClip;
        });

        await super.initialize();
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        this._updateWindowRect();
        super.update(dt);
    }

    /**
     * Ingests a new tracking sample. The base class calls this once per face inference,
     * which is the cadence the velocity estimate needs - `_headPos` and the sample timing
     * have both been refreshed by the time it runs.
     * @param {Array<{ x: number, y: number, z: number }>} _landmarks - The normalized face
     * landmarks of the tracked face.
     * @protected
     */
    _onFaceLandmarks(_landmarks) {
        // MediaPipe's camera space is right-handed with the origin at the webcam, +x along
        // the image (the `mirror` flag having already made that the display's right), +y up
        // and the viewer at negative z. Scale corrects the metric fit, then the camera's
        // physical offset moves the origin to the center of the window.
        const s = CM_TO_M * this.trackingScale;
        this._eye.set(
            this._headPos.x * s,
            this._headPos.y * s + this.cameraHeight,
            Math.max(EYE_DISTANCE_MIN, -this._headPos.z * s)
        );

        this._ingestEye(this._eye, this._sampleSeconds);
    }

    /**
     * Called at the end of every tracking update. Writes the camera transform and the
     * projection from the smoothed eye position.
     * @param {number} dt - The delta time in seconds.
     * @protected
     */
    _onUpdated(dt) {
        this._advanceEye(dt);
        this._applyEye();
    }

    /**
     * Snaps rather than swoops when the face is reacquired after an absence.
     * @protected
     */
    _onFaceLost() {
        this._eyeSeeded = false;
        this._eyeVel.set(0, 0, 0);
        this._eyeSpeed = 0;
    }

    /**
     * Drives a synthetic head motion for `?sim` mode - a slow lissajous over a plausible
     * envelope of head movement at a desk, which shows the parallax without a webcam.
     * @param {number} dt - The delta time in seconds.
     * @protected
     */
    _updateSim(dt) {
        this._simTimer += dt;

        if (!this._simReady && this._simTimer > 0.25) {
            this._simReady = true;
            this.app.fire('face:ready');
            this.app.fire('face:found');
        }

        this._simulateEye(this._simTimer, dt);
    }

    /**
     * Runs the same synthetic motion, more gently, when no webcam is available so the page
     * still demonstrates the effect.
     * @param {number} dt - The delta time in seconds.
     * @protected
     */
    _updateFallbackView(dt) {
        this._simTimer += dt;

        if (!this._simReady && this._simTimer > 0.25) {
            this._simReady = true;
            this.app.fire('face:found');
        }

        this._simulateEye(this._simTimer * 0.5, dt);
    }

    /**
     * Places the synthetic eye and renders from it.
     * @param {number} t - The animation time in seconds.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _simulateEye(t, dt) {
        // A realistic envelope of head movement at a desk, so the preview shows what the
        // tracked effect actually feels like rather than an exaggerated version of it.
        this._eye.set(Math.sin(t * 0.55) * 0.09, Math.sin(t * 0.37) * 0.05, 0.55 + Math.sin(t * 0.23) * 0.05);
        this._ingestEye(this._eye, dt);
        this._advanceEye(dt);
        this._applyEye();
    }

    /**
     * Records a new eye measurement and updates the velocity estimate that the prediction
     * lead rides on.
     * @param {Vec3} eye - The measured eye position in screen space.
     * @param {number} seconds - The time since the previous measurement.
     * @private
     */
    _ingestEye(eye, seconds) {
        if (this._eyeSeeded && seconds > 0) {
            this._tmpVec.sub2(eye, this._prevEye).mulScalar(1 / seconds);
            this._eyeVel.lerp(this._eyeVel, this._tmpVec, VELOCITY_SMOOTHING);
            this._eyeSpeed = this._eyeVel.length();
        }
        this._prevEye.copy(eye);
        this._sampleTime = performance.now();
    }

    /**
     * Eases the rendered eye position towards the latest measurement, leading it by the age
     * of that measurement. Runs at render rate.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _advanceEye(dt) {
        // Lead the target by the age of the measurement: a webcam sample was captured
        // CAPTURE_LATENCY before it arrived and more time has passed since, so extrapolating
        // along the estimated velocity for that long cuts the perceived lag. Negative
        // parallax amplifies apparent motion, so this matters most for popped-out content.
        const staleness = Math.max(0, (performance.now() - this._sampleTime) / 1000) + CAPTURE_LATENCY;
        const age = Math.min(MAX_PREDICTION, staleness) * Math.max(0, Math.min(2, this.prediction));

        this._predEye.copy(this._prevEye);
        if (age > 0) {
            this._tmpVec.copy(this._eyeVel).mulScalar(age);
            const shift = this._tmpVec.length();
            if (shift > MAX_PREDICTION_SHIFT) this._tmpVec.mulScalar(MAX_PREDICTION_SHIFT / shift);
            this._predEye.add(this._tmpVec);
        }

        if (!this._eyeSeeded) {
            this._smoothEye.copy(this._predEye);
            this._eyeSeeded = true;
            return;
        }

        // Smooth harder at rest (stability) and lighter in motion (low lag). The base class
        // measures head speed in centimeters per second, so match that here.
        const rate = Math.min(80, this.smoothing + this._eyeSpeed * 100 * this.motionBoost);
        this._smoothEye.lerp(this._smoothEye, this._predEye, Math.min(1, 1 - Math.exp(-rate * dt)));
    }

    /**
     * Places the eye at a plausible resting position, for the frames before tracking lands.
     * @private
     */
    _seedEye() {
        this._eye.set(0, 0, 0.55);
        this._prevEye.copy(this._eye);
        this._smoothEye.copy(this._eye);
    }

    /**
     * Writes the camera transform and builds the off-axis projection for the current eye
     * position.
     * @private
     */
    _applyEye() {
        const eye = this._smoothEye;
        const z = Math.max(EYE_DISTANCE_MIN, eye.z);

        // Damping the lateral offset is the only thing that holds the framing still, since
        // the view swings by the offset over the window's half-width at every depth. The
        // camera and the frustum use the same damped offset, so the result stays exactly the
        // view from a nearer-to-center eye rather than a skewed one.
        const x = eye.x * this.parallaxScale;
        const y = eye.y * this.parallaxScale;

        // A window's view depends on where the eye is, not where the head points, so the
        // camera translates without ever rotating - it always looks squarely into the
        // display, along -z.
        this.entity.setLocalPosition(x, y, z);
        this.entity.setLocalEulerAngles(0, 0, 0);

        // Keep the near plane clear of anything reaching out of the window. Scaling the
        // allowance with the eye distance means leaning in shrinks the pop-out gracefully
        // rather than clipping through it.
        const popOut = Math.min(this.popOut, z * POP_OUT_FRACTION_MAX);
        const near = Math.max(NEAR_MIN, z - popOut);

        // The frustum's cross-section at the window plane is the window rectangle, offset
        // by the eye; setFrustum wants those extents at the near plane.
        const s = near / z;
        this._projMat.setFrustum(
            (-this._halfWidth - x) * s,
            (this._halfWidth - x) * s,
            (-this._halfHeight - y) * s,
            (this._halfHeight - y) * s,
            near,
            this.farClip
        );

        const camera = this.entity.camera;
        if (camera) camera.nearClip = near;
    }

    /**
     * Derives the window rectangle from the calibrated width and the canvas aspect ratio.
     * @private
     */
    _updateWindowRect() {
        const canvas = this.app.graphicsDevice.canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        this._halfWidth = this.screenWidth * 0.5;
        this._halfHeight = (this._halfWidth * height) / width;
    }
}
