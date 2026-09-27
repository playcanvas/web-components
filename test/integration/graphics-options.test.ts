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

type FakeMediaQuery = { media: string; listeners: Set<() => void> };

/**
 * Stands in for the display the window is on: stubs window.devicePixelRatio, and the matchMedia
 * that jsdom lacks, with queries that report a change once the ratio no longer matches them.
 *
 * @param ratio - The display's initial pixel ratio.
 * @returns The display, to move the window to another one.
 */
const stubDisplay = (ratio: number) => {
    const queries: FakeMediaQuery[] = [];
    vi.stubGlobal('devicePixelRatio', ratio);
    vi.stubGlobal('matchMedia', (media: string) => {
        const query: FakeMediaQuery = { media, listeners: new Set() };
        queries.push(query);
        return {
            media,
            addEventListener: (_type: string, listener: () => void) => query.listeners.add(listener),
            removeEventListener: (_type: string, listener: () => void) => query.listeners.delete(listener)
        };
    });

    return {
        /** The media queries still listened to. */
        get watched() {
            return queries.filter((query) => query.listeners.size > 0).map((query) => query.media);
        },

        /**
         * Moves the window to a display of another pixel ratio, which resizes nothing.
         *
         * @param next - The new display's pixel ratio.
         */
        moveTo(next: number) {
            vi.stubGlobal('devicePixelRatio', next);
            queries
                .filter((query) => query.media !== `(resolution: ${next}dppx)`)
                .forEach((query) => Array.from(query.listeners).forEach((listener) => listener()));
        }
    };
};

describe('<pc-app> graphics options', () => {
    const { warnings } = useGuard();

    it('renders at the display density when no cap is set', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { app } = await bootApp();

        // 800x600 is test/setup/dom.ts's DEFAULT_VIEWPORT, at the full ratio of 2. The device holds
        // that ratio rather than the uncapped Infinity: the engine reads it back as the ratio in
        // effect when it maps UI drags, where Infinity turns every position into NaN.
        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
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

        // A cap above the display's own ratio is not an upscale - the minimum is taken.
        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
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

    it('follows the display when the window moves to one of another density', async () => {
        const display = stubDisplay(1);

        const { app } = await bootApp();
        expect(app.graphicsDevice.maxPixelRatio).toBe(1);
        expect(app.graphicsDevice.width).toBe(800);

        display.moveTo(2);

        // Nothing resized the element - only the query on the old ratio stopped matching - and the
        // one on the new ratio takes over from it.
        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
        expect(display.watched).toEqual(['(resolution: 2dppx)']);
    });

    it('keeps a pixel ratio assigned to the graphics device directly', async () => {
        const display = stubDisplay(2);

        const { app } = await bootApp();

        // As engine code managing render quality does, going around max-pixel-ratio
        app.graphicsDevice.maxPixelRatio = 1;
        display.moveTo(1.5);

        // The buffer still follows the display, under the assigned ratio rather than the cap
        expect(app.graphicsDevice.maxPixelRatio).toBe(1);
        expect(app.graphicsDevice.width).toBe(800);
        expect(display.watched).toEqual(['(resolution: 1.5dppx)']);
    });

    it('keeps an assigned pixel ratio that equals the one in effect', async () => {
        const display = stubDisplay(1);

        const { app } = await bootApp();

        // A light quality setting on a 1x display assigns the ratio the device already holds
        app.graphicsDevice.maxPixelRatio = 1;
        display.moveTo(2);

        expect(app.graphicsDevice.maxPixelRatio).toBe(1);
        expect(app.graphicsDevice.width).toBe(800);
        expect(app.graphicsDevice.height).toBe(600);
    });

    it('keeps an assigned cap that equals the display density', async () => {
        const display = stubDisplay(2);

        const { app } = await bootApp();

        // Math.min(devicePixelRatio, 2) on a 2x display, which still caps a denser one
        app.graphicsDevice.maxPixelRatio = 2;
        display.moveTo(3);

        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
    });

    it('follows the display again once max-pixel-ratio is written', async () => {
        const display = stubDisplay(1);

        const { appElement, app } = await bootApp();
        app.graphicsDevice.maxPixelRatio = 1;

        // The element's own cap takes the device back from the assignment
        appElement.setAttribute('max-pixel-ratio', '4');
        display.moveTo(2);

        expect(app.graphicsDevice.maxPixelRatio).toBe(2);
        expect(app.graphicsDevice.width).toBe(1600);
        expect(app.graphicsDevice.height).toBe(1200);
    });

    it('stops following the display once disconnected', async () => {
        const display = stubDisplay(1);

        const { appElement } = await bootApp();
        expect(display.watched).toEqual(['(resolution: 1dppx)']);

        appElement.remove();

        expect(display.watched).toEqual([]);
    });

    it('warns when a boot-only option is written after boot', async () => {
        const { appElement, app } = await bootApp();

        appElement.setAttribute('antialias', 'false');

        // The property does change - it is only the device that cannot - so the warning is the sole
        // signal that the write achieved nothing.
        expect(appElement.antialias).toBe(false);
        expect(app.graphicsDevice.isNull).toBe(true);
        warnings.expect("Attribute 'antialias' on <pc-app> is only read when the application boots");
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

        warnings.expect(
            /^Attribute '(alpha|antialias|backend|depth-buffer|stencil-buffer)' on <pc-app> is only read/,
            5
        );
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
