import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FILLMODE_KEEP_ASPECT, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, RESOLUTION_FIXED, Script } from 'playcanvas';

/** @enum {number} */
const Resolutions = {
    '480p': 0,
    '720p': 1,
    '1080p': 2
};

/** @enum {number} */
const FrameRates = {
    '30': 30,
    '60': 60
};

export class VideoRecorder extends Script {
    /**
     * The frame rate to record at.
     *
     * @attribute
     * @type {FrameRates}
     */
    frameRate = FrameRates['60'];

    /**
     * The resolution to record at.
     *
     * @attribute
     * @type {Resolutions}
     */
    resolution = Resolutions['1080p'];

    /**
     * @type {VideoEncoder|null}
     * @private
     */
    encoder = null;

    /**
     * @type {Muxer|null}
     * @private
     */
    muxer = null;

    /** @private */
    framesGenerated = 0;

    /** @private */
    recording = false;

    /** @private */
    originalUpdate = null;

    initialize() {
        this.createUI();
    }

    getResolutionDimensions() {
        switch (this.resolution) {
            case Resolutions['1080p']:
                return { width: 1920, height: 1080 };
            case Resolutions['720p']:
                return { width: 1280, height: 720 };
            case Resolutions['480p']:
            default:
                return { width: 854, height: 480 };
        }
    }

    replaceUpdate() {
        // Store the original update function in the instance
        this.originalUpdate = this.app.update;

        // Monkey patch with fixed dt based on the requested frame rate
        this.app.update = () => this.originalUpdate.call(this.app, 1 / this.frameRate);
    }

    restoreUpdate() {
        if (this.originalUpdate) {
            this.app.update = this.originalUpdate;
            this.originalUpdate = null;
        }
    }

    captureFrame() {
        const frame = new VideoFrame(this.app.graphicsDevice.canvas, {
            timestamp: this.framesGenerated * 1e6 / this.frameRate,
            duration: 1e6 / this.frameRate
        });
        this.encoder.encode(frame);
        frame.close();

        this.framesGenerated++;
    }

    startRecording() {
        if (this.recording) return;
        this.recording = true;
        this.framesGenerated = 0;

        const { width, height } = this.getResolutionDimensions();

        // Create video frame muxer
        this.muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width,
                height
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset'
        });

        // Create video frame encoder
        this.encoder = new VideoEncoder({
            output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
            error: e => console.error(e)
        });

        this.encoder.configure({
            codec: 'avc1.420028',
            width,
            height,
            bitrate: 8_000_000
        });

        // Set canvas to video frame resolution
        this.app.setCanvasFillMode(FILLMODE_KEEP_ASPECT);
        this.app.setCanvasResolution(RESOLUTION_FIXED, width, height);

        // Start capturing frames
        this.app.on('frameend', this.captureFrame, this);

        // Replace update function to fix dt
        this.replaceUpdate();

        console.log('Recording started...');
    }

    async stopRecording() {
        if (!this.recording) return;
        this.recording = false;

        // Restore update function
        this.restoreUpdate();

        // Stop capturing frames
        this.app.off('frameend', this.captureFrame, this);

        // Restore canvas fill mode and resolution
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);

        // Flush and finalize muxer
        await this.encoder.flush();
        this.muxer.finalize();

        // Download video
        const { buffer } = this.muxer.target;
        this.downloadBlob(new Blob([buffer], { type: 'video/mp4' }));

        // Free encoder
        this.encoder.close();
        this.encoder = null;

        // Free muxer
        this.muxer = null;

        console.log(`Recording stopped. Captured ${this.framesGenerated} frames.`);
    }

    downloadBlob(blob) {
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'playcanvas-recording.mp4';
        a.click();

        URL.revokeObjectURL(url);
    }

    createUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.left = '20px';
        container.style.zIndex = '1000';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.alignItems = 'center';

        const button = document.createElement('button');
        button.textContent = 'Start Recording';
        button.style.padding = '10px 20px';

        button.addEventListener('click', () => {
            if (this.recording) {
                this.stopRecording();
                button.textContent = 'Start Recording';
            } else {
                this.startRecording();
                button.textContent = 'Stop Recording';
            }
        });

        container.appendChild(button);
        document.body.appendChild(container);
    }
}
