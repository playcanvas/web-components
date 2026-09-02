import type { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * Pins the headless environment itself.
 *
 * Every other integration test is only as meaningful as these assertions. jsdom reports a
 * clientWidth of 0 for every element, and AppElement feeds that to
 * `setCanvasResolution(RESOLUTION_AUTO)`, so without the canvas layout stubs in test/setup/dom.ts
 * the graphics device comes up 0x0 and every derived aspect ratio and projection matrix is NaN. A
 * test asserting `expect(matrix).toBeDefined()` would then pass on a matrix full of NaN. If this
 * file goes red, treat every other integration result as unreliable until it is green again.
 */
describe('headless environment', () => {
    const { warnings } = useGuard();

    it('boots a real application on the null graphics device with no warnings', async () => {
        const { app } = await bootApp();

        expect(app.graphicsDevice.isNull).toBe(true);
        expect(app.graphicsDevice.deviceType).toBe('null');
        expect(warnings.seen).toEqual([]);
    });

    it('confirms jsdom layout is dead and the canvas stub is what replaces it', () => {
        // A <div> gets no stub, so it reports jsdom's hardcoded 0 - which is exactly what <pc-app>'s
        // internally-created canvas would report without test/setup/dom.ts. Asserting both halves
        // means removing the stub fails here, with a message that explains itself, rather than
        // silently turning every downstream aspect ratio into NaN.
        expect(document.createElement('div').clientWidth).toBe(0);
        expect(document.createElement('canvas').clientWidth).toBe(800);
        expect(document.createElement('canvas').getBoundingClientRect().width).toBe(800);
    });

    it('gives the graphics device the stubbed canvas dimensions rather than 0x0', async () => {
        const { app } = await bootApp();

        // 800x600 is test/setup/dom.ts's DEFAULT_VIEWPORT, multiplied by a maxPixelRatio of 1.
        // Asserting the exact numbers - not merely "greater than zero" - means a regression in
        // either the stub or the pixel-ratio handling is caught here rather than downstream.
        expect(app.graphicsDevice.width).toBe(800);
        expect(app.graphicsDevice.height).toBe(600);
    });

    it('derives a finite camera aspect ratio, proving nothing is poisoned by a 0x0 device', async () => {
        const { app } = await bootApp('<pc-entity name="camera"><pc-camera></pc-camera></pc-entity>');

        // findByName is typed as returning a GraphNode, but every node this library creates for a
        // <pc-entity> is an Entity, which is what carries the component accessors.
        const camera = app.root.findByName('camera') as Entity | null;
        expect(camera).toBeTruthy();
        expect(camera!.camera).toBeTruthy();

        expect(Number.isFinite(app.graphicsDevice.width / app.graphicsDevice.height)).toBe(true);
        expect(Number.isFinite(camera!.camera!.aspectRatio)).toBe(true);
    });

    it('builds the declared entity hierarchy under app.root', async () => {
        const { app } = await bootApp(`
            <pc-entity name="parent">
                <pc-entity name="child"></pc-entity>
            </pc-entity>
        `);

        const parent = app.root.findByName('parent');
        const child = app.root.findByName('child');

        expect(parent).toBeTruthy();
        expect(child).toBeTruthy();
        expect(child!.parent).toBe(parent);
        expect(parent!.parent).toBe(app.root);
    });

    it('mounts and tears down repeatedly without leaking unhandled rejections', async () => {
        // Removing a <pc-app> disconnects it before its children, which is the ordering the
        // library's disconnectedCallback guards exist for. Repeating it in one test is what
        // surfaces an in-flight connectedCallback resuming against a destroyed app: the guard's
        // `uncaught` recorder fails the test if any rejection escapes.
        const cycle = async () => {
            const { unmount } = await bootApp(
                '<pc-entity name="e"><pc-camera></pc-camera><pc-render type="box"></pc-render></pc-entity>'
            );
            unmount();
            // A macrotask turn, so suspended callbacks resume before the next cycle mounts.
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        };

        // Written out rather than looped, so each cycle is a distinct sequential await.
        await cycle();
        await cycle();
        await cycle();

        expect(warnings.seen).toEqual([]);
    });

    it('loads the release build of playcanvas, not the debug build', () => {
        // Because playcanvas is valid ESM in node_modules, Vitest externalizes it and Node resolves
        // it with the node/import conditions, landing on the release build. Inlining it would pick
        // the development condition and give the .dbg build with Debug.assert live - a real
        // behavioral difference decided by externalization heuristics rather than by our config,
        // so a future Vitest upgrade could flip it silently. This pins it.
        const resolve = (import.meta as unknown as { resolve?: (specifier: string) => string }).resolve;
        if (!resolve) {
            return;
        }
        expect(resolve('playcanvas')).not.toContain('.dbg.');
    });
});
