import { describe, expect, it, vi } from 'vitest';

import type { EntityBaseElement } from '../../src/entity-base';
import type { PointerHost } from '../../src/pointer-controller';
import { PointerController } from '../../src/pointer-controller';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * A stand-in for an entity-fronting element: a plain element carrying the one internal method
 * the controller reads for listener demand. The set decides which synthesized events it claims
 * to listen for, and can be changed between syncs.
 *
 * @param types - The event types the element initially listens for.
 * @returns The element and its mutable listener set.
 */
const listeningTarget = (...types: string[]) => {
    const listening = new Set(types);
    const element = document.createElement('div') as unknown as EntityBaseElement;
    (element as unknown as { _hasListeners: (type: string) => boolean })._hasListeners = (type) => listening.has(type);
    return { element, listening };
};

/**
 * A host over a fixed target list, with no node-to-element resolution.
 *
 * @param targets - The elements the host reports as pointer targets.
 * @returns The host services.
 */
const hostFor = (targets: EntityBaseElement[]): PointerHost => ({
    elementFromNode: () => null,
    pointerTargets: () => targets
});

/**
 * The controller exercised directly against its host seams, without any entity elements - what
 * the extraction makes testable. The full pick-and-dispatch behavior stays covered end to end by
 * pointer.test.ts.
 */
describe('PointerController', () => {
    useGuard();

    it('tolerates its whole lifecycle before connect', () => {
        const controller = new PointerController(hostFor([]));

        expect(() => {
            controller.syncListeners();
            controller.resize(800, 600);
            controller.disconnect();
        }).not.toThrow();
    });

    it('connect attaches the canvas listeners already listened for before it', async () => {
        const { app } = await bootApp();
        const { element } = listeningTarget('pointermove');
        const controller = new PointerController(hostFor([element]));

        // No canvas yet: nothing to attach, nothing to throw
        controller.syncListeners();

        const canvas = document.createElement('canvas');
        const add = vi.spyOn(canvas, 'addEventListener');
        controller.connect(app, canvas);

        expect(add.mock.calls.map((call) => call[0])).toContain('pointermove');
        controller.disconnect();
    });

    it('attaches exactly the canvas listeners each synthesized event type needs', async () => {
        // The demand table: enter, leave and move ride the move pick; click rides the down/up
        // pair plus the cancel that discards a press the browser takes back. Each sync must also
        // detach whatever the current listeners no longer need.
        const allCanvasTypes = ['pointercancel', 'pointerdown', 'pointermove', 'pointerup'];
        const table: [string, string[]][] = [
            ['pointermove', ['pointermove']],
            ['pointerenter', ['pointermove']],
            ['pointerleave', ['pointermove']],
            ['pointerdown', ['pointerdown']],
            ['pointerup', ['pointerup']],
            ['click', ['pointercancel', 'pointerdown', 'pointerup']]
        ];

        const { app } = await bootApp();
        const { element, listening } = listeningTarget();
        const controller = new PointerController(hostFor([element]));
        const canvas = document.createElement('canvas');
        controller.connect(app, canvas);

        const add = vi.spyOn(canvas, 'addEventListener');
        const remove = vi.spyOn(canvas, 'removeEventListener');

        for (const [type, needed] of table) {
            listening.clear();
            listening.add(type);
            add.mockClear();
            remove.mockClear();

            controller.syncListeners();

            expect(add.mock.calls.map((call) => call[0]).sort(), `attached for '${type}'`).toEqual(needed);
            expect(remove.mock.calls.map((call) => call[0]).sort(), `detached for '${type}'`).toEqual(
                allCanvasTypes.filter((canvasType) => !needed.includes(canvasType))
            );
        }

        // No listeners at all: every canvas listener detaches
        listening.clear();
        remove.mockClear();
        controller.syncListeners();
        expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual(allCanvasTypes);
        controller.disconnect();
    });

    it('reads the target list fresh on every sync', async () => {
        // The host owns the tree; the controller must follow it rather than hold a copy.
        const { app } = await bootApp();
        const targets: EntityBaseElement[] = [];
        const controller = new PointerController(hostFor(targets));
        const canvas = document.createElement('canvas');
        controller.connect(app, canvas);

        const add = vi.spyOn(canvas, 'addEventListener');
        controller.syncListeners();
        expect(add, 'no targets, nothing to attach').not.toHaveBeenCalled();

        targets.push(listeningTarget('pointerdown').element);
        controller.syncListeners();
        expect(add.mock.calls.map((call) => call[0])).toContain('pointerdown');
        controller.disconnect();
    });

    it('disconnect detaches every canvas handler', async () => {
        const { app } = await bootApp();
        const { element } = listeningTarget('pointermove', 'click');
        const controller = new PointerController(hostFor([element]));
        const canvas = document.createElement('canvas');
        controller.connect(app, canvas);

        const remove = vi.spyOn(canvas, 'removeEventListener');
        controller.disconnect();

        expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual([
            'pointercancel',
            'pointerdown',
            'pointermove',
            'pointerup'
        ]);

        // Disconnected again, nothing is left to touch
        remove.mockClear();
        controller.disconnect();
        expect(remove).not.toHaveBeenCalled();
    });
});
