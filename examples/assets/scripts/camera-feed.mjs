import { Script } from 'playcanvas';

/**
 * A script that displays a live camera feed from the device's camera.
 *
 * This script creates a video element and requests access to the device's camera.
 * It then streams the camera's video to the video element and plays it.
 */
export class CameraFeed extends Script {
    static scriptName = 'cameraFeed';

    /**
     * Whether to flip the video stream horizontally to behave like a mirror.
     *
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * @type {HTMLVideoElement|null}
     */
    video = null;

    createVideoElement() {
        const video = document.createElement('video');

        // Enable inline playback, autoplay, and mute (important for mobile)
        video.setAttribute('playsinline', '');
        video.autoplay = true;
        video.muted = true;

        // Style the video element to fill the viewport and cover it like CSS background-size: cover
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';

        // Set a negative z-index so the video appears behind the canvas
        video.style.zIndex = '-1';

        // Mirror the video stream, if chosen.
        if (this.mirror) {
            video.style.transform = 'scaleX(-1)';
        }

        return video;
    }

    initialize() {
        this.video = this.createVideoElement();

        // Insert the video element into the DOM.
        document.body.appendChild(this.video);

        this.on('destroy', () => {
            if (this.video && this.video.srcObject) {
                // Stop the video stream
                this.video.srcObject.getTracks().forEach(track => track.stop());
            }
            // Remove the video element from the DOM
            document.body.removeChild(this.video);
            this.video = null;
        });

        // Request access to the webcam
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then((stream) => {
                // Stream the webcam to the video element and play it
                this.video.srcObject = stream;
                this.video.play();
            })
            .catch((error) => {
                console.error('Error accessing the webcam:', error);
            });
        } else {
            console.error('getUserMedia is not supported in this browser.');
        }
    }

    update(dt) {
        // Optional per-frame logic.
    }
}
