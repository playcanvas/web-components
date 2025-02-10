import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Mat4, Script } from 'playcanvas';

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
            if (video && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                const detections = this.faceLandmarker.detectForVideo(video, Date.now());
                if (detections && detections.faceBlendshapes) {
                    if (detections.facialTransformationMatrixes.length > 0) {
                        const { data } = detections.facialTransformationMatrixes[0];
                        const matrix = new Mat4();
                        matrix.set(data).invert();
                        const position = matrix.getTranslation();
                        const rotation = matrix.getEulerAngles();
                        this.entity.setPosition(position);
                        this.entity.setEulerAngles(rotation);
                    }

                    if (detections.faceBlendshapes.length > 0) {
                        const { categories } = detections.faceBlendshapes[0];
                        const transform = detections.facialTransformationMatrixes[0];
                        this.app.fire('face:blendshapes', categories, transform);
                    }
                }
            }
        }
    }

}
