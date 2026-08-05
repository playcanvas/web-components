import { HandLandmarker } from '@mediapipe/tasks-vision';

import { FaceTracking } from './face-tracking.mjs';

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

/** The number of consecutive out-of-range inferences that release a touch. */
const EXIT_FRAMES = 2;

/**
 * Detects the user touching the side of their head, in the style of a certain
 * ruby-visored superhero. The script performs no rendering itself - it is a data source
 * for other scripts (like `opticBlastVisuals`) and for the host page.
 *
 * Extends the generic `faceTracking` script, which drives the camera from MediaPipe's
 * face landmarker (see face-tracking.mjs) and fires the `face:ready`, `face:found` and
 * `face:lost` events. This script adds hand tracking on the same video frames.
 *
 * Hands are tracked with MediaPipe's hand landmarker. Detections only count if they are
 * confident and plausibly sized for a hand held at the head, which keeps phantom
 * detections from triggering the blast. A touch begins when a fingertip holds near an
 * ear anchor (derived from the face oval landmarks) for `touchFrames` consecutive
 * inferences, and ends when it moves away or tracking of the hand is lost for longer
 * than `releaseGrace`. Holding the pointer down anywhere acts as a fallback touch.
 *
 * Fires the following events on the application, in addition to the face events of the
 * base class:
 *
 * - `visor:update` - Fired every frame with `{ face, anchors, nearest }` where `anchors`
 *   holds the two ear anchors as `{ side, x, y }` in viewport pixels and `nearest`
 *   describes the fingertip closest to an anchor as `{ side, x, y, proximity }` (or is
 *   null). The object is reused between frames - copy anything you keep.
 * - `visor:touch` - Fired with (side) when a touch begins. The side is 'left' or 'right'
 *   (the user's own left or right ear), or 'screen' for the pointer fallback.
 * - `visor:release` - Fired with (side) when a touch ends.
 */
export class OpticBlastTracking extends FaceTracking {
    static scriptName = 'opticBlastTracking';

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
     * @type {HandLandmarker|null}
     * @private
     */
    handLandmarker = null;

    /** @private */
    _frameIndex = 0;

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

    async initialize() {
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

        this.on('destroy', () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        });

        for (let i = 0; i < FINGERTIPS.length * 2; i++) {
            this._tips.push({ x: 0, y: 0 });
        }

        await super.initialize();
    }

    /**
     * Creates the face and hand landmarkers in parallel.
     * @param {import('@mediapipe/tasks-vision').WasmFileset} fileset - The WASM fileset.
     * @protected
     */
    async _createLandmarkers(fileset) {
        const [faceLandmarker, handLandmarker] = await Promise.all([
            this._createFaceLandmarker(fileset),
            HandLandmarker.createFromOptions(fileset, {
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
        this.faceLandmarker = faceLandmarker;
        this.handLandmarker = handLandmarker;
    }

    /**
     * @param {HTMLCanvasElement} canvas - A blank canvas to infer on.
     * @protected
     */
    _warmupLandmarkers(canvas) {
        super._warmupLandmarkers(canvas);
        this.handLandmarker.detectForVideo(canvas, this._nextTimestamp());
    }

    /** @protected */
    _closeLandmarkers() {
        super._closeLandmarkers();
        this.handLandmarker?.close();
        this.handLandmarker = null;
    }

    /**
     * @returns {boolean} True if inference can run.
     * @protected
     */
    _landmarkersReady() {
        return !!(this.faceLandmarker && this.handLandmarker);
    }

    /**
     * Tracks the ear anchors and face size in normalized image space, flipping x when
     * mirrored so they match the mirrored video display.
     * @param {Array<{ x: number, y: number, z: number }>} landmarks - The normalized
     * face landmarks of the tracked face.
     * @protected
     */
    _onFaceLandmarks(landmarks) {
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
    }

    /**
     * Runs hand inference on fresh video frames, honoring the hand stride.
     * @param {HTMLVideoElement} video - The video element.
     * @protected
     */
    _onVideoFrame(video) {
        if (this._frameIndex % Math.max(1, Math.round(this.handStride)) === 0) {
            this._processHands(this.handLandmarker.detectForVideo(video, this._nextTimestamp()));

            // Step the touch state machine only on fresh hand data, so its
            // consecutive-frame counts stay meaningful when hand inference is strided
            this._updateTouch();
        }
        this._frameIndex++;
    }

    /**
     * Advances the touch release grace timers. A held touch survives only while
     * fingertips keep refreshing it (_updateTouch). Whether the hand left the frame, lost
     * tracking, or a spurious detection wanders elsewhere, the touch reliably releases
     * once the grace period runs out.
     * @param {number} dt - The delta time in seconds.
     * @protected
     */
    _onFaceLossTick(dt) {
        for (const ear of this._ears) {
            if (!ear.touching) continue;
            ear.awayTime += dt;
            if (ear.awayTime > this.releaseGrace) this._releaseEar(ear);
        }
    }

    /**
     * Releases any held ear touches when the face is lost.
     * @protected
     */
    _onFaceLost() {
        for (const ear of this._ears) {
            if (ear.touching) this._releaseEar(ear);
        }
    }

    /**
     * Publishes the per-frame `visor:update` payload.
     * @param {number} _dt - The delta time in seconds.
     * @protected
     */
    _onUpdated(_dt) {
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
     * Drives the synthetic head pose used by `?sim` mode and publishes an empty payload.
     * @param {number} dt - The delta time in seconds.
     * @protected
     */
    _updateSim(dt) {
        super._updateSim(dt);

        this._payload.face = this._simReady;
        this._payload.anchors[0].x = -1000;
        this._payload.anchors[0].y = -1000;
        this._payload.anchors[1].x = -1000;
        this._payload.anchors[1].y = -1000;
        this._payload.nearest = null;
        this.app.fire('visor:update', this._payload);
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
            // In every other case the away timer in _onFaceLossTick releases the touch
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
}
