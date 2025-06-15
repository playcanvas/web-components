import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Mat4, Script } from 'playcanvas';

export class FaceDetection extends Script {
    static scriptName = 'faceDetection';

    /**
     * @type {FaceLandmarker}
     * @private
     */
    faceLandmarker;

    /**
     * @type {boolean}
     * @private
     */
    mirror = true;

    /**
     * @type {HTMLCanvasElement}
     * @private
     */
    offscreenCanvas = null;

    /**
     * @type {CanvasRenderingContext2D}
     * @private
     */
    offscreenCtx = null;

    async initialize() {
        const wasmFileset = await FilesetResolver.forVisionTasks(
            '../node_modules/@mediapipe/tasks-vision/wasm'
        );
        this.faceLandmarker = await FaceLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU'
            },
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            runningMode: 'VIDEO',
            numFaces: 1
        });
    }

    update(dt) {
        if (!this.faceLandmarker) return;

        const video = document.querySelector('video');

        // Only process if the video has enough data.
        if (!video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

        let inputElement = video;

        // If we want the detection to work in the mirrored space,
        // draw the video frame into an off-screen canvas that flips it.
        if (this.mirror) {
            if (!this.offscreenCanvas) {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
            }
            // Update canvas dimensions (in case they change).
            this.offscreenCanvas.width = video.videoWidth;
            this.offscreenCanvas.height = video.videoHeight;

            // Draw the video frame flipped horizontally.
            this.offscreenCtx.save();
            this.offscreenCtx.scale(-1, 1);
            // Drawing at negative width flips the image.
            this.offscreenCtx.drawImage(video, -video.videoWidth, 0, video.videoWidth, video.videoHeight);
            this.offscreenCtx.restore();

            // Feed the flipped image to MediaPipe.
            inputElement = this.offscreenCanvas;
        }

        const detections = this.faceLandmarker.detectForVideo(inputElement, Date.now());

        if (!detections) return;

        // Process facial transformation matrix
        if (detections.facialTransformationMatrixes && detections.facialTransformationMatrixes.length > 0) {
            // Apply head transform using facial transformation matrix
            const { data } = detections.facialTransformationMatrixes[0];
            const matrix = new Mat4();
            matrix.set(data).invert();
            const position = matrix.getTranslation();
            const rotation = matrix.getEulerAngles();
            this.entity.setPosition(position);
            this.entity.setEulerAngles(rotation);
        }

        // Process blendshapes
        if (detections.faceBlendshapes && detections.faceBlendshapes.length > 0) {
            const { categories } = detections.faceBlendshapes[0];
            this.app.fire('face:blendshapes', categories);
        }
    }
}
