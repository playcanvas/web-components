import type { AppBase } from 'playcanvas';
import { vi } from 'vitest';

/** Completes a parked load: `callback(null, resource)` succeeds, `callback('reason')` fails. */
export type ParkedLoadCallback = (err: string | null, resource?: unknown) => void;

/**
 * Replaces the app's resource loader with one that parks every load until the test settles it,
 * making settlement order (and failure) a test input rather than a network accident. Settling a
 * parked load runs the registry's own completion path, so the asset's real `load`/`error` events
 * fire.
 *
 * Install after boot: a parked load never completes on its own, so any non-lazy asset would stall
 * the app's preload.
 *
 * @param app - The booted application.
 * @returns Parked loads, keyed by the asset's file URL.
 */
export const parkLoads = (app: AppBase) => {
    const parked = new Map<string, ParkedLoadCallback>();
    vi.spyOn(app.loader, 'load').mockImplementation(((url: string, _type: string, callback: ParkedLoadCallback) => {
        parked.set(url, callback);
    }) as typeof app.loader.load);
    return parked;
};
