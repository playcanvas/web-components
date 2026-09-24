import { describe, expect, it, vi } from 'vitest';

import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * A bound listener the engine keeps on each input device, identifying its window listener.
 */
type WithDownHandler = { _downHandler: EventListenerOrEventListenerObject };

/**
 * The input devices <pc-app> creates. The element input and the mouse both listen for mouse events
 * on window, and stopImmediatePropagation() - which ElementInputEvent#stopPropagation() calls on
 * the browser event - only stops the listeners registered after the one that calls it. So for
 * stopPropagation() in a UI event handler to keep the event from app.mouse, the element input has
 * to register first.
 */
describe('<pc-app> input devices', () => {
    useGuard();

    it('creates the element input, mouse and keyboard', async () => {
        const { app } = await bootApp();

        expect(app.elementInput).toBeTruthy();
        expect(app.mouse).toBeTruthy();
        expect(app.keyboard).toBeTruthy();
    });

    it('registers the element input on window before the mouse', async () => {
        const addEventListener = vi.spyOn(window, 'addEventListener');

        const { app } = await bootApp();

        const mousedownListeners = addEventListener.mock.calls
            .filter(([type]) => type === 'mousedown')
            .map(([, listener]) => listener);
        const elementInput = mousedownListeners.indexOf((app.elementInput as unknown as WithDownHandler)._downHandler);
        const mouse = mousedownListeners.indexOf((app.mouse as unknown as WithDownHandler)._downHandler);

        expect(elementInput, 'the element input listens on window').toBeGreaterThanOrEqual(0);
        expect(mouse, 'the mouse listens on window after the element input').toBeGreaterThan(elementInput);
    });
});
