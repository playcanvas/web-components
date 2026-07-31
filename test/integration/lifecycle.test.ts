import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';


/**
 * <pc-app> boot and teardown state. Both cases here are known bugs, pinned as current behaviour
 * with an it.todo beside them for the intent.
 */
describe('<pc-app> lifecycle', () => {
    const { uncaught } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    it('completes boot after being detached, leaking a live application', async () => {
        // KNOWN BUG (#311): connectedCallback never re-checks isConnected after its awaits, unlike
        // AssetElement and MaterialElement which both do. The first await happens BEFORE _canvas
        // and _app are assigned, so a synchronous detach runs disconnectedCallback against all-null
        // state - it cleans up nothing - and boot then completes on the detached element, starting
        // an rAF ticker and adding a window resize listener that nothing ever removes.
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        appElement.remove();

        await readyWithin(appElement);

        expect(appElement.isConnected, 'the element is detached').toBe(false);
        expect(appElement.app, 'yet it owns a live application').toBeTruthy();
        expect(uncaught.seen).toEqual([]);

        // Clean up after the bug, so the leak does not follow us into the next test.
        appElement.app.destroy();
    });

    it.todo('abandons boot when pc-app is detached before its graphics device resolves');

    it('leaves hierarchyReady set after teardown, while the application is gone', async () => {
        // KNOWN BUG (#312), pinned at its root cause rather than its symptom.
        //
        // disconnectedCallback nulls _app but never resets _hierarchyReady, and AsyncElement's
        // ready promise is a one-shot latch that stays resolved. That combination is what breaks
        // re-insertion: a descendant's connectedCallback sees hierarchyReady === true and an
        // already-resolved ready promise, then dereferences a null app.
        //
        // The symptom itself is not pinned executably, because re-inserting a populated <pc-app>
        // produces three unhandled rejections and Vitest fails a file on any unhandled rejection
        // whether or not a test claims it. Asserting the inconsistent state is crash-free and
        // identifies the same defect.
        const { appElement, unmount } = await bootApp('<pc-entity name="e"></pc-entity>');

        expect(appElement.hierarchyReady).toBe(true);

        unmount();
        await settleTask();

        expect(appElement.app, 'the application is destroyed').toBeNull();
        expect(
            appElement.hierarchyReady,
            'but hierarchyReady still claims the hierarchy is live - this is the bug'
        ).toBe(true);

        // The ready promise is likewise still resolved, so a descendant awaiting it would resume
        // immediately against the null app above.
        await expect(appElement.ready()).resolves.toBe(appElement);
    });

    it.todo('resets hierarchyReady and re-arms readiness so a removed pc-app can be re-added');
});
