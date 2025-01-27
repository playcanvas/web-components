import { KEY_SPACE, Script } from 'playcanvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

class VideoEncoder extends Script {
    /** @type {import('@ffmpeg/ffmpeg').FFmpeg} */
    ffmpeg = null;

    /** @type {boolean} */
    isReady = false;

    /** @type {boolean} */
    isRecording = false;

    /** @type {Uint8Array[]} */
    frames = [];

    /** @type {number} */
    frameCount = 0;

    async initialize() {
        try {
            // Create FFmpeg instance
            this.ffmpeg = new FFmpeg();

            this.ffmpeg.on('log', ({ message }) => {
                console.log(message);
            });
            this.ffmpeg.on("progress", ({ progress }) => {
                console.log(`FFmpeg progress: ${progress * 100} %`);
            });

            // Load FFmpeg
            const baseURL = '/examples/modules/ffmpeg';
            await this.ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
            });

            this.isReady = true;
            console.log('FFmpeg is ready!');

            // Create container for controls
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.bottom = '20px';
            container.style.left = '20px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            container.style.alignItems = 'center';

            // Create progress container
            const progressContainer = document.createElement('div');
            progressContainer.style.display = 'none'; // Hidden by default
            progressContainer.style.width = '100px';
            progressContainer.style.height = '20px';
            progressContainer.style.backgroundColor = '#eee';
            progressContainer.style.borderRadius = '10px';
            progressContainer.style.overflow = 'hidden';

            // Create progress bar
            const progressBar = document.createElement('div');
            progressBar.style.width = '0%';
            progressBar.style.height = '100%';
            progressBar.style.backgroundColor = '#4CAF50';
            progressBar.style.transition = 'width 0.3s ease';

            progressContainer.appendChild(progressBar);

            // Update progress handler
            this.ffmpeg.on('progress', ({ progress }) => {
                progressContainer.style.display = 'block';
                progressBar.style.width = `${progress * 100}%`;
            });

            // Create format selector
            const select = document.createElement('select');
            select.style.padding = '8px';
            
            const formats = [
                { value: 'mp4', label: 'MP4 (H.264)', mime: 'video/mp4', ext: '.mp4', ffmpegOpts: [
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-pix_fmt', 'yuv420p'
                ]},
                { value: 'webm', label: 'WebM (VP8)', mime: 'video/webm', ext: '.webm', ffmpegOpts: [
                    '-c:v', 'libvpx',
                    '-crf', '12',
                    '-b:v', '1M'
                ]},
                { value: 'gif', label: 'GIF', mime: 'image/gif', ext: '.gif', ffmpegOpts: [
                    '-filter_complex', '[0:v] split [a][b];[a] palettegen [p];[b][p] paletteuse'
                ]}
            ];

            formats.forEach(format => {
                const option = document.createElement('option');
                option.value = format.value;
                option.textContent = format.label;
                select.appendChild(option);
            });

            // Create record button
            const button = document.createElement('button');
            button.textContent = 'Start Recording';
            button.style.padding = '10px 20px';
            
            button.addEventListener('click', () => {
                if (this.isRecording) {
                    this.stopRecording(formats.find(f => f.value === select.value));
                    button.textContent = 'Start Recording';
                } else {
                    this.startRecording();
                    button.textContent = 'Stop Recording';
                }
            });

            // Add all elements to container in the desired order
            container.appendChild(select);
            container.appendChild(button);
            container.appendChild(progressContainer);
            document.body.appendChild(container);

        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            throw error;
        }
    }

    startRecording() {
        if (!this.isReady) {
            throw new Error('FFmpeg is not initialized');
        }
        this.isRecording = true;
        this.frames = [];
        this.frameCount = 0;
        console.log('Started recording...');

        this.app.autoRender = false;
    }

    async download() {
        try {
            console.log('Reading output file...');
            // List files to check if output.mp4 exists
            const files = await this.ffmpeg.listDir('/');
            console.log('Files in FFmpeg filesystem:', files);

            // Check if output.mp4 exists
            if (!files.some(file => file.name === 'output.mp4')) {
                throw new Error('output.mp4 not found in filesystem');
            }

            // Retrieve the encoded video
            const video = await this.ffmpeg.readFile('output.mp4');
            if (!video || !video.buffer) {
                throw new Error('Failed to read output.mp4');
            }
            console.log('Creating video blob...');
            const videoBlob = new Blob([video.buffer], { type: 'video/mp4' });
            const videoURL = URL.createObjectURL(videoBlob);

            // Provide a download link
            const a = document.createElement('a');
            a.href = videoURL;
            a.download = 'recording.mp4';
            a.click();

            // Clean up
            URL.revokeObjectURL(videoURL);
            console.log('Download initiated!');
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    }
    
    async stopRecording(format) {
        if (!this.isRecording) {
            throw new Error('Not recording');
        }

        this.app.autoRender = true;

        this.isRecording = false;
        console.log('Stopped recording. Processing frames...');
        
        if (this.frames.length === 0) {
            console.error('No frames captured');
            return;
        }
        
        try {
            // Find the progress container and show it
            const progressContainer = document.querySelector('div[style*="display: none"]');
            if (progressContainer) {
                progressContainer.style.display = 'block';
            }

            console.log(`Writing ${this.frames.length} frames to FFmpeg...`);
            // Write each PNG frame
            for (let i = 0; i < this.frames.length; i++) {
                await this.ffmpeg.writeFile(`frame${i.toString().padStart(4, '0')}.png`, this.frames[i]);
            }
            console.log('Frames written, starting encoding...');

            // Base FFmpeg command
            const ffmpegCmd = [
                '-framerate', '30',
                '-i', 'frame%04d.png',
                '-movflags', '+faststart',
                '-threads', '1',
                '-y',
                `output${format.ext}`
            ];

            // Add format-specific options
            ffmpegCmd.splice(ffmpegCmd.length - 2, 0, ...format.ffmpegOpts);

            // Then run FFmpeg command to encode the video
            await this.ffmpeg.exec(ffmpegCmd);

            console.log('Encoding complete, preparing download...');
            const video = await this.ffmpeg.readFile(`output${format.ext}`);
            const videoBlob = new Blob([video.buffer], { type: format.mime });
            const videoURL = URL.createObjectURL(videoBlob);

            // Provide download link
            const a = document.createElement('a');
            a.href = videoURL;
            a.download = `recording${format.ext}`;
            a.click();

            // Clean up
            URL.revokeObjectURL(videoURL);
            for (let i = 0; i < this.frames.length; i++) {
                await this.ffmpeg.deleteFile(`frame${i.toString().padStart(4, '0')}.png`);
            }
            await this.ffmpeg.deleteFile(`output${format.ext}`);

            this.frames = [];
            console.log('Video processing complete!');

            // Hide progress at the end
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
        } catch (error) {
            // Hide progress on error
            const progressContainer = document.querySelector('div[style*="display"]');
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            console.error('Error processing video:', error);
            console.error('Error details:', error.message);
            if (error.stack) console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async captureFrame(canvas) {
        if (!this.isRecording) return;

        // Create a temporary canvas with even dimensions
        const tempCanvas = document.createElement('canvas');
        // Round up to even numbers
        tempCanvas.width = Math.ceil(canvas.width / 2) * 2;
        tempCanvas.height = Math.ceil(canvas.height / 2) * 2;
        
        // Draw and scale the original canvas to our even-dimensioned canvas
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Get PNG blob from the temp canvas
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        const arrayBuffer = await blob.arrayBuffer();
        this.frames.push(new Uint8Array(arrayBuffer));

        this.frameCount++;
        if (this.frameCount % 30 === 0) {
            console.log(`Captured ${this.frameCount} frames...`);
        }

        this.app.renderNextFrame = true;
    }

    update(dt) {
        if (this.isRecording) {
            this.captureFrame(this.app.graphicsDevice.canvas);
        }
    }

    isInitialized() {
        return this.isReady;
    }
}

export { VideoEncoder };
