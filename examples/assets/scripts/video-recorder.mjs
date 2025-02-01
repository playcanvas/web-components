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
    totalFrames = 0;

    /** @private */
    framesEncoded = 0;

    /** @private */
    framesEncodedAtFlush = 0;

    /** @private */
    recording = false;

    /** @private */
    originalUpdate = null;

    initialize() {
        if (this.activate) {
            this.record();
        }
    }

    getVideoSettings() {
        switch (this.resolution) {
            case Resolution.FULLHD:
                return { width: 1920, height: 1080, bitrate: 8_000_000 }; // 8 Mbps for 1080p
            case Resolution.HD:
                return { width: 1280, height: 720, bitrate: 5_000_000 }; // 5 Mbps for 720p
            case Resolution.SD:
            default:
                return { width: 854, height: 480, bitrate: 2_000_000 }; // 2 Mbps for 480p
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
            timestamp: this.totalFrames * 1e6 / this.frameRate,
            duration: 1e6 / this.frameRate
        });
        this.encoder.encode(frame);
        frame.close();

        this.totalFrames++;
    }

    /**
     * Start recording.
     */
    record() {
        if (this.recording) return;
        this.recording = true;
        this.totalFrames = 0;
        this.framesEncoded = 0;
        this.framesEncodedAtFlush = 0;

        const { width, height, bitrate } = this.getVideoSettings();

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
            output: (chunk, meta) => {
                this.framesEncoded++;
                this.muxer.addVideoChunk(chunk, meta);
                if (!this.recording) {
                    this.app.fire('encode:progress', (this.framesEncoded - this.framesEncodedAtFlush) / (this.totalFrames - this.framesEncodedAtFlush));
                }
            },
            error: e => console.error(e)
        });

        // Configure encoder with video settings
        this.encoder.configure({
            codec: 'avc1.420028', // H.264 codec
            width,
            height,
            bitrate
        });

        // Set canvas to video frame resolution
        this.app.setCanvasResolution(RESOLUTION_FIXED, width, height);
        this.app.setCanvasFillMode(FILLMODE_KEEP_ASPECT);

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
        this.framesEncodedAtFlush = this.framesEncoded;

        this.app.fire('encode:begin');

        // Restore update function
        this.restoreUpdate();

        // Disable auto render - this allows CPU/GPU resources to be directed towards encoding
        const originalAutoRender = this.app.autoRender;
        this.app.autoRender = false;

        // Stop capturing frames
        this.app.off('frameend', this.captureFrame, this);

        // Restore canvas fill mode and resolution
        this.app.setCanvasResolution(RESOLUTION_AUTO);
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);

        // Flush and finalize muxer
        await this.encoder.flush();
        this.muxer.finalize();

        // Download video
        const { buffer } = this.muxer.target;
        this.app.fire('encode:end', buffer);

        // Free resources
        this.encoder.close();
        this.encoder = null;
        this.muxer = null;

        // Restore auto render state
        this.app.autoRender = originalAutoRender;

        console.log(`Recording stopped. Captured ${this.totalFrames} frames.`);
    }
}
