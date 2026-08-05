import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Mat4, Quat, Script, Vec3 } from 'playcanvas';

/** The fingertip landmark indices reported by MediaPipe hands. */
const FINGERTIPS = [4, 8, 12, 16, 20];

/** The hand landmarks used to measure the apparent hand size (wrist, middle knuckle). */
const WRIST = 0;
const MIDDLE_MCP = 9;

/**
 * The plausible apparent hand size (wrist to middle knuckle) as a fraction of the face
 * height. Hands outside this range at the ear are phantom detections, not a touch.
 */
const HAND_SIZE_MIN = 0.2;
const HAND_SIZE_MAX = 1.1;

/** Face landmark pairs whose midpoints anchor the two ear touch zones. */
const EAR_LANDMARKS = [
    { side: 'right', a: 127, b: 234 },
    { side: 'left', a: 356, b: 454 }
];

/** Face landmarks used to measure the apparent face size (forehead and chin). */
const FOREHEAD = 10;
const CHIN = 152;

/** Face landmarks whose midpoint is the nose bridge (the inner eye corners). */
const BRIDGE_A = 133;
const BRIDGE_B = 362;

/** The number of consecutive out-of-range inferences that release a touch. */
const EXIT_FRAMES = 2;

/** The seconds the face may go undetected before it is reported lost. */
const FACE_GRACE = 0.4;

/** The seconds of face absence after which the camera pose snaps rather than eases. */
const RESEED_AFTER = 0.5;

/**
 * The assumed webcam capture latency in seconds: a frame is roughly this old before it
 * even reaches inference. Folded into the prediction lead.
 */
const CAPTURE_LATENCY = 0.03;

/** The maximum prediction horizon in seconds. */
const MAX_PREDICTION = 0.1;

/**
 * How strongly new velocity estimates replace the running ones (0-1 per sample). Lower
 * is steadier prediction; higher follows changes of direction faster.
 */
const VELOCITY_SMOOTHING = 0.35;

/**
 * Drives the camera from MediaPipe face tracking and detects the user touching the side
 * of their head, in the style of a certain ruby-visored superhero. The script performs no
 * rendering itself - it is a data source for other scripts (like `opticBlastVisuals`) and
 * for the host page.
 *
 * The face is tracked with MediaPipe's face landmarker. Its facial transformation matrix
 * is inverted and applied to the camera entity, so a head-attached model placed at the
 * origin of the scene (in MediaPipe's centimeter-scale canonical face space, facing +Z)
 * appears locked to the user's head. The camera's field of view is matched each frame to
 * the one MediaPipe assumes, corrected for the `object-fit: cover` cropping of the video
 * element created by the `cameraFeed` script, so the model registers with the video. The
 * pose is smoothed adaptively (stable at rest, responsive in motion) and led by the age
 * of the latest sample, keeping the perceived tracking lag low.
 *
 * Hands are tracked with MediaPipe's hand landmarker. Detections only count if they are
 * confident and plausibly sized for a hand held at the head, which keeps phantom
 * detections from triggering the blast. A touch begins when a fingertip holds near an
 * ear anchor (derived from the face oval landmarks) for `touchFrames` consecutive
 * inferences, and ends when it moves away or tracking of the hand is lost for longer
 * than `releaseGrace`. Holding the pointer down anywhere acts as a fallback touch.
 *
 * Appending `?sim` to the page URL skips MediaPipe entirely and instead orbits the
 * camera around the origin on a synthetic head pose - useful for previewing the visuals
 * on devices without a webcam. The example page removes its camera feed script in this
 * mode, so no camera permission is requested.
 *
 * Fires the following events on the application:
 *
 * - `visor:ready` - Fired once the models are loaded and warmed up.
 * - `face:found` - Fired when the face is first detected or reacquired.
 * - `face:lost` - Fired when the face has been undetected for a grace period.
 * - `visor:update` - Fired every frame with `{ face, anchors, nearest }` where `anchors`
 *   holds the two ear anchors as `{ side, x, y }` in viewport pixels and `nearest`
 *   describes the fingertip closest to an anchor as `{ side, x, y, proximity }` (or is
 *   null). The object is reused between frames - copy anything you keep.
 * - `visor:touch` - Fired with (side) when a touch begins. The side is 'left' or 'right'
 *   (the user's own left or right ear), or 'screen' for the pointer fallback.
 * - `visor:release` - Fired with (side) when a touch ends.
 */
export class OpticBlastTracking extends Script {
    static scriptName = 'opticBlastTracking';

    /**
     * Whether the camera feed is displayed mirrored. Landmark coordinates and the facial
     * transformation matrix are flipped to match.
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * The exponential smoothing rate applied to the camera pose and ear anchors while the
     * head is at rest. Higher is more responsive.
     * @type {number}
     * @attribute
     */
    smoothing = 18;

    /**
     * Extra smoothing responsiveness added per centimeter-per-second of head motion. Cuts
     * tracking lag while the head moves without adding jitter at rest. Set to 0 for a
     * fixed smoothing rate.
     * @type {number}
     * @attribute
     */
    motionBoost = 1.8;

    /**
     * How much of the tracking measurement age to compensate with velocity extrapolation
     * (1 leads the pose by the full age of the latest sample, 0 disables prediction).
     * Cuts the lag that comes from webcam frames being one or two frames old by the time
     * they render, at the price of amplifying a little measurement noise. The prediction
     * horizon is clamped so mispredictions stay small.
     * @type {number}
     * @attribute
     */
    prediction = 0.7;

    /**
     * The fingertip distance from an ear anchor at which a touch begins, as a fraction of
     * the apparent face height.
     * @type {number}
     * @attribute
     */
    touchEnter = 0.3;

    /**
     * The fingertip distance from an ear anchor beyond which a touch ends, as a fraction
     * of the apparent face height.
     * @type {number}
     * @attribute
     */
    touchExit = 0.45;

    /**
     * The number of consecutive inference frames a fingertip must stay near an ear anchor
     * before a touch begins. Higher rejects fleeting phantom detections.
     * @type {number}
     * @attribute
     */
    touchFrames = 5;

    /**
     * The seconds a held touch survives without any fingertip near its anchor before it
     * is released. Long enough to ride out a brief tracking flicker, short enough that
     * the blast reliably stops once the hand moves away.
     * @type {number}
     * @attribute
     */
    releaseGrace = 0.35;

    /**
     * Run hand inference on every Nth video frame. Set to 2 to halve the hand tracking
     * cost on weak devices - face inference always runs per frame as it drives the camera.
     * @type {number}
     * @attribute
     */
    handStride = 1;

    /**
     * Whether to match the camera's field of view to the one MediaPipe assumes for the
     * facial transformation matrix, corrected for the video cover crop. Improves how well
     * the visor registers with the face.
     * @type {boolean}
     * @attribute
     */
    matchVideoFov = true;

    /**
     * The vertical field of view in degrees that MediaPipe's face geometry assumes over
     * the full video frame.
     * @type {number}
     * @attribute
     */
    assumedFov = 63;

    /**
     * Whether to pin the head pose so that the anchor point projects exactly onto the
     * observed nose bridge landmark. Corrects the drift that the facial transformation
     * matrix alone shows when the head turns.
     * @type {boolean}
     * @attribute
     */
    anchorCorrection = true;

    /**
     * The nose bridge position in canonical face space centimeters - the point of the
     * head that is pinned to the observed nose bridge landmark.
     * @type {Vec3}
     * @attribute
     */
    anchorPoint = new Vec3(0, 3, 7);

    /**
     * @type {FaceLandmarker|null}
     * @private
     */
    faceLandmarker = null;

    /**
     * @type {HandLandmarker|null}
     * @private
     */
    handLandmarker = null;

    /**
     * @type {HTMLVideoElement|null}
     * @private
     */
    video = null;

    /** @private */
    _destroyed = false;

    /** @private */
    _sim = false;

    /** @private */
    _simTime = 0;

    /** @private */
    _simReady = false;

    /** @private */
    _fallbackView = false;

    /** @private */
    _lastVideoTime = -1;

    /** @private */
    _lastTimestamp = 0;

    /** @private */
    _frameIndex = 0;

    /** @private */
    _facePresent = false;

    /** @private */
    _faceEverSeen = false;

    /** @private */
    _faceMissTime = 0;

    /** @private */
    _poseSeeded = false;

    /** @private */
    _poseSpeed = 0;

    /** @private */
    _prevTargetPos = new Vec3();

    /** @private */
    _prevTargetRot = new Quat();

    /** @private */
    _prevTargetTime = 0;

    /** @private */
    _targetVel = new Vec3();

    /** @private */
    _rotDelta = new Quat();

    /** @private */
    _rotAxis = new Vec3();

    /** @private */
    _rotVel = new Vec3();

    /** @private */
    _predPos = new Vec3();

    /** @private */
    _predRot = new Quat();

    /** @private */
    _tmpQuat = new Quat();

    /** @private */
    _tmpQuat2 = new Quat();

    /** @private */
    _k = 1;

    /** @private */
    _matrix = new Mat4();

    /** @private */
    _targetPos = new Vec3();

    /** @private */
    _targetRot = new Quat();

    /** @private */
    _pos = new Vec3();

    /** @private */
    _rot = new Quat();

    /** @private */
    _ears = EAR_LANDMARKS.map(({ side, a, b }) => ({
        side,
        a,
        b,
        raw: { x: 0, y: 0 },
        smooth: { x: 0, y: 0 },
        seeded: false,
        screen: { x: 0, y: 0 },
        touching: false,
        enterCount: 0,
        exitCount: 0,
        awayTime: 0
    }));

    /** @private */
    _faceSize = { forehead: { x: 0, y: 0 }, chin: { x: 0, y: 0 }, px: 0 };

    /** @private */
    _bridge = {
        raw: { x: 0, y: 0 },
        smooth: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        seeded: false
    };

    /** @private */
    _sampleSeconds = 0;

    /** @private */
    _tips = [];

    /** @private */
    _tipCount = 0;

    /** @private */
    _payload = {
        face: false,
        anchors: [
            { side: 'right', x: 0, y: 0 },
            { side: 'left', x: 0, y: 0 }
        ],
        nearest: null
    };

    /** @private */
    _nearest = { side: '', x: 0, y: 0, proximity: 0 };

    /** @private */
    _pointerTouching = false;

    /** @private */
    _presses = new Set();

    /** @private */
    _tmpScreen = { x: 0, y: 0 };

    /** @private */
    _tmpVec = new Vec3();

    /** @private */
    _corrected = new Vec3();

    async initialize() {
        this._sim = new URLSearchParams(window.location.search).has('sim');

        // Pointer fallback: holding the pointer down anywhere charges and fires the blast.
        // Presses are tracked per pointer id so multi-touch pairs up correctly - the
        // touch only releases once every press has lifted. This also serves as the user
        // gesture that unlocks audio playback.
        const onPointerDown = (event) => {
            if (event.target.closest('button')) return;
            this._presses.add(event.pointerId);
            this._setTouch('screen', true);
        };
        const onPointerUp = (event) => {
            this._presses.delete(event.pointerId);
            if (this._presses.size === 0) this._setTouch('screen', false);
        };
        // A pointer released outside the window never sends pointerup
        const onBlur = () => {
            this._presses.clear();
            this._setTouch('screen', false);
        };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('blur', onBlur);

        // In sim mode, holding the space bar works like a pointer press
        const onKeyDown = (event) => {
            if (this._sim && event.code === 'Space' && !event.repeat) {
                this._presses.add('space');
                this._setTouch('screen', true);
            }
        };
        const onKeyUp = (event) => {
            if (this._sim && event.code === 'Space') {
                this._presses.delete('space');
                if (this._presses.size === 0) this._setTouch('screen', false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        const onCameraReady = (video) => {
            this.video = video;
        };
        const onCameraError = () => {
            // Without a camera, fall back to a static third-person view of the visor so
            // that the pointer fallback still gives a playable demo
            this._fallbackView = true;
        };
        this.app.on('camera:ready', onCameraReady);
        this.app.on('camera:error', onCameraError);

        // camera:error can fire synchronously from the cameraFeed script's initialize
        // (which runs before this one), so re-derive the unsupported-API case directly
        if (!this._sim && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
            this._fallbackView = true;
        }

        this.on('destroy', () => {
            this._destroyed = true;
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            this.app.off('camera:ready', onCameraReady);
            this.app.off('camera:error', onCameraError);
            this.faceLandmarker?.close();
            this.faceLandmarker = null;
            this.handLandmarker?.close();
            this.handLandmarker = null;
        });

        for (let i = 0; i < FINGERTIPS.length * 2; i++) {
            this._tips.push({ x: 0, y: 0 });
        }

        // Sim mode never touches the camera or MediaPipe
        if (this._sim) return;

        const wasmFileset = await FilesetResolver.forVisionTasks('../node_modules/@mediapipe/tasks-vision/wasm');
        if (this._destroyed) return;

        const [faceLandmarker, handLandmarker] = await Promise.all([
            FaceLandmarker.createFromOptions(wasmFileset, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            }),
            HandLandmarker.createFromOptions(wasmFileset, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.7,
                minHandPresenceConfidence: 0.6,
                minTrackingConfidence: 0.6
            })
        ]);
        if (this._destroyed) {
            faceLandmarker.close();
            handLandmarker.close();
            return;
        }

        // Warm up both models on a blank frame so that the first real inference (which
        // compiles GPU shaders) does not stall the experience once a face appears
        const warmup = document.createElement('canvas');
        warmup.width = 64;
        warmup.height = 64;
        warmup.getContext('2d').fillRect(0, 0, 64, 64);
        faceLandmarker.detectForVideo(warmup, this._nextTimestamp());
        handLandmarker.detectForVideo(warmup, this._nextTimestamp());

        this.faceLandmarker = faceLandmarker;
        this.handLandmarker = handLandmarker;
        this.app.fire('visor:ready');
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        if (this._sim) {
            this._updateSim(dt);
            return;
        }

        if (this._fallbackView) {
            this._updateFallbackView(dt);
            return;
        }

        if (!this.faceLandmarker || !this.handLandmarker) return;

        // The touch release and face-loss grace timers must keep running even while the
        // video is missing or stalled - a held touch must never stick
        this._updateFaceLoss(dt);

        if (!this.video) {
            this.video = document.querySelector('video');
            if (!this.video) return;
        }

        const video = this.video;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) {
            // Keep writing the smoothed pose so per-frame effects layered on top of it
            // (like the camera shake) never integrate drift into a stale transform
            this._updatePose(dt);
            return;
        }

        // Run inference only when the video has produced a new frame (webcams typically run
        // at ~30Hz while the app renders at 60Hz or more)
        if (video.currentTime !== this._lastVideoTime) {
            this._lastVideoTime = video.currentTime;

            this._processFace(this.faceLandmarker.detectForVideo(video, this._nextTimestamp()));

            if (this._frameIndex % Math.max(1, Math.round(this.handStride)) === 0) {
                this._processHands(this.handLandmarker.detectForVideo(video, this._nextTimestamp()));

                // Step the touch state machine only on fresh hand data, so its
                // consecutive-frame counts stay meaningful when hand inference is strided
                this._updateTouch();
            }
            this._frameIndex++;
        }

        this._matchFov();
        this._updatePose(dt);
        this._fireUpdate(dt);
    }

    /**
     * Returns a strictly increasing timestamp in milliseconds, as required by MediaPipe's
     * VIDEO running mode.
     * @returns {number} The timestamp.
     * @private
     */
    _nextTimestamp() {
        const now = performance.now();
        this._lastTimestamp = now > this._lastTimestamp ? now : this._lastTimestamp + 1;
        return this._lastTimestamp;
    }

    /**
     * Ingests a face inference: updates the camera pose target and the ear anchors.
     * @param {import('@mediapipe/tasks-vision').FaceLandmarkerResult} results - The face
     * landmarker results for the latest video frame.
     * @private
     */
    _processFace(results) {
        const landmarks = results.faceLandmarks?.[0];
        const matrix = results.facialTransformationMatrixes?.[0];

        if (!landmarks || !matrix) return;

        const reacquired = !this._facePresent;
        const longGap = this._faceMissTime > RESEED_AFTER;
        this._faceMissTime = 0;

        if (reacquired) {
            this._facePresent = true;
            this._faceEverSeen = true;
            this.app.fire('face:found');
        }

        // The matrix maps MediaPipe's canonical face space to camera space. Mirroring the
        // image about its vertical axis conjugates the transform by diag(-1, 1, 1), which
        // flips the sign of the elements with exactly one row or column index of 0.
        const data = matrix.data.slice();
        if (this.mirror) {
            data[1] = -data[1];
            data[2] = -data[2];
            data[4] = -data[4];
            data[8] = -data[8];
            data[12] = -data[12];
        }

        // Inverting it yields the camera pose in face space, with the face at the origin
        this._matrix.set(data).invert();
        this._matrix.getTranslation(this._targetPos);
        this._targetRot.setFromMat4(this._matrix);

        // Estimate the head's linear and angular velocity (softened between samples, so
        // the prediction stays stable) - they drive the adaptive smoothing and the
        // measurement age compensation in _updatePose
        const now = performance.now();
        this._sampleSeconds = 0;
        if (this._prevTargetTime > 0 && now > this._prevTargetTime) {
            const seconds = (now - this._prevTargetTime) / 1000;
            this._sampleSeconds = seconds;

            this._tmpVec.sub2(this._targetPos, this._prevTargetPos).mulScalar(1 / seconds);
            this._targetVel.lerp(this._targetVel, this._tmpVec, VELOCITY_SMOOTHING);
            this._poseSpeed = this._targetVel.length();

            this._tmpQuat.copy(this._prevTargetRot).invert();
            this._rotDelta.mul2(this._targetRot, this._tmpQuat);

            // getAxisAngle flips the sign of both the axis and the angle depending on
            // the axis octant, and an unnormalized near-identity product can even make
            // acos return NaN - so smooth the angular velocity as a single vector
            // (axis * rate), which is invariant to the sign convention, and reject any
            // non-finite sample
            let angle = this._rotDelta.getAxisAngle(this._rotAxis);
            if (angle > 180) angle -= 360;
            else if (angle < -180) angle += 360;
            const rate = angle / seconds;
            if (Number.isFinite(rate)) {
                this._tmpVec.copy(this._rotAxis).mulScalar(rate);
                this._rotVel.lerp(this._rotVel, this._tmpVec, VELOCITY_SMOOTHING);
            }
        }
        this._prevTargetPos.copy(this._targetPos);
        this._prevTargetRot.copy(this._targetRot);
        this._prevTargetTime = now;

        if (reacquired && longGap) {
            // Snap rather than swoop after a long absence
            this._poseSeeded = false;
            this._poseSpeed = 0;
            this._targetVel.set(0, 0, 0);
            this._rotVel.set(0, 0, 0);
        }

        // Track the ear anchors and face size in normalized image space, flipping x when
        // mirrored so they match the mirrored video display
        for (const ear of this._ears) {
            const a = landmarks[ear.a];
            const b = landmarks[ear.b];
            const x = (a.x + b.x) * 0.5;
            ear.raw.x = this.mirror ? 1 - x : x;
            ear.raw.y = (a.y + b.y) * 0.5;
            if (!ear.seeded) {
                ear.smooth.x = ear.raw.x;
                ear.smooth.y = ear.raw.y;
                ear.seeded = true;
            }
        }
        const forehead = landmarks[FOREHEAD];
        const chin = landmarks[CHIN];
        this._faceSize.forehead.x = this.mirror ? 1 - forehead.x : forehead.x;
        this._faceSize.forehead.y = forehead.y;
        this._faceSize.chin.x = this.mirror ? 1 - chin.x : chin.x;
        this._faceSize.chin.y = chin.y;

        const bridgeA = landmarks[BRIDGE_A];
        const bridgeB = landmarks[BRIDGE_B];
        const bx = (bridgeA.x + bridgeB.x) * 0.5;
        const prevX = this._bridge.raw.x;
        const prevY = this._bridge.raw.y;
        this._bridge.raw.x = this.mirror ? 1 - bx : bx;
        this._bridge.raw.y = (bridgeA.y + bridgeB.y) * 0.5;

        if (!this._bridge.seeded || longGap) {
            this._bridge.smooth.x = this._bridge.raw.x;
            this._bridge.smooth.y = this._bridge.raw.y;
            this._bridge.vel.x = 0;
            this._bridge.vel.y = 0;
            this._bridge.seeded = true;
        } else if (this._sampleSeconds > 0) {
            // The anchor pins the pose, so it needs its own velocity for prediction
            this._bridge.vel.x +=
                ((this._bridge.raw.x - prevX) / this._sampleSeconds - this._bridge.vel.x) * VELOCITY_SMOOTHING;
            this._bridge.vel.y +=
                ((this._bridge.raw.y - prevY) / this._sampleSeconds - this._bridge.vel.y) * VELOCITY_SMOOTHING;
        }
    }

    /**
     * Ingests a hand inference: collects the fingertip positions in viewport pixels.
     * @param {import('@mediapipe/tasks-vision').HandLandmarkerResult} results - The hand
     * landmarker results for the latest video frame.
     * @private
     */
    _processHands(results) {
        this._tipCount = 0;
        const hands = results.landmarks || [];

        for (let h = 0; h < hands.length; h++) {
            // Detection confidence is enforced by the landmarker's own thresholds (see
            // createFromOptions); the size gate below rejects what slips through.
            // Ignore detections whose apparent size is implausible for a hand held at
            // the head - the other tell of a phantom
            if (this._faceSize.px > 0) {
                const wrist = hands[h][WRIST];
                const knuckle = hands[h][MIDDLE_MCP];
                this._tmpScreen.x = this.mirror ? 1 - wrist.x : wrist.x;
                this._tmpScreen.y = wrist.y;
                this._toScreen(this._tmpScreen, this._tmpScreen);
                const wx = this._tmpScreen.x;
                const wy = this._tmpScreen.y;
                this._tmpScreen.x = this.mirror ? 1 - knuckle.x : knuckle.x;
                this._tmpScreen.y = knuckle.y;
                this._toScreen(this._tmpScreen, this._tmpScreen);
                const span = Math.hypot(this._tmpScreen.x - wx, this._tmpScreen.y - wy);
                if (span < HAND_SIZE_MIN * this._faceSize.px || span > HAND_SIZE_MAX * this._faceSize.px) continue;
            }

            for (const index of FINGERTIPS) {
                if (this._tipCount >= this._tips.length) return;
                const lm = hands[h][index];
                this._tmpScreen.x = this.mirror ? 1 - lm.x : lm.x;
                this._tmpScreen.y = lm.y;
                this._toScreen(this._tmpScreen, this._tips[this._tipCount]);
                this._tipCount++;
            }
        }
    }

    /**
     * Steps the touch state machine of both ear anchors. Runs at inference rate.
     * @private
     */
    _updateTouch() {
        if (!this._facePresent) return;

        // The apparent face height is the scale reference for the touch radii - unlike the
        // ear-to-ear width it stays stable when the head turns
        this._toScreen(this._faceSize.forehead, this._tmpScreen);
        const fx = this._tmpScreen.x;
        const fy = this._tmpScreen.y;
        this._toScreen(this._faceSize.chin, this._tmpScreen);
        const facePx = Math.hypot(this._tmpScreen.x - fx, this._tmpScreen.y - fy);
        this._faceSize.px = facePx;
        if (facePx < 1) return;

        const enterPx = this.touchEnter * facePx;
        const exitPx = this.touchExit * facePx;

        for (const ear of this._ears) {
            this._toScreen(ear.raw, ear.screen);
            const dist = this._nearestTipDistance(ear.screen);

            if (!ear.touching) {
                if (dist >= 0 && dist < enterPx) {
                    ear.enterCount++;
                    if (ear.enterCount >= this.touchFrames) {
                        ear.touching = true;
                        ear.exitCount = 0;
                        ear.awayTime = 0;
                        this.app.fire('visor:touch', ear.side);
                    }
                } else {
                    ear.enterCount = 0;
                }
            } else if (dist >= 0 && dist <= exitPx) {
                // A fingertip is holding the touch
                ear.awayTime = 0;
                ear.exitCount = 0;
            } else if (dist >= 0) {
                // The hand is tracked and has clearly moved away - release quickly
                ear.exitCount++;
                if (ear.exitCount >= EXIT_FRAMES) this._releaseEar(ear);
            }
            // In every other case the away timer in _updateFaceLoss releases the touch
        }
    }

    /**
     * Returns the distance in viewport pixels from a point to the nearest tracked
     * fingertip, or -1 if no fingertips are tracked.
     * @param {{ x: number, y: number }} point - The point to measure from.
     * @returns {number} The distance, or -1.
     * @private
     */
    _nearestTipDistance(point) {
        let best = -1;
        for (let i = 0; i < this._tipCount; i++) {
            const tip = this._tips[i];
            const dist = Math.hypot(tip.x - point.x, tip.y - point.y);
            if (best < 0 || dist < best) best = dist;
        }
        return best;
    }

    /**
     * Releases a touched ear anchor.
     * @param {object} ear - The ear state.
     * @private
     */
    _releaseEar(ear) {
        ear.touching = false;
        ear.enterCount = 0;
        ear.exitCount = 0;
        ear.awayTime = 0;
        this.app.fire('visor:release', ear.side);
    }

    /**
     * Fires or releases the pointer fallback touch.
     * @param {string} side - The touch side to report.
     * @param {boolean} down - Whether the touch is beginning.
     * @private
     */
    _setTouch(side, down) {
        if (this._pointerTouching === down) return;
        this._pointerTouching = down;
        this.app.fire(down ? 'visor:touch' : 'visor:release', side);
    }

    /**
     * Advances the face and hand loss grace timers. Runs at render rate.
     * @param {number} _dt - The delta time in seconds.
     * @private
     */
    _updateFaceLoss(dt) {
        if (!this._faceEverSeen) return;

        this._faceMissTime += dt;

        // A held touch survives only while fingertips keep refreshing it (_updateTouch).
        // Whether the hand left the frame, lost tracking, or a spurious detection wanders
        // elsewhere, the touch reliably releases once the grace period runs out.
        for (const ear of this._ears) {
            if (!ear.touching) continue;
            ear.awayTime += dt;
            if (ear.awayTime > this.releaseGrace) this._releaseEar(ear);
        }

        if (this._facePresent && this._faceMissTime > FACE_GRACE) {
            this._facePresent = false;
            for (const ear of this._ears) {
                if (ear.touching) this._releaseEar(ear);
            }
            this.app.fire('face:lost');
        }
    }

    /**
     * Eases the camera towards the latest pose target. Runs at render rate.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updatePose(dt) {
        if (!this._faceEverSeen) return;

        // Smooth harder at rest (stability) and lighter in motion (low lag), in the
        // spirit of the One Euro filter
        const rate = Math.min(80, this.smoothing + this._poseSpeed * this.motionBoost);
        const k = Math.min(1, 1 - Math.exp(-rate * dt));
        this._k = k;

        // Lead the target by the age of the measurement: a webcam sample was captured
        // CAPTURE_LATENCY before it arrived and more time has passed since, so
        // extrapolating along the estimated velocity for that long cuts perceived lag.
        // Clamps keep mispredictions small when the head changes direction.
        const staleness = Math.max(0, (performance.now() - this._prevTargetTime) / 1000) + CAPTURE_LATENCY;
        const age = Math.min(MAX_PREDICTION, staleness) * Math.max(0, Math.min(2, this.prediction));

        this._predPos.copy(this._targetPos);
        this._predRot.copy(this._targetRot);
        if (age > 0) {
            this._tmpVec.copy(this._targetVel).mulScalar(age);
            const jump = this._tmpVec.length();
            if (jump > 4) this._tmpVec.mulScalar(4 / jump);
            this._predPos.add(this._tmpVec);

            const rotRate = this._rotVel.length();
            const angle = Math.min(12, rotRate * age);
            if (angle > 0.01 && Number.isFinite(angle)) {
                this._rotAxis.copy(this._rotVel).mulScalar(1 / rotRate);
                this._tmpQuat.setFromAxisAngle(this._rotAxis, angle);
                this._tmpQuat2.copy(this._predRot);
                this._predRot.mul2(this._tmpQuat, this._tmpQuat2);
            }
        }

        if (!this._poseSeeded) {
            this._pos.copy(this._predPos);
            this._rot.copy(this._predRot);
            this._poseSeeded = true;
        } else {
            this._pos.lerp(this._pos, this._predPos, k);
            this._rot.slerp(this._rot, this._predRot, k);
        }

        this.entity.setPosition(this._pos);
        this.entity.setRotation(this._rot);

        // Pin the pose: shift the camera so that the canonical anchor point projects
        // exactly onto the observed nose bridge landmark. The matrix alone drifts a
        // little when the head turns; the landmark says where the bridge really is.
        if (
            this.anchorCorrection &&
            this._facePresent &&
            this._bridge.seeded &&
            this.entity.camera &&
            this.video?.videoWidth
        ) {
            // The anchor leads by the same measurement age as the pose
            const tx = this._bridge.raw.x + Math.max(-0.03, Math.min(0.03, this._bridge.vel.x * age));
            const ty = this._bridge.raw.y + Math.max(-0.03, Math.min(0.03, this._bridge.vel.y * age));
            this._bridge.smooth.x += (tx - this._bridge.smooth.x) * k;
            this._bridge.smooth.y += (ty - this._bridge.smooth.y) * k;
            this._toScreen(this._bridge.smooth, this._tmpScreen);

            // screenToWorld's distance is measured along the pixel ray, so use the
            // radial camera-to-anchor distance: the resulting shift preserves that
            // distance exactly, and a single pass pins the anchor to the pixel
            const depth = this._tmpVec.copy(this.anchorPoint).sub(this.entity.getPosition()).length();
            if (depth > 5) {
                this.entity.camera.screenToWorld(this._tmpScreen.x, this._tmpScreen.y, depth, this._tmpVec);
                this._corrected.copy(this.entity.getPosition()).add(this.anchorPoint).sub(this._tmpVec);
                this.entity.setPosition(this._corrected);
            }
        }
    }

    /**
     * Matches the camera's vertical field of view to the one MediaPipe assumed, corrected
     * for the cover-fit cropping of the video element, so that rendered geometry registers
     * with the video behind the canvas.
     * @private
     */
    _matchFov() {
        if (!this.matchVideoFov || !this.entity.camera || !this.video?.videoHeight) return;

        const canvas = this.app.graphicsDevice.canvas;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (!cw || !ch) return;

        const cover = Math.max(cw / this.video.videoWidth, ch / this.video.videoHeight);
        const tanHalf = Math.tan((this.assumedFov * Math.PI) / 360);
        const fov = (2 * Math.atan((tanHalf * ch) / (cover * this.video.videoHeight)) * 180) / Math.PI;
        this.entity.camera.fov = fov;
    }

    /**
     * Publishes the per-frame `visor:update` payload.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _fireUpdate(_dt) {
        const payload = this._payload;
        payload.face = this._facePresent;
        payload.nearest = null;

        if (this._facePresent) {
            const k = this._k;
            let bestDist = -1;

            for (let i = 0; i < this._ears.length; i++) {
                const ear = this._ears[i];
                ear.smooth.x += (ear.raw.x - ear.smooth.x) * k;
                ear.smooth.y += (ear.raw.y - ear.smooth.y) * k;
                this._toScreen(ear.smooth, this._tmpScreen);

                const anchor = payload.anchors[i];
                anchor.side = ear.side;
                anchor.x = this._tmpScreen.x;
                anchor.y = this._tmpScreen.y;

                for (let t = 0; t < this._tipCount; t++) {
                    const tip = this._tips[t];
                    const dist = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
                    if (bestDist < 0 || dist < bestDist) {
                        bestDist = dist;
                        this._nearest.side = ear.side;
                        this._nearest.x = tip.x;
                        this._nearest.y = tip.y;
                    }
                }
            }

            if (bestDist >= 0 && this._faceSize.px > 0) {
                this._nearest.proximity = Math.max(0, Math.min(1, 1 - bestDist / (this._faceSize.px * 0.9)));
                payload.nearest = this._nearest;
            }
        }

        this.app.fire('visor:update', payload);
    }

    /**
     * Converts a normalized landmark to viewport pixels, accounting for the cover-fit
     * cropping of the full-viewport video element.
     * @param {{ x: number, y: number }} lm - The normalized position.
     * @param {{ x: number, y: number }} out - The screen-space result.
     * @private
     */
    _toScreen(lm, out) {
        const canvas = this.app.graphicsDevice.canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const scale = Math.max(width / this.video.videoWidth, height / this.video.videoHeight);
        const displayWidth = this.video.videoWidth * scale;
        const displayHeight = this.video.videoHeight * scale;
        out.x = (width - displayWidth) * 0.5 + lm.x * displayWidth;
        out.y = (height - displayHeight) * 0.5 + lm.y * displayHeight;
    }

    /**
     * Drives the synthetic head pose used by `?sim` mode.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateSim(dt) {
        this._simTime += dt;

        if (!this._simReady && this._simTime > 0.25) {
            this._simReady = true;
            this.app.fire('visor:ready');
            this.app.fire('face:found');
        }

        this._orbitCamera(this._simTime);

        this._payload.face = this._simReady;
        this._payload.anchors[0].x = -1000;
        this._payload.anchors[0].y = -1000;
        this._payload.anchors[1].x = -1000;
        this._payload.anchors[1].y = -1000;
        this._payload.nearest = null;
        this.app.fire('visor:update', this._payload);
    }

    /**
     * Provides a static third-person view when no camera is available, so the pointer
     * fallback still gives a playable demo.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateFallbackView(dt) {
        this._simTime += dt;

        if (!this._simReady && this._simTime > 0.25) {
            this._simReady = true;
            this.app.fire('face:found');
        }

        this._orbitCamera(this._simTime * 0.25);
    }

    /**
     * Places the camera on a gentle orbit around the head origin, as if the head were
     * turning in front of the webcam.
     * @param {number} t - The animation time in seconds.
     * @private
     */
    _orbitCamera(t) {
        const yaw = Math.sin(t * 0.5) * 30 * (Math.PI / 180);
        const pitch = Math.sin(t * 0.31) * 9 * (Math.PI / 180);
        const dist = 46;
        const eyeY = 2.5;

        this._pos.set(
            Math.sin(yaw) * Math.cos(pitch) * dist,
            eyeY + Math.sin(pitch) * dist,
            Math.cos(yaw) * Math.cos(pitch) * dist
        );
        this.entity.setPosition(this._pos);
        this.entity.lookAt(0, eyeY, 0);
    }
}
