import { describe, expect, it } from 'vitest';

import { useGuard } from '../helpers/guard';

/**
 * The graphics options on an unconnected <pc-app>. No engine boots in this tier, so these cover
 * attributeChangedCallback and the accessors only - what the options do to a real graphics device
 * is covered by test/integration/graphics-options.test.ts.
 */
describe('<pc-app> graphics attributes', () => {
    const { warnings } = useGuard();

    it('names the frame buffer options after the buffer each one allocates', () => {
        const element = document.createElement('pc-app');

        // The pairing with pc-camera's clear-depth-buffer / clear-stencil-buffer is what these
        // names exist for, and is pinned in utils/cem/validate.mjs.
        expect(element.depthBuffer).toBe(true);
        expect(element.stencilBuffer).toBe(true);

        element.setAttribute('depth-buffer', 'false');
        element.setAttribute('stencil-buffer', 'false');
        expect(element.depthBuffer).toBe(false);
        expect(element.stencilBuffer).toBe(false);

        element.removeAttribute('depth-buffer');
        element.removeAttribute('stencil-buffer');
        expect(element.depthBuffer).toBe(true);
        expect(element.stencilBuffer).toBe(true);
    });

    it('defaults max-pixel-ratio to uncapped', () => {
        const element = document.createElement('pc-app');

        // Infinity rather than window.devicePixelRatio: the cap is compared against the live ratio
        // on every resize, so not capping at all is what keeps a window that moves between displays
        // of differing density rendering at the density it is actually on.
        expect(element.maxPixelRatio).toBe(Infinity);

        element.setAttribute('max-pixel-ratio', '2');
        expect(element.maxPixelRatio).toBe(2);

        element.removeAttribute('max-pixel-ratio');
        expect(element.maxPixelRatio).toBe(Infinity);
    });

    it('warns and stays uncapped on a malformed max-pixel-ratio', () => {
        const element = document.createElement('pc-app');

        element.setAttribute('max-pixel-ratio', 'high');
        expect(element.maxPixelRatio).toBe(Infinity);
        warnings.expect(
            "Invalid value 'high' for attribute 'max-pixel-ratio'. Expected a finite number. Using 'Infinity'."
        );
    });

    it('does not warn about the boot-only options before the element connects', () => {
        const element = document.createElement('pc-app');

        // Every one of these is read once, inside connectedCallback. Writing them beforehand is the
        // only way they ever take effect, so it must stay silent - the warning is for writes that
        // arrive too late, and this is the path that proves it is not merely always-on.
        element.setAttribute('alpha', 'false');
        element.setAttribute('antialias', 'false');
        element.setAttribute('backend', 'webgl2');
        element.setAttribute('depth-buffer', 'false');
        element.setAttribute('stencil-buffer', 'false');

        expect(warnings.seen).toEqual([]);
    });
});
