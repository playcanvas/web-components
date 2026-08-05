import { describe, expect, it } from 'vitest';

import { useGuard } from '../helpers/guard';

/**
 * The loading-bar boolean attribute on an unconnected <pc-app>. No engine boots in this tier, so
 * only attributeChangedCallback and the accessor are exercised - the bar itself is covered in the
 * integration tier.
 */
describe('<pc-app> loading-bar attribute', () => {
    useGuard();

    it('parses like every boolean attribute and restores true on removal', () => {
        const element = document.createElement('pc-app');

        expect(element.loadingBar, 'the bar is enabled by default').toBe(true);

        element.setAttribute('loading-bar', 'false');
        expect(element.loadingBar).toBe(false);

        element.setAttribute('loading-bar', '');
        expect(element.loadingBar, 'a bare boolean attribute means true').toBe(true);

        element.setAttribute('loading-bar', 'false');
        element.removeAttribute('loading-bar');
        expect(element.loadingBar).toBe(true);
    });
});
