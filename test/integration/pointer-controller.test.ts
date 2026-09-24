import { describe, expect, it, vi } from 'vitest';

import type { PointerHost } from '../../src/pointer-controller';
import { PointerController } from '../../src/pointer-controller';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/** The canvas events the controller listens for, sorted. */
const CANVAS_TYPES = ['pointercancel', 'pointerdown', 'pointermove', 'pointerout', 'pointerup'];

/**
 * A host with no elements, over a detached stand-in for `<pc-app>`, with any seam overridable.
 *
 * @param overrides - The seams to replace.
 * @returns The host services.
 */
const hostFor = (overrides: Partial<PointerHost> = {}): PointerHost => ({
    element: document.createElement('div'),
    elementFromNode: () => null,
    listeningElements: () => [],
    picking: () => 'auto',
    ...overrides
});

/**
 * The controller exercised directly against its host seams, without any entity elements. The
 * full pick-and-dispatch behavior stays covered end to end by pointer.test.ts.
 */
describe('PointerController', () => {
    useGuard();

    it('tolerates its whole lifecycle before connect', () => {
        const controller = new PointerController(hostFor());

        expect(() => {
            controller.resize(800, 600);
            controller.disconnect();
        }).not.toThrow();
    });

    it('attaches its canvas listeners on connect and detaches them on disconnect', async () => {
        // They stay attached for the whole connection: whether an event is worth a pick is
        // decided per event, because a handler assigned as a property is invisible until then
        const { app } = await bootApp();
        const controller = new PointerController(hostFor());
        const canvas = document.createElement('canvas');
        const add = vi.spyOn(canvas, 'addEventListener');
        const remove = vi.spyOn(canvas, 'removeEventListener');

        controller.connect(app, canvas);
        expect(add.mock.calls.map((call) => call[0]).sort()).toEqual(CANVAS_TYPES);

        controller.disconnect();
        expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual(CANVAS_TYPES);

        // Disconnected again, nothing is left to touch
        remove.mockClear();
        controller.disconnect();
        expect(remove).not.toHaveBeenCalled();
    });

    it('reads the listening elements and the picking mode fresh on every event', async () => {
        // No sync step sits between a listener appearing and the next event using it: a
        // property handler, which nothing can observe being assigned, takes effect at once
        const { app } = await bootApp();
        const listener = document.createElement('div');
        const listening: Element[] = [];
        let picking: 'auto' | 'always' | 'none' = 'auto';
        const controller = new PointerController(
            hostFor({ listeningElements: () => listening, picking: () => picking })
        );
        const canvas = document.createElement('canvas');
        controller.connect(app, canvas);
        const pick = vi.spyOn(controller as unknown as { _pickNode: () => Promise<null> }, '_pickNode');
        const move = () => canvas.dispatchEvent(new PointerEvent('pointermove'));

        move();
        expect(pick, 'nothing listens').not.toHaveBeenCalled();

        listener.onpointermove = vi.fn();
        listening.push(listener);
        move();
        expect(pick, 'a handler property is a listener').toHaveBeenCalledTimes(1);

        picking = 'none';
        move();
        expect(pick, 'none never picks').toHaveBeenCalledTimes(1);

        listening.length = 0;
        picking = 'always';
        move();
        expect(pick, 'always picks with nothing listening').toHaveBeenCalledTimes(2);

        controller.disconnect();
    });
});
