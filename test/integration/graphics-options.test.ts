import { describe, expect, it, vi } from 'vitest';

import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * What <pc-app>'s graphics options do to a real graphics device.
 *
 * The pixel-ratio cases stub window.devicePixelRatio to 2 to stand in for a dense display -
 * test/setup/dom.ts declares it writable for exactly this - and read the resulting canvas size back
 * off the device. jsdom's own value is 1, so without the stub every cap would be indistinguishable
 * from every other.
 */
describe('<pc-app> graphics options', () => {
    const { warnings } = useGuard();

    it('renders at the display density when no cap is set', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { app } = await bootApp();

        // 800x600 is test/setup/dom.ts's DEFAULT_VIEWPORT, at the full ratio of 2.
        expect(app.graphicsDevice.maxPixelRatio).toBe(Infinity);
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
    });

    it('caps the render resolution at max-pixel-ratio', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { app } = await bootApp('', { appAttributes: 'max-pixel-ratio="1"' });

        // The cap, not the display, decides: CSS resolution on a 2x display.
        expect(app.graphicsDevice.width).toBe(800);
        expect(app.graphicsDevice.height).toBe(600);
    });

    it('takes the smaller of the cap and the display density', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { app } = await bootApp('', { appAttributes: 'max-pixel-ratio="4"' });

        // A cap above the display's own ratio is not an upscale - the engine takes the minimum.
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
    });

    it('applies a max-pixel-ratio change after boot', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { appElement, app } = await bootApp('', { appAttributes: 'max-pixel-ratio="1"' });
        expect(app.graphicsDevice.width).toBe(800);

        appElement.setAttribute('max-pixel-ratio', '2');

        // Raising the cap resizes there and then, rather than waiting for the next window resize.
        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
    });

    it('warns when a boot-only option is written after boot', async () => {
        const { appElement, app } = await bootApp();

        appElement.setAttribute('antialias', 'false');

        // The property does change - it is only the device that cannot - so the warning is the sole
        // signal that the write achieved nothing.
        expect(appElement.antialias).toBe(false);
        expect(app.graphicsDevice.isNull).toBe(true);
        warnings.expect('Attribute \'antialias\' on <pc-app> is only read when the application boots');
    });

    it('warns once per late write, for every boot-only option', async () => {
        const { appElement } = await bootApp();

        appElement.setAttribute('alpha', 'false');
        appElement.setAttribute('backend', 'webgl2');
        appElement.setAttribute('depth-buffer', 'false');
        appElement.setAttribute('stencil-buffer', 'false');

        // Written through the property rather than the attribute, so the guard covers the JS path
        // too: the setter is where the check lives precisely so both reach it.
        appElement.antialias = false;

        warnings.expect(/^Attribute '(alpha|antialias|backend|depth-buffer|stencil-buffer)' on <pc-app> is only read/, 5);
    });

    it('reboots from its current attributes when reconnected', async () => {
        const { appElement, container } = await bootApp();

        appElement.remove();

        // Disconnecting releases the options, so the same write that warned above is now the
        // supported way to change one.
        appElement.setAttribute('antialias', 'false');
        expect(warnings.seen).toEqual([]);

        // Awaited through the event rather than ready(), which latches: the promise resolved on the
        // first boot and stays resolved, so awaiting it here would return before the second boot had
        // created anything.
        const rebooted = new Promise<void>((resolve) => {
            appElement.addEventListener('ready', () => resolve(), { once: true });
        });
        container.appendChild(appElement);
        await rebooted;

        expect(appElement.antialias).toBe(false);
        expect(appElement.app?.graphicsDevice.isNull).toBe(true);
    });
});
