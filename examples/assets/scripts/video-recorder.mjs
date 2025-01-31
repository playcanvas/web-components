import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Script } from 'playcanvas';

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
    frameRate = FrameRates['30'];

    /**
     * The resolution to record at.
     *
     * @attribute
     * @type {Resolutions}
     */
    resolution = Resolutions['480p'];

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
    _originalUpdate = null;

    /** @private */
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

    initialize() {
        const { width, height } = this.getResolutionDimensions();

        this.muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset'
        });

        this.encoder = new VideoEncoder({
            output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
            error: e => console.error(e)
        });

        this.encoder.configure({
            codec: 'avc1.42001f',
            width: width,
            height: height,
            bitrate: 1e6
        });

        this.app.on('frameend', () => {
            if (this.recording) {
                this.captureFrame();
            }
        });

        this.createUI();
    }

    async captureFrame() {
        console.log('Capturing frame...');

        const frame = new VideoFrame(this.app.graphicsDevice.canvas, {
            timestamp: this.framesGenerated * 1e6 / this.frameRate,
            duration: 1e6 / this.frameRate
        });
        this.encoder.encode(frame);
        frame.close();

        this.framesGenerated++;
    }

    startRecording() {
        if (!this.recording) {
            this.recording = true;
            this.replaceUpdate();
            console.log('Recording started...');
        }
    }

    async stopRecording() {
        if (this.recording) {
            this.recording = false;
            await this.encoder.flush();
            this.muxer.finalize();
            const { buffer } = this.muxer.target;
            this.downloadBlob(new Blob([buffer], { type: 'video/mp4' }));
            this.encoder.close();
            this.restoreUpdate();
            console.log('Recording stopped.');
        }
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

    replaceUpdate() {
        // Store the original update function in the instance
        this._originalUpdate = this.app.update;

        // Monkey patch with fixed dt based on the requested frame rate
        this.app.update = () => this._originalUpdate.call(this.app, 1 / this.frameRate);
    }

    restoreUpdate() {
        if (this._originalUpdate) {
            this.app.update = this._originalUpdate;
            this._originalUpdate = null;  // Clean up reference
        }
    }
}
