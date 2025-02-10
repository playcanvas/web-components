import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Script } from 'playcanvas';

export class FaceLandmarks extends Script {
    /** @type {FaceLandmarker} */
    faceLandmarker;

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
        if (this.faceLandmarker) {
            const video = document.querySelector('video');
            if (video && video.width > 0 && video.height > 0) {
                const detections = this.faceLandmarker.detectForVideo(video, Date.now());
                if (detections && detections.faceBlendshapes) {
                    if (detections.faceBlendshapes.length > 0) {
                        const { categories } = detections.faceBlendshapes[0];
                        this.app.fire('face:blendshapes', categories);
                    }
                }
            }
        }
    }
}
