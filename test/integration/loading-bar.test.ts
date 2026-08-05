import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * The built-in loading bar <pc-app> shows by default. It is a plain <div role="progressbar">
 * child of the element - deliberately not a custom element - created synchronously on connect
 * (before the module and device awaits), driven by the preload ticks, and dismissed after the
 * first rendered frame.
 */
describe('<pc-app> loading bar', () => {
    const { uncaught } = useGuard();

    const settleTask = () =>
        new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

    const barOf = (appElement: AppElement) => appElement.querySelector<HTMLDivElement>('[role="progressbar"]');

    it('appears synchronously on connect, indeterminate until totals are known', async () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        const bar = barOf(appElement);
        if (!bar) {
            throw new Error('the bar should exist before connectedCallback first awaits');
        }
        expect(bar.getAttribute('aria-valuenow'), 'no valuenow marks a progressbar indeterminate').toBeNull();
        expect(bar.getAttribute('aria-label')).toBe('Loading');

        await readyWithin(appElement);
    });

    it('reports determinate progress once preloading begins', async () => {
        const handle = mount(`<pc-app backend="null">
            <pc-asset id="a" type="text" src="data:text/plain,alpha"></pc-asset>
            <pc-asset id="b" type="text" src="data:text/plain,beta"></pc-asset>
        </pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');

        await readyWithin(appElement);
        await settle(handle.container);

        const bar = barOf(appElement);
        if (!bar) {
            throw new Error('the bar should still be visible at ready; dismissal waits for a frame');
        }
        expect(bar.getAttribute('aria-valuenow')).toBe('100');
        expect(bar.firstElementChild instanceof HTMLElement && bar.firstElementChild.style.transform).toBe('scaleX(1)');
    });

    it('is dismissed after the first rendered frame', async () => {
        const { appElement } = await bootApp();

        await vi.waitFor(
            () => {
                expect(barOf(appElement)).toBeNull();
            },
            { timeout: 2000 }
        );
    });

    it('never appears when opted out with loading-bar="false"', async () => {
        const handle = mount('<pc-app backend="null" loading-bar="false"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        expect(barOf(appElement)).toBeNull();

        await readyWithin(appElement);

        expect(barOf(appElement)).toBeNull();
    });

    it('is removed immediately when the property is set to false mid-boot', async () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        expect(barOf(appElement)).not.toBeNull();

        appElement.loadingBar = false;

        expect(barOf(appElement)).toBeNull();

        await readyWithin(appElement);

        expect(barOf(appElement), 'boot must not resurrect a disabled bar').toBeNull();
    });

    it('is destroyed by a detach mid-boot and not recreated by the abandoned boot', async () => {
        // The bar is created before the first await, so disconnectedCallback has something to
        // destroy. The detached boot abandons itself when it resumes, so nothing recreates the
        // bar - and the element never becomes ready.
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        expect(barOf(appElement)).not.toBeNull();

        appElement.remove();

        expect(barOf(appElement), 'disconnect destroys the bar immediately').toBeNull();

        await expectNeverReady(appElement);

        expect(barOf(appElement), 'the abandoned boot must not recreate it').toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('stays clean across repeated mount and teardown cycles', async () => {
        const cycle = async () => {
            const { unmount } = await bootApp();
            unmount();
            await settleTask();
            expect(uncaught.seen).toEqual([]);
        };

        await cycle();
        await cycle();
        await cycle();
    });
});
