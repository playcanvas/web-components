import { expect } from 'vitest';

import { currentGuard } from './guard';
import type { AsyncElement } from '../../src/async-element';

/** No ready promise in this library ever rejects, so every wait needs a deadline. */
export const READY_TIMEOUT = 5000;

/** How long to observe an element that is expected never to settle. */
export const NEVER_READY_WINDOW = 150;

/**
 * Renders an element's position in the tree, for diagnostics.
 *
 * @param element - The element to describe.
 * @returns A `parent > child` style path.
 */
export const describeElement = (element: Element | null | undefined): string => {
    if (!element) {
        return '<none>';
    }
    const path: string[] = [];
    for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
        const id = node.id ? `#${node.id}` : '';
        const name = node.getAttribute('name');
        path.unshift(`${node.tagName.toLowerCase()}${id}${name === null ? '' : `[name="${name}"]`}`);
    }
    return path.join(' > ');
};

const TIMED_OUT = Symbol('timed out');

const expire = (ms: number) => {
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
};

/**
 * Awaits an element's ready promise, failing with a diagnosis rather than a bare timeout.
 *
 * Nothing here rejects: a misplaced element logs a warning and its ready promise never settles. So
 * the only useful thing a timeout can do is report WHY, which is almost always one of the warnings
 * the guard has already captured.
 *
 * @param element - The element to await.
 * @param timeout - Milliseconds to wait.
 * @returns The element.
 */
export const readyWithin = async <T extends AsyncElement>(element: T, timeout = READY_TIMEOUT): Promise<T> => {
    const deadline = expire(timeout);
    const result = await Promise.race([element.ready(), deadline.promise]);
    deadline.cancel();

    if (result !== TIMED_OUT) {
        return result as T;
    }

    const guard = currentGuard();
    const warnings = guard?.warnings.seen ?? [];
    const uncaught = guard?.uncaught.seen ?? [];

    throw new Error([
        `readyWithin: ${describeElement(element)} did not become ready within ${timeout}ms.`,
        `  connected:      ${element.isConnected}`,
        `  closestApp:     ${describeElement(element.closestApp)}`,
        `  closestEntity:  ${describeElement(element.closestEntity)}`,
        `  app created:    ${Boolean(element.closestApp?.app)}`,
        `  hierarchyReady: ${element.closestApp?.hierarchyReady ?? 'n/a'}`,
        warnings.length ?
            `  warnings so far:\n${warnings.map(message => `    - ${message}`).join('\n')}` :
            '  warnings so far: (none)',
        uncaught.length ?
            `  uncaught so far:\n${uncaught.map(message => `    - ${message}`).join('\n')}` :
            '',
        'A misplaced element warns and never settles; check the warnings above first.'
    ].filter(Boolean).join('\n'));
};

/**
 * Asserts an element does NOT become ready, for the documented never-settles cases (for example a
 * `<pc-entity>` with no `<pc-app>` ancestor).
 *
 * A false pass is impossible - a settled promise wins the race immediately - and these paths
 * perform no I/O, so the observation window cannot be lost to a slow machine.
 *
 * @param element - The element that must stay pending.
 * @param window - Milliseconds to observe.
 */
export const expectNeverReady = async (element: AsyncElement, window = NEVER_READY_WINDOW) => {
    const deadline = expire(window);
    const result = await Promise.race([element.ready().then(() => 'ready' as const), deadline.promise]);
    deadline.cancel();
    expect(result, `${describeElement(element)} became ready but should never settle`).toBe(TIMED_OUT);
};

/**
 * Records the order in which elements under `root` fire their `ready` event. Works because `ready`
 * bubbles and is composed, so one listener observes the whole subtree.
 *
 * @param root - The element to listen on.
 * @returns A function returning the ordered element descriptions.
 */
export const readyOrder = (root: Element) => {
    const order: string[] = [];
    root.addEventListener('ready', (event) => {
        order.push(describeElement(event.target as Element));
    });
    return () => order;
};
