import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Mat4, Quat, Script, Vec3 } from 'playcanvas';

/** Face landmarks whose midpoint is the nose bridge (the inner eye corners). */
const BRIDGE_A = 133;
const BRIDGE_B = 362;

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
 * Drives the camera from MediaPipe face tracking. The script performs no rendering
 * itself - it is a data source for other scripts and for the host page.
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
 * Appending `?sim` to the page URL skips MediaPipe entirely and instead orbits the
 * camera around the origin on a synthetic head pose - useful for previewing the scene
 * on devices without a webcam. A page offering this mode should remove its camera feed
 * script when the flag is present, so no camera permission is requested.
 *
 * Subclasses can extend the tracking loop through the protected hooks (`_onVideoFrame`,
 * `_onFaceLandmarks` and friends) to run extra inference on the same video frames - see
 * `opticBlastTracking` for an example that adds hand tracking.
 *
 * Fires the following events on the application:
 *
 * - `face:ready` - Fired once the models are loaded and warmed up.
 * - `face:found` - Fired when the face is first detected or reacquired.
 * - `face:lost` - Fired when the face has been undetected for a grace period.
 */
export class FaceTracking extends Script {
    static scriptName = 'faceTracking';

    /**
     * Whether the camera feed is displayed mirrored. Landmark coordinates and the facial
     * transformation matrix are flipped to match.
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * The exponential smoothing rate applied to the camera pose while the head is at
     * rest. Higher is more responsive.
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
     * Whether to match the camera's field of view to the one MediaPipe assumes for the
     * facial transformation matrix, corrected for the video cover crop. Improves how well
     * head-attached models register with the face.
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
    _bridge = {
        raw: { x: 0, y: 0 },
        smooth: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        seeded: false
    };

    /** @private */
    _sampleSeconds = 0;

    /** @private */
    _tmpScreen = { x: 0, y: 0 };

    /** @private */
    _tmpVec = new Vec3();

    /** @private */
    _corrected = new Vec3();

    async initialize() {
        this._sim = new URLSearchParams(window.location.search).has('sim');

        const onCameraReady = (video) => {
            this.video = video;
        };
        const onCameraError = () => {
            // Without a camera, fall back to a static third-person view of the scene so
            // that the page still gives a usable demo
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
            this.app.off('camera:ready', onCameraReady);
            this.app.off('camera:error', onCameraError);
            this._closeLandmarkers();
        });

        // Sim mode never touches the camera or MediaPipe
        if (this._sim) return;

        const wasmFileset = await FilesetResolver.forVisionTasks('../node_modules/@mediapipe/tasks-vision/wasm');
        if (this._destroyed) return;

        await this._createLandmarkers(wasmFileset);
        if (this._destroyed) {
            this._closeLandmarkers();
            return;
        }

        // Warm up the models on a blank frame so that the first real inference (which
        // compiles GPU shaders) does not stall the experience once a face appears
        const warmup = document.createElement('canvas');
        warmup.width = 64;
        warmup.height = 64;
        warmup.getContext('2d').fillRect(0, 0, 64, 64);
        this._warmupLandmarkers(warmup);

        this.app.fire('face:ready');
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

        if (!this._landmarkersReady()) return;

        // The face-loss grace timer (and any subclass timers riding _onFaceLossTick) must
        // keep running even while the video is missing or stalled
        this._updateFaceLoss(dt);

        if (!this.video) {
            this.video = document.querySelector('video');
            if (!this.video) return;
        }

        const video = this.video;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) {
            // Keep writing the smoothed pose so per-frame effects layered on top of it
            // (like a camera shake) never integrate drift into a stale transform
            this._updatePose(dt);
            return;
        }

        // Run inference only when the video has produced a new frame (webcams typically run
        // at ~30Hz while the app renders at 60Hz or more)
        if (video.currentTime !== this._lastVideoTime) {
            this._lastVideoTime = video.currentTime;

            this._processFace(this.faceLandmarker.detectForVideo(video, this._nextTimestamp()));
            this._onVideoFrame(video);
        }

        this._matchFov();
        this._updatePose(dt);
        this._onUpdated(dt);
    }

    /**
     * Creates the landmarkers used by the tracking loop. Subclasses override this to load
     * additional models alongside the face landmarker (compose with
     * `_createFaceLandmarker` to keep the downloads parallel).
     * @param {import('@mediapipe/tasks-vision').WasmFileset} fileset - The WASM fileset.
     * @protected
     */
    async _createLandmarkers(fileset) {
        this.faceLandmarker = await this._createFaceLandmarker(fileset);
    }

    /**
     * Creates the face landmarker.
     * @param {import('@mediapipe/tasks-vision').WasmFileset} fileset - The WASM fileset.
     * @returns {Promise<FaceLandmarker>} The face landmarker.
     * @protected
     */
    _createFaceLandmarker(fileset) {
        return FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
                modelAssetPath:
                    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU'
            },
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: true,
            runningMode: 'VIDEO',
            numFaces: 1
        });
    }

    /**
     * Runs a throwaway inference on each landmarker. Subclasses override this to warm any
     * additional models they created.
     * @param {HTMLCanvasElement} canvas - A blank canvas to infer on.
     * @protected
     */
    _warmupLandmarkers(canvas) {
        this.faceLandmarker.detectForVideo(canvas, this._nextTimestamp());
    }

    /**
     * Closes and releases the landmarkers. Subclasses override this to close any
     * additional models they created.
     * @protected
     */
    _closeLandmarkers() {
        this.faceLandmarker?.close();
        this.faceLandmarker = null;
    }

    /**
     * Whether every landmarker the tracking loop needs is ready.
     * @returns {boolean} True if inference can run.
     * @protected
     */
    _landmarkersReady() {
        return !!this.faceLandmarker;
    }

    /**
     * Called with the raw face landmarks each time a face inference lands. Subclasses
     * override this to track landmarks of their own.
     * @param {Array<{ x: number, y: number, z: number }>} _landmarks - The normalized
     * face landmarks of the tracked face.
     * @protected
     */
    _onFaceLandmarks(_landmarks) {
        // Intentionally empty - for subclasses to override.
    }

    /**
     * Called each time the video has produced (and face inference has consumed) a new
     * frame. Subclasses override this to run additional inference on the frame.
     * @param {HTMLVideoElement} _video - The video element.
     * @protected
     */
    _onVideoFrame(_video) {
        // Intentionally empty - for subclasses to override.
    }

    /**
     * Called at the end of every tracking update, after the camera pose has been written.
     * Subclasses override this to publish per-frame data.
     * @param {number} _dt - The delta time in seconds.
     * @protected
     */
    _onUpdated(_dt) {
        // Intentionally empty - for subclasses to override.
    }

    /**
     * Called every frame while the loss grace timers advance. Subclasses override this to
     * advance timers of their own.
     * @param {number} _dt - The delta time in seconds.
     * @protected
     */
    _onFaceLossTick(_dt) {
        // Intentionally empty - for subclasses to override.
    }

    /**
     * Called when the face is declared lost, just before the `face:lost` event fires.
     * @protected
     */
    _onFaceLost() {
        // Intentionally empty - for subclasses to override.
    }

    /**
     * Returns a strictly increasing timestamp in milliseconds, as required by MediaPipe's
     * VIDEO running mode.
     * @returns {number} The timestamp.
     * @protected
     */
    _nextTimestamp() {
        const now = performance.now();
        this._lastTimestamp = now > this._lastTimestamp ? now : this._lastTimestamp + 1;
        return this._lastTimestamp;
    }

    /**
     * Ingests a face inference: updates the camera pose target and the tracked landmarks.
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

        this._onFaceLandmarks(landmarks);

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
     * Advances the face loss grace timer. Runs at render rate.
     * @param {number} dt - The delta time in seconds.
     * @private
     */
    _updateFaceLoss(dt) {
        if (!this._faceEverSeen) return;

        this._faceMissTime += dt;

        this._onFaceLossTick(dt);

        if (this._facePresent && this._faceMissTime > FACE_GRACE) {
            this._facePresent = false;
            this._onFaceLost();
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
     * Converts a normalized landmark to viewport pixels, accounting for the cover-fit
     * cropping of the full-viewport video element.
     * @param {{ x: number, y: number }} lm - The normalized position.
     * @param {{ x: number, y: number }} out - The screen-space result.
     * @protected
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
     * @protected
     */
    _updateSim(dt) {
        this._simTime += dt;

        if (!this._simReady && this._simTime > 0.25) {
            this._simReady = true;
            this.app.fire('face:ready');
            this.app.fire('face:found');
        }

        this._orbitCamera(this._simTime);
    }

    /**
     * Provides a static third-person view when no camera is available, so the page still
     * gives a usable demo.
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
