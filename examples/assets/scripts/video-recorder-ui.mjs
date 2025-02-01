import { Script } from 'playcanvas';

export class VideoRecorderUI extends Script {
    initialize() {
        this.createUI();
        // Listen to video recording progress events
        this.app.on('encode:begin', this.onEncodeBegin, this);
        this.app.on('encode:progress', this.onEncodeProgress, this);
        this.app.on('encode:end', this.onEncodeEnd, this);
    }

    createUI() {
        // Set a fixed container width to align the rows and button
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '16px';
        container.style.left = '16px';
        container.style.zIndex = '1000';
        container.style.width = '150px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.alignItems = 'stretch';
        // Apply a consistent font family and font size to all elements.
        container.style.fontFamily = 'Arial, sans-serif';
        container.style.fontSize = '14px';  // Set a common font size

        // Create options container to hold resolution and framerate selectors.
        // Stacking them vertically.
        const optionsContainer = document.createElement('div');
        optionsContainer.style.display = 'flex';
        optionsContainer.style.flexDirection = 'column';
        optionsContainer.style.gap = '10px';
        optionsContainer.style.alignItems = 'stretch';

        // Create a function to style each row for aligned labels and dropdowns.
        const createRow = (labelText, dropdownOptions, defaultValue) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'row';
            row.style.alignItems = 'center';
            row.style.gap = '5px';
            row.style.width = '100%';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.width = '100px';
            label.style.color = '#fff';

            const select = document.createElement('select');
            select.style.width = '75px';

            dropdownOptions.forEach((opt) => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                select.appendChild(option);
            });
            select.value = defaultValue;

            row.appendChild(label);
            row.appendChild(select);
            return { row, select };
        };

        // Create resolution row (480p, 720p, 1080p)
        const resolutionData = {
            label: 'Resolution:',
            options: [
                { value: 'SD', text: '480p' },
                { value: 'HD', text: '720p' },
                { value: 'FULLHD', text: '1080p' }
            ],
            default: 'FULLHD'
        };
        const { row: resolutionRow, select: resolutionSelect } = createRow(
            resolutionData.label,
            resolutionData.options,
            resolutionData.default
        );

        // Create framerate row (30 FPS, 60 FPS)
        const frameRateData = {
            label: 'Frame Rate:',
            options: [
                { value: 'FPS_30', text: '30' },
                { value: 'FPS_60', text: '60' }
            ],
            default: 'FPS_60'
        };
        const { row: frameRateRow, select: frameRateSelect } = createRow(
            frameRateData.label,
            frameRateData.options,
            frameRateData.default
        );

        // Append the rows to the options container.
        optionsContainer.appendChild(resolutionRow);
        optionsContainer.appendChild(frameRateRow);

        // Create the start/stop recording button.
        const button = document.createElement('button');
        button.textContent = 'Record';
        button.style.padding = '10px 20px';
        button.style.width = '100%';  // Make button same width as rows
        button.style.fontSize = 'inherit';

        // Store the button reference on the instance for later access.
        this.recordButton = button;

        button.addEventListener('click', () => {
            const videoRecorder = this.entity.script.videoRecorder;
            if (videoRecorder.recording) {
                videoRecorder.stop();
                button.textContent = 'Record';
            } else {
                switch (resolutionSelect.value) {
                    case 'HD':
                        videoRecorder.resolution = 1;
                        break;
                    case 'FULLHD':
                        videoRecorder.resolution = 2;
                        break;
                    case 'SD':
                    default:
                        videoRecorder.resolution = 0;
                        break;
                }

                switch (frameRateSelect.value) {
                    case 'FPS_60':
                        videoRecorder.frameRate = 60;
                        break;
                    case 'FPS_30':
                    default:
                        videoRecorder.frameRate = 30;
                        break;
                }

                videoRecorder.record();
                button.textContent = 'Stop';
            }
        });

        // Create a simple progress indicator (could be a div styled as a progress bar)
        this.progressBar = document.createElement('div');
        this.progressBar.style.height = '10px';
        this.progressBar.style.background = '#ccc';
        this.progressBar.style.width = '0%';
        this.progressBar.style.transition = 'width 0.2s';
        container.appendChild(this.progressBar);

        container.appendChild(optionsContainer);
        container.appendChild(button);
        document.body.appendChild(container);
    }

    onEncodeBegin() {
        // Show the progress bar and disable the Record/Stop button once encoding begins.
        this.progressBar.style.display = 'block';
        this.recordButton.disabled = true;
    }

    onEncodeProgress(progress) {
        // progress is a value between 0 and 1
        // Update our progress bar width accordingly.
        const percent = Math.min(Math.max(progress * 100, 0), 100);
        this.progressBar.style.width = `${percent}%`;
    }

    onEncodeEnd(buffer) {
        // Hide the progress bar and re-enable the Record/Stop button once encoding is complete.
        this.progressBar.style.display = 'none';
        this.recordButton.disabled = false;

        // Download the recorded video.
        const blob = new Blob([buffer], { type: 'video/mp4' });
        this.downloadBlob(blob);
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
