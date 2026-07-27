import { whenReady } from '@playcanvas/web-components';
import { MiniStats, XRTYPE_AR, XRTYPE_VR } from 'playcanvas';

const { app } = await whenReady('pc-app');

// Add MiniStats if the query parameter is present
if (new URLSearchParams(window.location.search).has('ministats')) {
    // eslint-disable-next-line no-new
    new MiniStats(app);
}

function createButton({ iconClass, title, onClick }) {
    const button = document.createElement('button');
    button.classList.add('example-button', 'icon', iconClass);
    button.title = title;
    button.onclick = onClick;
    return button;
}

function setVisible(button, visible) {
    button.style.display = visible ? 'flex' : 'none';
}

// Create container for buttons
const container = document.createElement('div');
container.classList.add('example-button-container', 'bottom-right');

// Add AR/VR buttons if the app supports XR and the example uses XR scripts
const xrScriptSelector = 'pc-script[name="xrSession"], pc-script[name="xrControllers"], pc-script[name="xrNavigation"]';
if (app.xr && document.querySelector(xrScriptSelector)) {
    const xrModes = [
        { type: XRTYPE_AR, iconClass: 'icon-ar', title: 'Enter AR', event: 'ar:start' },
        { type: XRTYPE_VR, iconClass: 'icon-vr', title: 'Enter VR', event: 'vr:start' }
    ];

    const xrButtons = new Map();
    for (const { type, iconClass, title, event } of xrModes) {
        const button = createButton({ iconClass, title, onClick: () => app.fire(event) });
        setVisible(button, app.xr.isAvailable(type));
        container.appendChild(button);
        xrButtons.set(type, button);
    }

    app.xr.on('available', (type, available) => {
        const button = xrButtons.get(type);
        if (button) setVisible(button, available);
    });
}

// Add fullscreen button if supported
if (document.documentElement.requestFullscreen && document.exitFullscreen) {
    const fullscreenButton = createButton({
        iconClass: 'icon-fs-enter',
        title: 'Enter Fullscreen',
        onClick: () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        }
    });

    // Update icon and tooltip when fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
        const fullscreen = !!document.fullscreenElement;
        fullscreenButton.classList.toggle('icon-fs-enter', !fullscreen);
        fullscreenButton.classList.toggle('icon-fs-exit', fullscreen);
        fullscreenButton.title = fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen';
    });

    container.appendChild(fullscreenButton);
}

// Add view-source button linking to this page's source on GitHub
const filename = window.location.pathname.split('/').pop();
container.appendChild(createButton({
    iconClass: 'icon-source',
    title: 'View Source',
    onClick: () => window.open(`https://github.com/playcanvas/web-components/tree/main/examples/${filename}`, '_blank', 'noopener')
}));

document.body.appendChild(container);
