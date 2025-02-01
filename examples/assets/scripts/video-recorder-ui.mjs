import { Script } from 'playcanvas';

export class VideoRecorderUI extends Script {
    initialize() {
        this.createUI();
    }

    createUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.left = '20px';
        container.style.zIndex = '1000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.alignItems = 'flex-start';

        // Create options container to hold resolution and framerate selectors.
        // Stacking them vertically.
        const optionsContainer = document.createElement('div');
        optionsContainer.style.display = 'flex';
        optionsContainer.style.flexDirection = 'column';
        optionsContainer.style.gap = '10px';
        optionsContainer.style.alignItems = 'flex-start';

        // Resolution select control with label to the left.
        const resolutionContainer = document.createElement('div');
        resolutionContainer.style.display = 'flex';
        resolutionContainer.style.flexDirection = 'row';
        resolutionContainer.style.alignItems = 'center';
        resolutionContainer.style.gap = '10px';
        
        const resolutionLabel = document.createElement('label');
        resolutionLabel.textContent = 'Resolution: ';
        const resolutionSelect = document.createElement('select');
        const resolutionOptions = [
            { value: 'SD', text: '480p' },
            { value: 'HD', text: '720p' },
            { value: 'FULLHD', text: '1080p' }
        ];
        resolutionOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            resolutionSelect.appendChild(option);
        });
        resolutionSelect.value = 'FULLHD';

        resolutionContainer.appendChild(resolutionLabel);
        resolutionContainer.appendChild(resolutionSelect);

        // Framerate select control with label to the left.
        const frameRateContainer = document.createElement('div');
        frameRateContainer.style.display = 'flex';
        frameRateContainer.style.flexDirection = 'row';
        frameRateContainer.style.alignItems = 'center';
        frameRateContainer.style.gap = '10px';

        const frameRateLabel = document.createElement('label');
        frameRateLabel.textContent = 'Frame Rate: ';
        const frameRateSelect = document.createElement('select');
        const frameRateOptions = [
            { value: 'FPS_30', text: '30 FPS' },
            { value: 'FPS_60', text: '60 FPS' }
        ];
        frameRateOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            frameRateSelect.appendChild(option);
        });
        frameRateSelect.value = 'FPS_60';

        frameRateContainer.appendChild(frameRateLabel);
        frameRateContainer.appendChild(frameRateSelect);

        // Append resolution and framerate controls in vertical order.
        optionsContainer.appendChild(resolutionContainer);
        optionsContainer.appendChild(frameRateContainer);

        // Create the start/stop recording button.
        const button = document.createElement('button');
        button.textContent = 'Start Recording';
        button.style.padding = '10px 20px';

        button.addEventListener('click', () => {
            const videoRecorder = this.entity.script.videoRecorder;
            if (videoRecorder.recording) {
                videoRecorder.stop();
                button.textContent = 'Start Recording';
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
                button.textContent = 'Stop Recording';
            }
        });

        container.appendChild(optionsContainer);
        container.appendChild(button);
        document.body.appendChild(container);
    }
}
