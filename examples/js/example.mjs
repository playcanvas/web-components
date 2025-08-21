import { MiniStats } from 'playcanvas';

document.addEventListener('DOMContentLoaded', async () => {
    const appElement = await document.querySelector('pc-app').ready();
    const app = appElement.app;

    // Add MiniStats if query parameter is present
    if (new URLSearchParams(window.location.search).has('ministats')) {
        /* eslint-disable-next-line no-unused-vars */
        const stats = new MiniStats(app);
    }

    // Check if this example supports XR
    function isXRCapable() {
        // Check for XR-related scripts
        const xrScripts = document.querySelectorAll('pc-script[name="xrSession"], pc-script[name="xrControllers"], pc-script[name="xrNavigation"]');
        return xrScripts.length > 0;
    }

    // Create container for buttons
    const container = document.createElement('div');
    container.classList.add('example-button-container', 'bottom-right');

    function createButton({ iconClass, title, onClick }) {
        const button = document.createElement('button');
        if (iconClass) button.classList.add(iconClass);
        button.title = title;
        button.classList.add('example-button', 'icon');

        if (onClick) {
            button.onclick = onClick;
        }

        return button;
    }

    // Only create AR/VR buttons for XR-capable examples
    if (isXRCapable()) {
        const arButton = createButton({
            iconClass: 'icon-ar',
            title: 'Enter AR',
            onClick: () => app.fire('xr:start', 'immersive-ar', 'local-floor')
        });
        arButton.style.display = app.xr?.isAvailable('immersive-ar') ? 'flex' : 'none';
        container.appendChild(arButton);

        const vrButton = createButton({
            iconClass: 'icon-vr',
            title: 'Enter VR',
            onClick: () => app.fire('xr:start', 'immersive-vr', 'local-floor')
        });
        vrButton.style.display = app.xr?.isAvailable('immersive-vr') ? 'flex' : 'none';
        container.appendChild(vrButton);

        app.xr?.on('available:immersive-ar', (available) => {
            arButton.style.display = available ? 'flex' : 'none';
        });

        app.xr?.on('available:immersive-vr', (available) => {
            vrButton.style.display = available ? 'flex' : 'none';
        });
    }

    // Add fullscreen button if supported
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
        const fullscreenButton = createButton({
            iconClass: 'icon-fs-enter',
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
            fullscreenButton.classList.toggle('icon-fs-enter', !document.fullscreenElement);
            fullscreenButton.classList.toggle('icon-fs-exit', !!document.fullscreenElement);
            fullscreenButton.title = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
        });

        container.appendChild(fullscreenButton);
    }

    // Add source button
    const filename = window.location.pathname.split('/').pop();
    const sourceButton = createButton({
        iconClass: 'icon-source',
        title: 'View Source',
        onClick: () => window.open(`https://github.com/playcanvas/web-components/tree/main/examples/${filename}`, '_blank')
    });
    container.appendChild(sourceButton);

    document.body.appendChild(container);
});
