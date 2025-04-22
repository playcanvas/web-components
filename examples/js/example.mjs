import { Color, MiniStats, Quat, Vec3 } from 'playcanvas';

// Icon constants from https://fonts.google.com/icons
const AR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M440-181 240-296q-19-11-29.5-29T200-365v-230q0-22 10.5-40t29.5-29l200-115q19-11 40-11t40 11l200 115q19 11 29.5 29t10.5 40v230q0 22-10.5 40T720-296L520-181q-19 11-40 11t-40-11Zm0-92v-184l-160-93v185l160 92Zm80 0 160-92v-185l-160 93v184ZM80-680v-120q0-33 23.5-56.5T160-880h120v80H160v120H80ZM280-80H160q-33 0-56.5-23.5T80-160v-120h80v120h120v80Zm400 0v-80h120v-120h80v120q0 33-23.5 56.5T800-80H680Zm120-600v-120H680v-80h120q33 0 56.5 23.5T880-800v120h-80ZM480-526l158-93-158-91-158 91 158 93Zm0 45Zm0-45Zm40 69Zm-80 0Z"/></svg>';
const VR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M300-240q-66 0-113-47t-47-113v-163q0-51 32-89.5t82-47.5q57-11 113-15.5t113-4.5q57 0 113.5 4.5T706-700q50 10 82 48t32 89v163q0 66-47 113t-113 47h-40q-13 0-26-1.5t-25-6.5l-64-22q-12-5-25-5t-25 5l-64 22q-12 5-25 6.5t-26 1.5h-40Zm0-80h40q7 0 13.5-1t12.5-3q29-9 56.5-19t57.5-10q30 0 58 9.5t56 19.5q6 2 12.5 3t13.5 1h40q33 0 56.5-23.5T740-400v-163q0-22-14-38t-35-21q-52-11-104.5-14.5T480-640q-54 0-106 4t-105 14q-21 4-35 20.5T220-563v163q0 33 23.5 56.5T300-320ZM40-400v-160h60v160H40Zm820 0v-160h60v160h-60Zm-380-80Z"/></svg>';
const ENTER_FULLSCREEN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>';
const EXIT_FULLSCREEN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z"/></svg>';
const SOURCE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg>';

document.addEventListener('DOMContentLoaded', async () => {
    const appElement = await document.querySelector('pc-app').ready();
    const app = appElement.app;

    // Add MiniStats if query parameter is present
    if (new URLSearchParams(window.location.search).has('ministats')) {
        /* eslint-disable-next-line no-unused-vars */
        const stats = new MiniStats(app);
    }

    // Create container for buttons
    const container = document.createElement('div');
    container.classList.add('example-button-container', 'bottom-right');

    function createButton({ icon, title, onClick }) {
        const button = document.createElement('button');
        button.innerHTML = icon;
        button.title = title;
        button.classList.add('example-button', 'icon');

        if (onClick) {
            button.onclick = onClick;
        }

        return button;
    }

    /** @type {import('../../dist/pwc.mjs').CameraComponentElement} */
    const cameraElement = await document.querySelector('pc-camera').ready();
    const clearColor = new Color();
    let originalSkyType = null;

    function disableSky() {
        const sky = document.querySelector('pc-sky');
        if (!sky) return;

        // Save the original sky type (if any) if it hasn't been recorded yet.
        if (originalSkyType === null) {
            originalSkyType = sky.getAttribute('type'); // May be null if not set.
        }
        // Hide the sky by setting its type to "none".
        sky.setAttribute('type', 'none');
    }

    function restoreSky() {
        const sky = document.querySelector('pc-sky');
        if (!sky) return;

        // If an original type was recorded, restore it.
        if (originalSkyType !== null) {
            if (originalSkyType) {
                sky.setAttribute('type', originalSkyType);
            } else {
                sky.removeAttribute('type');
            }
            originalSkyType = null;
        }
    }

    const positionRoot = new Vec3();
    const rotationRoot = new Quat();
    const positionCamera = new Vec3();
    const rotationCamera = new Quat();

    const cameraRootEntity = cameraElement.parentElement.parentElement.entity;
    const cameraEntity = cameraElement.parentElement.entity;

    app.xr.on('start', () => {
        // Cache original camera rig positions and rotations
        positionRoot.copy(cameraRootEntity.getPosition());
        rotationRoot.copy(cameraRootEntity.getRotation());
        positionCamera.copy(cameraEntity.getPosition());
        rotationCamera.copy(cameraEntity.getRotation());

        // Set camera to the position of the camera root
        cameraRootEntity.setPosition(positionCamera.x, 0, positionCamera.z);
        cameraRootEntity.setRotation(rotationCamera);

        if (app.xr.type === 'immersive-ar') {
            clearColor.copy(cameraElement.clearColor);
            cameraElement.clearColor = new Color(0, 0, 0, 0);
            disableSky();
        }
    });

    app.xr.on('end', () => {
        // Restore original camera rig positions and rotations
        cameraRootEntity.setPosition(positionRoot);
        cameraRootEntity.setRotation(rotationRoot);
        cameraEntity.setPosition(positionCamera);
        cameraEntity.setRotation(rotationCamera);

        if (app.xr.type === 'immersive-ar') {
            cameraElement.clearColor = clearColor;
            restoreSky();
        }
    });

    const arButton = createButton({
        icon: AR_ICON,
        title: 'Enter AR',
        onClick: () => cameraElement.startXr('immersive-ar', 'local-floor')
    });
    container.appendChild(arButton);

    const vrButton = createButton({
        icon: VR_ICON,
        title: 'Enter VR',
        onClick: () => cameraElement.startXr('immersive-vr', 'local-floor')
    });
    container.appendChild(vrButton);

    app.xr.on('available:immersive-ar', (available) => {
        arButton.style.display = available ? 'block' : 'none';
    });

    app.xr.on('available:immersive-vr', (available) => {
        vrButton.style.display = available ? 'block' : 'none';
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && app.xr.active) {
            cameraElement.endXr();
        }
    });

    // Add fullscreen button if supported
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
        const fullscreenButton = createButton({
            icon: ENTER_FULLSCREEN_ICON,
            title: 'Enter Fullscreen',
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
            fullscreenButton.innerHTML = document.fullscreenElement ? EXIT_FULLSCREEN_ICON : ENTER_FULLSCREEN_ICON;
            fullscreenButton.title = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
        });

        container.appendChild(fullscreenButton);
    }

    // Add source button
    const filename = window.location.pathname.split('/').pop();
    const sourceButton = createButton({
        icon: SOURCE_ICON,
        title: 'View Source',
        onClick: () => window.open(`https://github.com/playcanvas/web-components/tree/main/examples/${filename}`, '_blank')
    });
    container.appendChild(sourceButton);

    document.body.appendChild(container);
});
