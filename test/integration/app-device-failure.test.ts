import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * What <pc-app> does when no graphics device can be created. jsdom's getContext() returns null
 * (pinned in test/setup/dom.ts), which is the same observable condition as a browser with WebGL
 * disabled or blocklisted - so backend="webgl2" here boots straight into total device failure.
 */
describe('<pc-app> graphics device failure', () => {
    const { errors, uncaught } = useGuard();

    const nextError = (element: AppElement) =>
        new Promise<ErrorEvent>((resolve) => {
            element.addEventListener('error', resolve as EventListener, { once: true });
        });

    it('fires error and never becomes ready when no device can be created', async () => {
        const handle = mount('<pc-app backend="webgl2"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        const event = await nextError(appElement);

        expect(event.message).toContain('pc-app failed to create a graphics device (webgl2)');
        expect(event.error).toBeInstanceOf(Error);
        expect(appElement.app).toBeNull();
        await expectNeverReady(appElement);

        // The failure must arrive on the channels above, not as an unhandled rejection escaping
        // the async connectedCallback (the guard also fails the test on any left unclaimed).
        expect(uncaught.seen).toEqual([]);
        errors.expect('pc-app failed to create a graphics device (webgl2)');
    });

    it('names every requested backend when the default webgpu request fails', async () => {
        // jsdom has no navigator.gpu, so the engine only ever attempts webgl2 - but the element
        // requested the webgpu-with-fallback pair, and the message reports what was requested.
        const handle = mount('<pc-app></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        const event = await nextError(appElement);

        expect(event.message).toContain('(webgpu, webgl2)');
        errors.expect('pc-app failed to create a graphics device (webgpu, webgl2)');
    });

    it('leaves the element empty - no dead canvas, no stuck loading bar', async () => {
        const handle = mount('<pc-app backend="webgl2"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        await nextError(appElement);

        expect(appElement.querySelector('canvas')).toBeNull();
        expect(appElement.firstElementChild).toBeNull();
        errors.expect('pc-app failed to create a graphics device (webgl2)');
    });

    it('boots normally when re-inserted with a working backend', async () => {
        const handle = mount('<pc-app backend="webgl2"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');
        await nextError(appElement);

        // Remove-and-reinsert is the documented recovery path: teardown unlocks the boot-time
        // options, so the new backend is read when the element reconnects.
        appElement.remove();
        appElement.setAttribute('backend', 'null');
        handle.container.appendChild(appElement);

        await readyWithin(appElement);
        expect(appElement.app).not.toBeNull();
        errors.expect('pc-app failed to create a graphics device (webgl2)');
    });
});
