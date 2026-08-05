import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

type Tick = {
    loaded: number;
    total: number;
    lengthComputable: boolean;
    /** `loadProgress` observed at dispatch time, proving the property never lags the event. */
    fraction: number;
};

/**
 * The `progress` ProgressEvents and `loadProgress` property on <pc-app>. Listeners are attached
 * synchronously after mount(): boot is still suspended on its module and device awaits at that
 * point, so no tick can be missed - the ordering guarantee a loading UI relies on.
 */
describe('<pc-app> loading progress', () => {
    const { errors, uncaught } = useGuard();

    const settleTask = () =>
        new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

    const observe = (appElement: AppElement) => {
        const ticks: Tick[] = [];
        const order: string[] = [];
        appElement.addEventListener('progress', (event) => {
            ticks.push({
                loaded: event.loaded,
                total: event.total,
                lengthComputable: event.lengthComputable,
                fraction: appElement.loadProgress
            });
            order.push('progress');
        });
        appElement.addEventListener('ready', (event) => {
            // ready bubbles from every descendant; only the app's own marks the boot complete
            if (event.target === appElement) {
                order.push('ready');
            }
        });
        return { ticks, order };
    };

    it('dispatches a single 0-of-0 tick before ready when there is nothing to preload', async () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');
        const { ticks, order } = observe(appElement);

        expect(appElement.loadProgress, 'progress is 0 until preloading begins').toBe(0);

        await readyWithin(appElement);

        expect(ticks).toEqual([{ loaded: 0, total: 0, lengthComputable: true, fraction: 1 }]);
        expect(order).toEqual(['progress', 'ready']);
        expect(appElement.loadProgress).toBe(1);
        expect(uncaught.seen).toEqual([]);
    });

    it('ticks once per asset, ending with loaded equal to total, all before ready', async () => {
        const handle = mount(`<pc-app backend="null">
            <pc-asset id="a" type="text" src="data:text/plain,alpha"></pc-asset>
            <pc-asset id="b" type="text" src="data:text/plain,beta"></pc-asset>
        </pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');
        const { ticks, order } = observe(appElement);

        await readyWithin(appElement);
        await settle(handle.container);

        expect(ticks).toEqual([
            { loaded: 0, total: 2, lengthComputable: true, fraction: 0 },
            { loaded: 1, total: 2, lengthComputable: true, fraction: 0.5 },
            { loaded: 2, total: 2, lengthComputable: true, fraction: 1 }
        ]);
        expect(order).toEqual(['progress', 'progress', 'progress', 'ready']);
    });

    it('counts a failing asset as loaded and still becomes ready', async () => {
        const handle = mount(`<pc-app backend="null">
            <pc-asset id="good" type="text" src="data:text/plain,good"></pc-asset>
            <pc-asset id="bad" type="container" src="data:model/gltf-binary,notaglb"></pc-asset>
        </pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');
        const { ticks } = observe(appElement);

        await readyWithin(appElement);
        await settle(handle.container);

        expect(ticks.at(-1)).toEqual({ loaded: 2, total: 2, lengthComputable: true, fraction: 1 });
        errors.expect(/glb/i);
    });

    it('does not bubble', async () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        let bubbled = 0;
        let captured = 0;
        handle.container.addEventListener('progress', () => {
            bubbled += 1;
        });
        handle.container.addEventListener(
            'progress',
            () => {
                captured += 1;
            },
            true
        );

        await readyWithin(handle.get<AppElement>('pc-app'));

        expect(captured).toBeGreaterThan(0);
        expect(bubbled).toBe(0);
    });

    it('resets loadProgress once the element is removed', async () => {
        const { appElement, unmount } = await bootApp();

        expect(appElement.loadProgress).toBe(1);

        unmount();
        await settleTask();

        expect(appElement.loadProgress).toBe(0);
    });
});
