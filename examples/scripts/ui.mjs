import { Vec3 } from 'playcanvas';

document.addEventListener('DOMContentLoaded', async () => {
    const camera = await document.querySelector('pc-camera').ready();

    // Create container for buttons
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'absolute',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        right: 'max(16px, env(safe-area-inset-right))',
        display: 'flex',
        gap: '8px'
    });

    function createButton({ icon, title, onClick }) {
        const button = document.createElement('button');
        button.innerHTML = icon;
        button.title = title;
        
        Object.assign(button.style, {
            display: 'flex',
            position: 'relative',
            width: '40px',
            height: '40px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #ddd',
            borderRadius: '8px',
            cursor: 'pointer',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0',
            margin: '0',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            transition: 'background-color 0.2s',
            color: '#2c3e50'
        });

        const svg = button.querySelector('svg');
        if (svg) {
            svg.style.display = 'block';
            svg.style.margin = 'auto';
        }

        button.onmouseenter = () => button.style.background = 'rgba(255, 255, 255, 1)';
        button.onmouseleave = () => button.style.background = 'rgba(255, 255, 255, 0.9)';
        if (onClick) button.onclick = onClick;

        return button;
    }

    // Add VR button if available
    if (camera.xrAvailable) {
        const app = camera.closest('pc-app').app;
        const entity = camera.closest('pc-entity');

        const vrButton = createButton({
            icon: `<svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M30,34 L26,30 L22,30 L18,34 L14,34 C11.7908610,34 10,32.2091390 10,30 L10,18 C10,15.7908610 11.7908610,14 14,14 L34,14 C36.2091390,14 38,15.7908610 38,18 L38,30 C38,32.2091390 36.2091390,34 34,34 L30,34 Z M44,28 C44,29.1045694 43.1045694,30 42,30 C40.8954306,30 40,29.1045694 40,28 L40,20 C40,18.8954305 40.8954306,18 42,18 C43.1045694,18 44,18.8954305 44,20 L44,28 Z M8,28 C8,29.1045694 7.10456940,30 6,30 C4.89543060,30 4,29.1045694 4,28 L4,20 C4,18.8954305 4.89543060,18 6,18 C7.10456940,18 8,18.8954305 8,20 L8,28 Z" fill="currentColor">
            </svg>`,
            title: 'Enter VR',
            onClick: () => camera.startXr('immersive-vr', 'local-floor')
        });
        container.appendChild(vrButton);

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                camera.endXr();
            }
        });

        let pos, rot;
        app.xr.on('start', () => {
            pos = entity.position.clone();
            rot = entity.rotation.clone();
            if (entity.entity.script.cameraControls) {
                entity.entity.script.cameraControls.enabled = false;
                entity.position = new Vec3(0, 0, 0);
                entity.rotation = new Vec3(0, 0, 0);
            }
        });
        app.xr.on('end', () => {
            entity.position = pos;
            entity.rotation = rot;
            if (entity.entity.script.cameraControls) {
                entity.entity.script.cameraControls.enabled = true;
            }
        });
    }

    // Add fullscreen button if supported
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
        const enterFullscreenIcon = `<svg width="32" height="32" viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/>
        </svg>`;
        const exitFullscreenIcon = `<svg width="32" height="32" viewBox="0 0 24 24">
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="currentColor"/>
        </svg>`;

        const fullscreenButton = createButton({
            icon: enterFullscreenIcon,
            title: 'Toggle Fullscreen',
            onClick: () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            }
        });

        // Update icon when fullscreen state changes
        document.addEventListener('fullscreenchange', () => {
            fullscreenButton.innerHTML = document.fullscreenElement ? exitFullscreenIcon : enterFullscreenIcon;
            fullscreenButton.title = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
        });

        container.appendChild(fullscreenButton);
    }

    // Add source button
    const filename = window.location.pathname.split('/').pop();
    const sourceButton = createButton({
        icon: `<svg width="24" height="24" viewBox="0 0 98 96">
            <path fill="currentColor" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
        </svg>`,
        title: 'View Source',
        onClick: () => window.open(`https://github.com/playcanvas/web-components/tree/main/examples/${filename}`, '_blank')
    });
    container.appendChild(sourceButton);

    document.body.appendChild(container);
});
