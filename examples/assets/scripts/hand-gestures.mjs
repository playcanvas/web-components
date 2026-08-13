import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { Script } from 'playcanvas';

/** The number of landmarks that MediaPipe reports for each hand. */
const NUM_LANDMARKS = 21;

/** The maximum wrist travel between inferences (in normalized units) for slot matching. */
const MAX_JUMP = 0.35;

/** The number of inference frames a hand may go undetected before its slot is released. */
const MAX_MISSED_FRAMES = 5;

/**
 * Detects hands in a camera feed using MediaPipe's gesture recognizer and fires events
 * describing them. The script performs no rendering itself - it is a data source for other
 * scripts (like `handVisuals`) and for the host page.
 *
 * Each detected hand is assigned to a persistent slot (0 to maxNumHands - 1) by matching
 * wrist positions between frames, so a slot reliably refers to the same physical hand even
 * when MediaPipe's detection order changes. Landmark positions are exponentially smoothed at
 * render rate and converted to viewport pixels, accounting for the `object-fit: cover`
 * cropping of the video element created by the `cameraFeed` script.
 *
 * Fires the following events on the application:
 *
 * - `hands:ready` - Fired once the model is loaded and warmed up.
 * - `hands:update` - Fired every frame with an array of active hands. Each entry is
 *   `{ slot, handedness, gesture: { name, score }, screenLandmarks, landmarks }` where
 *   `screenLandmarks` holds 21 smoothed `{ x, y, z }` entries in viewport pixels (z is
 *   MediaPipe's normalized depth hint) and `landmarks` holds the latest raw normalized
 *   landmarks. Entries and arrays are reused between frames - copy anything you keep.
 * - `hand:gesture` - Fired with (slot, name, score) when a hand's gesture changes and has
 *   remained stable for `stableFrames` inference frames. The name is one of MediaPipe's
 *   canned gestures (Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory,
 *   ILoveYou) or 'None'.
 * - `hand:lost` - Fired with (slot) when a tracked hand disappears.
 */
export class HandGestures extends Script {
    static scriptName = 'handGestures';

    /**
     * The maximum number of hands to track.
     * @type {number}
     * @attribute
     */
    maxNumHands = 2;

    /**
     * Whether the camera feed is displayed mirrored. Landmark coordinates and handedness
     * are flipped to match.
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * The minimum classification score for a gesture to be considered.
     * @type {number}
     * @attribute
     */
    minScore = 0.6;

    /**
     * The number of consecutive inference frames a gesture must persist before it is reported.
     * @type {number}
     * @attribute
     */
    stableFrames = 3;

    /**
     * The exponential smoothing rate applied to landmark positions. Higher is more responsive.
     * @type {number}
     * @attribute
     */
    smoothing = 18;

    /**
     * @type {GestureRecognizer|null}
     * @private
     */
    recognizer = null;

    /**
     * @type {HTMLVideoElement|null}
     * @private
     */
    video = null;

    /** @private */
    _slots = [];

    /** @private */
    _activeHands = [];

    /** @private */
    _lastVideoTime = -1;

    /** @private */
    _lastTimestamp = 0;

    /** @private */
    _destroyed = false;

    async initialize() {
        for (let i = 0; i < this.maxNumHands; i++) {
            this._slots.push(this._createSlot(i));
        }

        // The cameraFeed script announces its video element; fall back to querying the DOM
        const onCameraReady = (video) => {
            this.video = video;
        };
        this.app.on('camera:ready', onCameraReady);

        this.on('destroy', () => {
            this._destroyed = true;
            this.app.off('camera:ready', onCameraReady);
            this.recognizer?.close();
            this.recognizer = null;
        });

        const wasmFileset = await FilesetResolver.forVisionTasks('../node_modules/@mediapipe/tasks-vision/wasm');
        if (this._destroyed) return;

        const recognizer = await GestureRecognizer.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath:
                    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                delegate: 'GPU'
            },
            numHands: this.maxNumHands,
            runningMode: 'VIDEO'
        });
        if (this._destroyed) {
            recognizer.close();
            return;
        }

        // Warm up the recognizer on a blank frame so that the first real inference (which
        // compiles GPU shaders) does not stall the experience once hands appear
        const warmup = document.createElement('canvas');
        warmup.width = 64;
        warmup.height = 64;
        warmup.getContext('2d').fillRect(0, 0, 64, 64);
        recognizer.recognizeForVideo(warmup, this._nextTimestamp());

        this.recognizer = recognizer;
        this.app.fire('hands:ready');
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        if (!this.recognizer) return;

        if (!this.video) {
            this.video = document.querySelector('video');
            if (!this.video) return;
        }

        const video = this.video;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) return;

        // Run inference only when the video has produced a new frame (webcams typically run
        // at ~30Hz while the app renders at 60Hz or more)
        if (video.currentTime !== this._lastVideoTime) {
            this._lastVideoTime = video.currentTime;
            this._processResults(this.recognizer.recognizeForVideo(video, this._nextTimestamp()));
        }

        // Smooth landmarks at render rate and publish the active hands
        const k = 1 - Math.exp(-this.smoothing * dt);
        this._activeHands.length = 0;

        for (const slot of this._slots) {
            if (!slot.active) continue;

            for (let i = 0; i < NUM_LANDMARKS; i++) {
                const raw = slot.raw[i];
                const smooth = slot.smooth[i];
                if (slot.seeded) {
                    smooth.x += (raw.x - smooth.x) * k;
                    smooth.y += (raw.y - smooth.y) * k;
                    smooth.z += (raw.z - smooth.z) * k;
                } else {
                    smooth.x = raw.x;
                    smooth.y = raw.y;
                    smooth.z = raw.z;
                }
                this._toScreen(smooth, slot.payload.screenLandmarks[i]);
            }
            slot.seeded = true;
            slot.payload.handedness = slot.handedness;
            this._activeHands.push(slot.payload);
        }

        this.app.fire('hands:update', this._activeHands);
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
     * Creates an empty tracking slot with preallocated, reusable landmark storage.
     * @param {number} index - The slot index.
     * @returns {object} The slot.
     * @private
     */
    _createSlot(index) {
        const raw = [];
        const smooth = [];
        const screenLandmarks = [];
        for (let i = 0; i < NUM_LANDMARKS; i++) {
            raw.push({ x: 0, y: 0, z: 0 });
            smooth.push({ x: 0, y: 0, z: 0 });
            screenLandmarks.push({ x: 0, y: 0, z: 0 });
        }
        const gesture = { name: 'None', score: 0 };
        return {
            active: false,
            seeded: false,
            missed: 0,
            handedness: '',
            pendingName: null,
            pendingCount: 0,
            raw,
            smooth,
            gesture,
            payload: { slot: index, handedness: '', gesture, screenLandmarks, landmarks: raw }
        };
    }

    /**
     * Converts a normalized landmark to viewport pixels, accounting for the cover-fit
     * cropping of the full-viewport video element.
     * @param {{ x: number, y: number, z: number }} lm - The normalized landmark.
     * @param {{ x: number, y: number, z: number }} out - The screen-space result.
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
        out.z = lm.z;
    }

    /**
     * Assigns detections to tracking slots and updates them.
     * @param {import('@mediapipe/tasks-vision').GestureRecognizerResult} results - The
     * recognition results for the latest video frame.
     * @private
     */
    _processResults(results) {
        const detections = results.landmarks || [];
        const slots = this._slots;
        const slotTaken = slots.map(() => false);
        const detectionSlot = detections.map(() => -1);

        // Greedily match detections to active slots by wrist proximity
        const pairs = [];
        for (let s = 0; s < slots.length; s++) {
            if (!slots[s].active) continue;
            for (let d = 0; d < detections.length; d++) {
                const wrist = detections[d][0];
                const wx = this.mirror ? 1 - wrist.x : wrist.x;
                const dx = wx - slots[s].raw[0].x;
                const dy = wrist.y - slots[s].raw[0].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < MAX_JUMP) {
                    pairs.push({ s, d, dist });
                }
            }
        }
        pairs.sort((a, b) => a.dist - b.dist);
        for (const pair of pairs) {
            if (slotTaken[pair.s] || detectionSlot[pair.d] !== -1) continue;
            slotTaken[pair.s] = true;
            detectionSlot[pair.d] = pair.s;
        }

        // Unmatched detections claim a free slot (preferring inactive ones)
        for (let d = 0; d < detections.length; d++) {
            if (detectionSlot[d] !== -1) continue;
            let free = slots.findIndex((slot, s) => !slot.active && !slotTaken[s]);
            if (free === -1) free = slotTaken.findIndex((taken) => !taken);
            if (free === -1) continue;
            slotTaken[free] = true;
            detectionSlot[d] = free;
            this._activateSlot(slots[free]);
        }

        // Update matched slots and age out the rest
        for (let d = 0; d < detections.length; d++) {
            if (detectionSlot[d] !== -1) {
                this._updateSlot(detectionSlot[d], results, d);
            }
        }
        for (let s = 0; s < slots.length; s++) {
            if (!slots[s].active || slotTaken[s]) continue;
            slots[s].missed++;
            if (slots[s].missed > MAX_MISSED_FRAMES) {
                slots[s].active = false;
                this.app.fire('hand:lost', s);
            }
        }
    }

    /**
     * Resets a slot for a newly acquired hand.
     * @param {object} slot - The slot to reset.
     * @private
     */
    _activateSlot(slot) {
        slot.active = true;
        slot.seeded = false;
        slot.missed = 0;
        slot.handedness = '';
        slot.gesture.name = 'None';
        slot.gesture.score = 0;
        slot.pendingName = null;
        slot.pendingCount = 0;
    }

    /**
     * Copies a detection into a slot and steps its gesture hysteresis.
     * @param {number} s - The slot index.
     * @param {import('@mediapipe/tasks-vision').GestureRecognizerResult} results - The
     * recognition results.
     * @param {number} d - The detection index within the results.
     * @private
     */
    _updateSlot(s, results, d) {
        const slot = this._slots[s];
        slot.missed = 0;

        // Copy the landmarks, flipping x when mirrored
        const landmarks = results.landmarks[d];
        for (let i = 0; i < NUM_LANDMARKS; i++) {
            const lm = landmarks[i];
            const raw = slot.raw[i];
            raw.x = this.mirror ? 1 - lm.x : lm.x;
            raw.y = lm.y;
            raw.z = lm.z;
        }

        // MediaPipe's handedness assumes a pre-mirrored (selfie) input image; ours is the
        // raw camera frame, so the label is swapped to reflect the user's actual hand
        const handedness = results.handedness[d]?.[0]?.categoryName;
        if (handedness) {
            slot.handedness = handedness === 'Left' ? 'Right' : 'Left';
        }

        // Report a gesture change only once it has been stable for stableFrames inferences
        const top = results.gestures[d]?.[0];
        const name = top && top.score >= this.minScore ? top.categoryName : 'None';
        const score = name === 'None' ? 0 : top.score;

        if (name === slot.gesture.name) {
            slot.gesture.score = score;
            slot.pendingName = null;
            slot.pendingCount = 0;
        } else if (name === slot.pendingName) {
            slot.pendingCount++;
            if (slot.pendingCount >= this.stableFrames) {
                slot.gesture.name = name;
                slot.gesture.score = score;
                slot.pendingName = null;
                slot.pendingCount = 0;
                this.app.fire('hand:gesture', s, name, score);
            }
        } else {
            slot.pendingName = name;
            slot.pendingCount = 1;
        }
    }
}
