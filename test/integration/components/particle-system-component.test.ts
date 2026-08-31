import type { AppBase, Asset } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../../src/asset';
import type { EntityElement } from '../../../src/entity';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';
import { readyWithin } from '../../helpers/ready';

/**
 * A particle config asset as a `data:` URI, so it loads without I/O.
 *
 * @param config - The config object to serialize.
 * @returns The data: URI.
 */
const jsonSrc = (config: Record<string, unknown>) =>
    `data:application/json,${encodeURIComponent(JSON.stringify(config))}`;

/** The engine's ParticleSystemComponent default, proving a config was NOT applied. */
const DEFAULT_LIFETIME = 50;

/** Two lazy configs whose loads the tests park and settle in a chosen order. */
const RACE_ASSETS = `
    <pc-asset id="cfg-a" type="json" src="cfg-a.json" lazy></pc-asset>
    <pc-asset id="cfg-b" type="json" src="cfg-b.json" lazy></pc-asset>
    <pc-entity name="fx"></pc-entity>
`;

type LoaderCallback = (err: string | null, resource?: unknown) => void;

/**
 * Replaces the app's resource loader with one that parks every load until the test settles it,
 * making settlement order a test input rather than a network accident. Settling a parked load
 * runs the registry's own completion path, so the asset's real `load`/`error` events fire.
 *
 * @param app - The booted application.
 * @returns Parked loads, keyed by the asset's file URL.
 */
const parkLoads = (app: AppBase) => {
    const parked = new Map<string, LoaderCallback>();
    vi.spyOn(app.loader, 'load').mockImplementation(((url: string, _type: string, callback: LoaderCallback) => {
        parked.set(url, callback);
    }) as typeof app.loader.load);
    return parked;
};

/**
 * The number of handlers subscribed to one of an asset's events, for asserting that a binding
 * detached itself. Counted relative to a baseline, since the `pc-asset` element itself keeps a
 * listener on each channel for the element's whole life.
 *
 * @param asset - The asset to inspect.
 * @param name - The event name.
 * @returns The number of subscribed handlers.
 */
const listenerCount = (asset: Asset, name: string) =>
    (asset as unknown as { _callbacks: Map<string, unknown[]> })._callbacks.get(name)?.length ?? 0;

/**
 * Mounts a `<pc-particle-system>` bound to `assetId` under the booted `pc-entity` and waits for
 * its component.
 *
 * @param host - The host entity element.
 * @param assetId - The initial `asset` attribute value.
 * @returns The ready element.
 */
const mountParticleSystem = async (host: EntityElement, assetId: string) => {
    const element = document.createElement('pc-particle-system');
    element.setAttribute('asset', assetId);
    host.appendChild(element);
    await readyWithin(element);
    expect(element.component, 'the component exists').toBeTruthy();
    return element;
};

describe('<pc-particle-system>', () => {
    const { uncaught } = useGuard();

    describe('stale config loads', () => {
        it('applies only the newest asset when a superseded load settles later', async () => {
            const { app, get } = await bootApp(RACE_ASSETS);
            const parked = parkLoads(app);

            const element = await mountParticleSystem(get('pc-entity'), 'cfg-a');
            expect(parked.has('cfg-a.json'), 'binding the pending config started its load').toBe(true);

            element.setAttribute('asset', 'cfg-b');
            expect(parked.has('cfg-b.json')).toBe(true);

            // B settles first, then A - the superseded config must not overwrite its replacement
            parked.get('cfg-b.json')!(null, { lifetime: 9, rate: 3 });
            parked.get('cfg-a.json')!(null, { lifetime: 5, rate: 7 });

            expect(element.component!.lifetime, 'the superseded config did not apply').toBe(9);
            expect(element.component!.rate).toBe(3);
            expect(uncaught.seen).toEqual([]);
        });

        it('prevents an asset cleared while pending from applying when it settles', async () => {
            const { app, get } = await bootApp(RACE_ASSETS);
            const parked = parkLoads(app);

            const element = await mountParticleSystem(get('pc-entity'), 'cfg-a');

            element.removeAttribute('asset');
            parked.get('cfg-a.json')!(null, { lifetime: 5 });

            expect(element.component!.lifetime, 'the cleared config did not apply').toBe(DEFAULT_LIFETIME);
            expect(uncaught.seen).toEqual([]);
        });

        it('detaches superseded, settled and disconnected bindings from their assets', async () => {
            const { app, get } = await bootApp(RACE_ASSETS);
            const parked = parkLoads(app);
            const assetA = get<AssetElement>('pc-asset[id="cfg-a"]').asset!;
            const assetB = get<AssetElement>('pc-asset[id="cfg-b"]').asset!;
            const baselineA = listenerCount(assetA, 'load');
            const baselineB = listenerCount(assetB, 'load');

            const element = await mountParticleSystem(get('pc-entity'), 'cfg-a');
            expect(listenerCount(assetA, 'load'), 'the pending binding is subscribed').toBe(baselineA + 1);

            element.setAttribute('asset', 'cfg-b');
            expect(listenerCount(assetA, 'load'), 'superseding detached the old subscription').toBe(baselineA);
            expect(listenerCount(assetB, 'load')).toBe(baselineB + 1);

            parked.get('cfg-b.json')!(null, { lifetime: 9 });
            expect(listenerCount(assetB, 'load'), 'settling detached the subscription').toBe(baselineB);

            element.setAttribute('asset', 'cfg-a');
            element.remove();
            expect(listenerCount(assetA, 'load'), 'disconnecting detached the subscription').toBe(baselineA);
            expect(uncaught.seen).toEqual([]);
        });

        it('survives binding to a config whose load already failed, and applies a later reload', async () => {
            // The engine marks a failed load `loaded` too, with no resource - binding to one
            // must not apply the empty resource as a config.
            const { app, get } = await bootApp(RACE_ASSETS);
            const parked = parkLoads(app);
            const assetA = get<AssetElement>('pc-asset[id="cfg-a"]').asset!;

            app.assets.load(assetA);
            parked.get('cfg-a.json')!('failed to fetch');
            expect(assetA.loaded, 'a failed load still settles as loaded').toBe(true);
            expect(assetA.resource ?? null).toBeNull();

            const element = await mountParticleSystem(get('pc-entity'), '');
            element.setAttribute('asset', 'cfg-a');
            expect(element.component!.lifetime, 'the failed config did not apply').toBe(DEFAULT_LIFETIME);

            // Without an error callback the binding waits for a reload, exactly as it does for
            // a failure that happens while subscribed - a retry that succeeds still delivers.
            app.assets.load(assetA, { force: true });
            parked.get('cfg-a.json')!(null, { lifetime: 7 });
            expect(element.component!.lifetime, 'the successful reload applied').toBe(7);
            expect(uncaught.seen).toEqual([]);
        });

        it('does not let a load from a previous connection configure a reconnected component', async () => {
            const { app, get } = await bootApp(RACE_ASSETS);
            const parked = parkLoads(app);
            const host = get<EntityElement>('pc-entity');

            const element = await mountParticleSystem(host, 'cfg-a');
            const first = element.component!;

            element.remove();
            element.setAttribute('asset', 'cfg-b');
            host.appendChild(element);
            await readyWithin(element);

            const second = element.component!;
            expect(second, 'reconnection created a new component').not.toBe(first);

            // The old connection's config settles now - only the new connection's may configure
            parked.get('cfg-a.json')!(null, { lifetime: 5 });
            expect(second.lifetime, "the previous connection's load did not apply").toBe(DEFAULT_LIFETIME);

            parked.get('cfg-b.json')!(null, { lifetime: 9 });
            expect(second.lifetime, "the new connection's own binding applied its config").toBe(9);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('config application', () => {
        it('applies an already-loaded config at creation, resolving colorMapAsset', async () => {
            const { get } = await bootApp(`
                <pc-asset id="flame" src="flame.png" lazy></pc-asset>
                <pc-asset id="cfg" type="json" src="${jsonSrc({ lifetime: 2.5, numParticles: 11, colorMapAsset: 'flame' })}"></pc-asset>
                <pc-entity name="fx"><pc-particle-system asset="cfg"></pc-particle-system></pc-entity>
            `);
            const component = get('pc-particle-system').component!;
            const flame = get<AssetElement>('pc-asset[id="flame"]').asset!;

            expect(component.lifetime).toBe(2.5);
            expect(component.numParticles).toBe(11);
            expect(component.colorMapAsset, 'the pc-asset id resolved to the engine asset id').toBe(flame.id);
            expect(uncaught.seen).toEqual([]);
        });

        it('applies a lazy config once it loads, resolving colorMapAsset', async () => {
            const { get } = await bootApp(`
                <pc-asset id="flame" src="flame.png" lazy></pc-asset>
                <pc-asset id="cfg" type="json" src="${jsonSrc({ lifetime: 4, colorMapAsset: 'flame' })}" lazy></pc-asset>
                <pc-entity name="fx"><pc-particle-system asset="cfg"></pc-particle-system></pc-entity>
            `);
            const component = get('pc-particle-system').component!;
            const cfg = get<AssetElement>('pc-asset[id="cfg"]').asset!;

            // The element resolved its reference, which is what starts a lazy load; the data:
            // fetch needs a macrotask, so nothing has applied yet.
            expect(cfg.loaded).toBe(false);
            expect(component.lifetime, 'defaults until the lazy config loads').toBe(DEFAULT_LIFETIME);

            await vi.waitFor(() => expect(cfg.loaded).toBe(true));
            expect(component.lifetime).toBe(4);
            expect(component.colorMapAsset, 'the lazy path resolves colorMapAsset too').toBe(
                get<AssetElement>('pc-asset[id="flame"]').asset!.id
            );
            expect(uncaught.seen).toEqual([]);
        });
    });
});
