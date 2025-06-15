import { HandLandmarker, GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';
import { Script, Vec3 } from 'playcanvas';

export class HandGestureController extends Script {
    static scriptName = 'handGestureController';

    /**
     * Maximum number of hands to detect
     * @type {number}
     * @attribute
     */
    maxNumHands = 2;

    /**
     * Whether to mirror the input
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * @type {HandLandmarker}
     * @private
     */
    handLandmarker;

    /**
     * @type {GestureRecognizer}
     * @private
     */
    gestureRecognizer;

    /**
     * @type {HTMLCanvasElement}
     * @private
     */
    offscreenCanvas = null;

    async initialize() {
        const wasmFileset = await FilesetResolver.forVisionTasks(
            '../node_modules/@mediapipe/tasks-vision/wasm'
        );

        // Initialize hand landmarker
        this.handLandmarker = await HandLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                delegate: 'GPU'
            },
            numHands: this.maxNumHands,
            runningMode: 'VIDEO'
        });

        // Initialize gesture recognizer
        this.gestureRecognizer = await GestureRecognizer.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO'
        });
    }

    update(dt) {
        if (!this.handLandmarker || !this.gestureRecognizer) return;

        const video = document.querySelector('video');
        if (!video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

        const inputElement = this.prepareInputElement(video);

        // Detect hand landmarks
        const handResults = this.handLandmarker.detectForVideo(inputElement, Date.now());

        // Recognize gestures
        const gestureResults = this.gestureRecognizer.recognizeForVideo(inputElement, Date.now());

        this.processResults(handResults, gestureResults);
    }

    prepareInputElement(video) {
        // Mirror handling code similar to face-detection.mjs
        if (this.mirror) {
            if (!this.offscreenCanvas) {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
            }

            this.offscreenCanvas.width = video.videoWidth;
            this.offscreenCanvas.height = video.videoHeight;

            this.offscreenCtx.save();
            this.offscreenCtx.scale(-1, 1);
            this.offscreenCtx.drawImage(video, -video.videoWidth, 0, video.videoWidth, video.videoHeight);
            this.offscreenCtx.restore();

            return this.offscreenCanvas;
        }

        return video;
    }

    processResults(handResults, gestureResults) {
        // Fire events for hand landmarks
        if (handResults.landmarks) {
            this.app.fire('hands:landmarks', handResults.landmarks);

            // Calculate hand position in 3D space
            handResults.landmarks.forEach((landmarks, handIndex) => {
                // Use wrist position (landmark 0) as hand position
                const wrist = landmarks[0];
                const handPosition = new Vec3(
                    (wrist.x - 0.5) * 2, // Convert 0-1 to -1 to 1
                    (0.5 - wrist.y) * 2, // Flip Y and convert to -1 to 1
                    -wrist.z * 5 // Scale Z for better depth perception
                );

                this.app.fire('hand:position', { handIndex, position: handPosition });
            });
        }

        // Process gestures
        if (gestureResults.gestures && gestureResults.gestures.length > 0) {
            gestureResults.gestures.forEach((gestureArray, handIndex) => {
                if (gestureArray.length > 0) {
                    // Get the most confident gesture
                    const { categoryName, score } = gestureArray[0];

                    // Fire event with gesture info
                    this.app.fire('hand:gesture', handIndex, categoryName, score);
                }
            });
        }
    }
}
