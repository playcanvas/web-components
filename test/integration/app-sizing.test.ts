import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';

/**
 * The element's sizing contract: pc-app is a replaced-element-style block box that the page's
 * CSS controls, with the canvas filling it and the drawing buffer following the canvas's client
 * size. jsdom has no layout engine, so the client size is pinned at 800x600 by test/setup/dom.ts.
 */
describe('<pc-app> sizing', () => {
    useGuard();

    it('installs the zero-specificity base styles exactly once', async () => {
        const handle = mount('<pc-app backend="null"></pc-app><pc-app backend="null"></pc-app>');
        await settle(handle.container);

        const sheets = document.querySelectorAll('#pc-app-styles');
        expect(sheets).toHaveLength(1);

        // :where() is what keeps any page rule able to override these defaults
        const css = sheets[0].textContent!;
        expect(css).toContain(':where(pc-app)');
        expect(css).toContain('display: block');
        expect(css).toContain('position: relative');
    });

    it('fills the element with a block canvas that keeps touch input', async () => {
        const { appElement } = await bootApp();
        const canvas = appElement.querySelector('canvas')!;

        expect(canvas.style.display).toBe('block');
        expect(canvas.style.width).toBe('100%');
        expect(canvas.style.height).toBe('100%');
        expect(canvas.style.touchAction).toBe('none');
    });

    it('sizes the drawing buffer from the canvas client size, not the window', async () => {
        const { app } = await bootApp();

        // 800x600 is the stubbed client size; jsdom's window is 1024x768, which must not leak in
        expect(app.graphicsDevice.width).toBe(800);
        expect(app.graphicsDevice.height).toBe(600);
    });

    it('keeps the picker aligned with the drawing buffer when the resolution changes', async () => {
        vi.stubGlobal('devicePixelRatio', 2);

        const { appElement } = await bootApp('', { appAttributes: 'max-pixel-ratio="1"' });
        const picker = (appElement as unknown as { _pointer: { _picker: { width: number; height: number } } })
            ._pointer._picker;
        expect(picker.width).toBe(800);
        expect(picker.height).toBe(600);

        appElement.setAttribute('max-pixel-ratio', '2');

        // The buffer doubled, and the picker must double with it or picks land at stale
        // coordinates
        expect(picker.width).toBe(1600);
        expect(picker.height).toBe(1200);
    });

    it('anchors the loading bar to the element, not the window', () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        const bar = handle.get<AppElement>('pc-app').querySelector<HTMLElement>('[role="progressbar"]');

        expect(bar).not.toBeNull();
        expect(bar!.style.position).toBe('absolute');
    });
});
