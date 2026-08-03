import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { AssetElement } from '../../src/asset';
import { settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';


/**
 * The `load` and `error` DOM events on <pc-asset>. Both mirror <img> resource semantics: they are
 * dispatched on the element and do not bubble, so a window-level bubble-phase 'error' listener
 * (the shape every error-reporting SDK installs) never sees them - aggregation is done with a
 * capture-phase listener on an ancestor instead.
 */
describe('<pc-asset> load and error events', () => {
    const { errors, uncaught } = useGuard();

    const settleTask = () => new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

    const boot = (assetHtml: string) => {
        const handle = mount(`<pc-app backend="null">${assetHtml}</pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');
        const assetElement = handle.get<AssetElement>('pc-asset');
        return { handle, appElement, assetElement };
    };

    it('fires load on the element, visible to ancestors only in the capture phase', async () => {
        const { handle, appElement, assetElement } =
            boot('<pc-asset id="note" type="text" src="data:text/plain,hello"></pc-asset>');
        const events: Event[] = [];
        let bubbled = 0;
        let captured = 0;
        assetElement.addEventListener('load', event => events.push(event));
        appElement.addEventListener('load', () => {
            bubbled += 1;
        });
        appElement.addEventListener('load', () => {
            captured += 1;
        }, true);

        await readyWithin(appElement);
        await settle(handle.container);

        expect(events).toHaveLength(1);
        expect(events[0].bubbles).toBe(false);
        expect(captured).toBe(1);
        expect(bubbled).toBe(0);
    });

    it('fires error with the engine message, without reaching the window error channel', async () => {
        const { handle, appElement, assetElement } =
            boot('<pc-asset id="bad" type="container" src="data:model/gltf-binary,notaglb"></pc-asset>');
        const events: ErrorEvent[] = [];
        assetElement.addEventListener('error', event => events.push(event));

        await readyWithin(appElement);
        await settle(handle.container);

        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(ErrorEvent);
        expect(events[0].message).not.toBe('');
        expect(events[0].bubbles).toBe(false);

        // The guard's window listener is bubble-phase, exactly like an error-reporting SDK's - a
        // non-bubbling asset failure must stay off that channel
        expect(uncaught.seen).toEqual([]);
        errors.expect(/glb/i);
    });

    it('fires load for a lazy asset only once something loads it', async () => {
        const { handle, appElement, assetElement } =
            boot('<pc-asset id="later" type="text" src="data:text/plain,later" lazy></pc-asset>');
        let loads = 0;
        assetElement.addEventListener('load', () => {
            loads += 1;
        });

        await readyWithin(appElement);
        await settle(handle.container);

        expect(loads, 'a lazy asset does not load during boot').toBe(0);

        const { asset } = assetElement;
        const app = appElement.app;
        if (!asset || !app) {
            throw new Error('a lazy asset should be registered by the time the app is ready');
        }

        const loaded = new Promise<void>((resolve) => {
            assetElement.addEventListener('load', () => resolve(), { once: true });
        });
        app.assets.load(asset);
        await loaded;

        expect(loads).toBe(1);
    });

    it('stops dispatching once the element is removed', async () => {
        const { handle, appElement, assetElement } =
            boot('<pc-asset id="gone" type="text" src="data:text/plain,gone"></pc-asset>');
        let loads = 0;
        let errorCount = 0;
        assetElement.addEventListener('load', () => {
            loads += 1;
        });
        assetElement.addEventListener('error', () => {
            errorCount += 1;
        });

        await readyWithin(appElement);
        await settle(handle.container);

        const { asset } = assetElement;
        if (!asset) {
            throw new Error('the asset should exist once the element is ready');
        }
        expect(loads).toBe(1);

        assetElement.remove();
        await settleTask();

        // A caller that kept the Asset can still fire it; the removed element must stay silent
        asset.fire('load', asset);
        asset.fire('error', 'late failure', asset);

        expect(loads).toBe(1);
        expect(errorCount).toBe(0);
    });
});
