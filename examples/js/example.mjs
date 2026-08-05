import { MiniStats, XRTYPE_AR, XRTYPE_VR } from 'playcanvas';

import { whenReady } from '@playcanvas/web-components';

const { app } = await whenReady('pc-app');

// Add MiniStats if the query parameter is present
if (new URLSearchParams(window.location.search).has('ministats')) {
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
container.appendChild(
    createButton({
        iconClass: 'icon-source',
        title: 'View Source',
        onClick: () =>
            window.open(
                `https://github.com/playcanvas/web-components/tree/main/examples/${filename}`,
                '_blank',
                'noopener'
            )
    })
);

document.body.appendChild(container);

// Fade the buttons out after a few seconds without user input, and bring them back on
// any pointer or keyboard activity
const IDLE_FADE_MS = 3500;
let idleTimeout;

function fadeWhenIdle() {
    // Never fade away under the pointer
    if (container.matches(':hover')) {
        idleTimeout = setTimeout(fadeWhenIdle, IDLE_FADE_MS);
        return;
    }
    container.classList.add('faded');
}

function onActivity() {
    container.classList.remove('faded');
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(fadeWhenIdle, IDLE_FADE_MS);
}

// While faded the buttons are not hit-testable, so a press aimed at them would fall
// through to the page beneath - and on touch there is no pointermove to reveal them
// first. Capture the press, spend it on revealing the buttons, and stop it from
// reaching the page (mouse users are unaffected: pointermove reveals before any click).
function onPress(event) {
    if (container.classList.contains('faded')) {
        event.stopPropagation();
    }
    onActivity();
}

window.addEventListener('pointerdown', onPress, { capture: true, passive: true });
window.addEventListener('touchstart', onPress, { capture: true, passive: true });
for (const event of ['pointermove', 'keydown']) {
    window.addEventListener(event, onActivity, { passive: true });
}
onActivity();
