import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FILLMODE_KEEP_ASPECT, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, RESOLUTION_FIXED, Script } from 'playcanvas';

/** @enum {number} */
const Resolution = {
    SD: 0,      // 480p
    HD: 1,      // 720p
    FULLHD: 2   // 1080p
};

/** @enum {number} */
const FrameRate = {
    FPS_30: 30,
    FPS_60: 60
};

export class VideoRecorder extends Script {
    /**
     * Whether to activate the recorder on initialization.
     *
     * @attribute
     * @type {boolean}
     */
    activate = false;

    /**
     * The frame rate to record at.
     *
     * @attribute
     * @type {FrameRate}
     */
    frameRate = FrameRate.FPS_60;

    /**
     * The resolution to record at.
     *
     * @attribute
     * @type {Resolution}
     */
    resolution = Resolution.FULLHD;

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
        if (this.activate) {
            this.record();
        }
    }

    getResolutionDimensions() {
        switch (this.resolution) {
            case Resolution.FULLHD:
                return { width: 1920, height: 1080 };
            case Resolution.HD:
                return { width: 1280, height: 720 };
            case Resolution.SD:
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

    /**
     * Start recording.
     */
    record() {
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
            codec: 'avc1.420028', // H.264 codec
            width,
            height,
            bitrate: 8_000_000 // 8 Mbps
        });

        // Set canvas to video frame resolution
        this.app.setCanvasFillMode(FILLMODE_KEEP_ASPECT);
        this.app.setCanvasResolution(RESOLUTION_FIXED, width, height);
        this.app.resizeCanvas(width, height);

        // Start capturing frames
        this.app.on('frameend', this.captureFrame, this);

        // Replace update function to fix dt
        this.replaceUpdate();

        console.log('Recording started...');
    }

    /**
     * Stop recording.
     */
    async stop() {
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

        // Free resources
        this.encoder.close();
        this.encoder = null;
        this.muxer = null;

        console.log(`Recording stopped. Captured ${this.framesGenerated} frames.`);
    }

    /**
     * Download the recorded video.
     *
     * @param {Blob} blob - The recorded video blob.
     * @private
     */
    downloadBlob(blob) {
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording.mp4';
        a.click();

        URL.revokeObjectURL(url);
    }
}
