import { MiniStats, XRTYPE_AR, XRTYPE_VR } from 'playcanvas';

import { whenReady } from '@playcanvas/web-components';

const { app } = await whenReady('pc-app');

// Add MiniStats if the query parameter is present
if (new URLSearchParams(window.location.search).has('ministats')) {
    new MiniStats(app);
}

// The site's own controls - fullscreen, the page's source, StackBlitz - live in the examples
// browser's title bar, so nothing of the site's sits over an example: its view and its panels are
// its own. What a page does keep is its way into AR or VR, since it can be opened on its own, as
// the browser's QR code opens it on a phone.
const xrScriptSelector = 'pc-script-instance[name="xrSession"], pc-script-instance[name="xrControllers"], pc-script-instance[name="xrNavigation"]';
const usesXr = !!app.xr && !!document.querySelector(xrScriptSelector);

const xrModes = [
    { name: 'AR', type: XRTYPE_AR, event: 'ar:start' },
    { name: 'VR', type: XRTYPE_VR, event: 'vr:start' }
];

// The examples browser's frame, when the page is showing in it. frameElement is null at the top
// level and in a cross-origin frame, so an embed anywhere else - the User Manual's - is never
// mistaken for it.
const browserFrame = window.frameElement?.id === 'example-frame' ? window.frameElement : null;

if (usesXr && browserFrame) {
    // The title bar offers them. It reads what the device can enter off this object, whenever
    // the frame hears that has changed.
    window.exampleXr = {
        get available() {
            return xrModes.filter(({ type }) => app.xr.isAvailable(type)).map(({ name }) => name);
        },
        enter(name) {
            const mode = xrModes.find((m) => m.name === name);
            if (mode) {
                app.fire(mode.event);
            }
        }
    };

    const announce = () => browserFrame.dispatchEvent(new Event('examplexr'));
    app.xr.on('available', announce);
    announce();
} else if (usesXr) {
    // Anywhere else the page offers them itself, bottom-right
    const setVisible = (button, visible) => {
        button.style.display = visible ? 'flex' : 'none';
    };

    const container = document.createElement('div');
    container.classList.add('example-button-container', 'bottom-right');

    const buttons = new Map();
    for (const { name, type, event } of xrModes) {
        const button = document.createElement('button');
        button.classList.add('example-button', 'icon', `icon-${name.toLowerCase()}`);
        button.title = `Enter ${name}`;
        button.onclick = () => app.fire(event);
        setVisible(button, app.xr.isAvailable(type));
        container.appendChild(button);
        buttons.set(type, button);
    }

    app.xr.on('available', (type, available) => {
        const button = buttons.get(type);
        if (button) {
            setVisible(button, available);
        }
    });

    document.body.appendChild(container);

    // On a narrow screen, css/example.css docks a page's own control panel along the bottom edge
    // and lifts the buttons on top of it, by the height published here
    const panel = document.querySelector('body > .example-panel');
    if (panel) {
        const publishHeight = () => {
            container.style.setProperty('--example-panel-height', `${panel.offsetHeight}px`);
        };
        publishHeight();
        new ResizeObserver(publishHeight).observe(panel);
    }
}
