import { MiniStats, XRTYPE_AR, XRTYPE_VR } from 'playcanvas';

import { whenReady } from '@playcanvas/web-components';

import { openInStackBlitz } from './stackblitz.mjs';

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
const xrScriptSelector = 'pc-script-instance[name="xrSession"], pc-script-instance[name="xrControllers"], pc-script-instance[name="xrNavigation"]';
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

// Add a button that opens the example as an editable npm-based StackBlitz project
container.appendChild(
    createButton({
        iconClass: 'icon-stackblitz',
        title: 'Edit on StackBlitz',
        onClick: () => openInStackBlitz()
    })
);

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

// Faded, the buttons stay hit-testable, so a press aimed at one lands on it rather than falling
// through to the page beneath - and on touch, where no pointermove precedes the tap, that press
// is also what reveals them. It is spent on the reveal: a button the user could not see must not
// act, so the click it produces is stopped before reaching the button. Every press re-decides
// this, so a press that finds the buttons already revealed leaves nothing to stop.
let pressSpent = false;

function onPress() {
    pressSpent = container.classList.contains('faded');
    onActivity();
}

// Keyboard activity reveals the buttons too, and a keyboard activation produces a click with no
// press behind it, so nothing is left to spend.
function onKeyDown() {
    pressSpent = false;
    onActivity();
}

container.addEventListener(
    'click',
    (event) => {
        if (pressSpent) {
            pressSpent = false;
            event.stopPropagation();
        }
    },
    { capture: true }
);

// Pointer events cover touch, so touchstart is the press signal only where they are absent: a
// browser firing both would run onPress twice for one press, the second time after the reveal
// had already cleared the faded class.
window.addEventListener(window.PointerEvent ? 'pointerdown' : 'touchstart', onPress, {
    capture: true,
    passive: true
});
window.addEventListener('pointermove', onActivity, { passive: true });
window.addEventListener('keydown', onKeyDown, { passive: true });
onActivity();
