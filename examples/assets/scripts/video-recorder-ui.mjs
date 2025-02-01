import { Script } from 'playcanvas';

export class VideoRecorderUI extends Script {
    initialize() {
        this.createUI();
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
            label.style.width = '100px';  // Fixed width for alignment
            label.style.color = '#fff';   // Very light grey

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

        container.appendChild(optionsContainer);
        container.appendChild(button);
        document.body.appendChild(container);
    }
}
