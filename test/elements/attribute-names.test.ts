import { describe, expect, it } from 'vitest';

import { useGuard } from '../helpers/guard';


/**
 * The attributes renamed to say what they control. Element tier, so no engine boots - these cover
 * attributeChangedCallback and the accessors only. That the two new enums reach the right engine
 * constants is covered by test/integration/renamed-attributes.test.ts.
 *
 * Each case asserts removal as well as parsing, because the default is what an author gets by
 * omitting the attribute and is therefore the half a rename is most likely to get wrong.
 */
describe('renamed attributes', () => {
    const { warnings } = useGuard();

    describe('<pc-screen> scale-mode', () => {
        it('replaces the boolean blend attribute with the engine\'s scale mode', () => {
            const element = document.createElement('pc-screen');

            expect(element.scaleMode).toBe('none');

            element.setAttribute('scale-mode', 'blend');
            expect(element.scaleMode).toBe('blend');

            element.removeAttribute('scale-mode');
            expect(element.scaleMode).toBe('none');
        });

        it('warns on an unknown scale mode and keeps the default', () => {
            const element = document.createElement('pc-screen');

            // 'true' is what an author porting `blend` from the old boolean would most plausibly
            // reach for, so it is the value worth pinning as rejected rather than silently accepted.
            element.setAttribute('scale-mode', 'true');
            expect(element.scaleMode).toBe('none');
            warnings.expect('Invalid value \'true\' for attribute \'scale-mode\'. Valid values: none, blend. Using \'none\'.');
        });
    });

    describe('<pc-camera> projection', () => {
        it('replaces the boolean orthographic attribute with the engine\'s projection', () => {
            const element = document.createElement('pc-camera');

            expect(element.projection).toBe('perspective');

            element.setAttribute('projection', 'orthographic');
            expect(element.projection).toBe('orthographic');

            element.removeAttribute('projection');
            expect(element.projection).toBe('perspective');
        });

        it('leaves ortho-height alone, which now mirrors the engine on its own', () => {
            const element = document.createElement('pc-camera');

            expect(element.orthoHeight).toBe(10);

            element.setAttribute('ortho-height', '4');
            expect(element.orthoHeight).toBe(4);
        });

        it('warns on an unknown projection and keeps the default', () => {
            const element = document.createElement('pc-camera');

            element.setAttribute('projection', 'ortho');
            expect(element.projection).toBe('perspective');
            warnings.expect('Invalid value \'ortho\' for attribute \'projection\'. Valid values: perspective, orthographic. Using \'perspective\'.');
        });
    });

    describe('<pc-sky> mip-level', () => {
        it('names the mip level rather than an unqualified level', () => {
            const element = document.createElement('pc-sky');

            expect(element.mipLevel).toBe(0);

            element.setAttribute('mip-level', '3');
            expect(element.mipLevel).toBe(3);

            element.removeAttribute('mip-level');
            expect(element.mipLevel).toBe(0);
        });
    });

    it('no longer answers to the old names', () => {
        // A stale attribute is inert rather than an error: observedAttributes never sees it, so
        // nothing warns. That silence is why the rename needs the docs note - and why this asserts
        // the property is untouched rather than merely that nothing threw.
        const screen = document.createElement('pc-screen');
        screen.setAttribute('blend', 'true');
        expect(screen.scaleMode).toBe('none');
        expect('blend' in screen).toBe(false);

        const camera = document.createElement('pc-camera');
        camera.setAttribute('orthographic', 'true');
        expect(camera.projection).toBe('perspective');
        expect('orthographic' in camera).toBe(false);

        const sky = document.createElement('pc-sky');
        sky.setAttribute('level', '3');
        expect(sky.mipLevel).toBe(0);
        expect('level' in sky).toBe(false);

        expect(warnings.seen).toEqual([]);
    });

    it('leaves pc-scrollview aligned with the engine', () => {
        // Deliberately NOT renamed to scroll-x / scroll-y. These mirror
        // ScrollViewComponent.horizontal / .vertical, and the engine itself pairs those with
        // ORIENTATION_HORIZONTAL, so the ambiguity with <pc-scrollbar>'s orientation values is
        // inherited rather than introduced here - not enough to justify diverging.
        const element = document.createElement('pc-scrollview');

        expect(element.horizontal, 'both axes scroll by default').toBe(true);
        expect(element.vertical).toBe(true);

        element.setAttribute('horizontal', 'false');
        expect(element.horizontal).toBe(false);

        element.removeAttribute('horizontal');
        expect(element.horizontal).toBe(true);
    });
});
