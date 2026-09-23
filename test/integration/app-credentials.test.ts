import { http } from 'playcanvas';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * <pc-app with-credentials> against the engine's loader. The flag lives in the engine's page-wide
 * HTTP client rather than on the application, so every test hands it back switched off.
 */
describe('<pc-app> with-credentials', () => {
    useGuard();

    afterEach(() => {
        http.withCredentials = false;
    });

    it('leaves asset requests without credentials by default', async () => {
        const { app } = await bootApp();

        expect(app.loader.withCredentials).toBe(false);
    });

    it('sends credentials once the application boots with the attribute', async () => {
        const { app } = await bootApp('', { appAttributes: 'with-credentials' });

        expect(app.loader.withCredentials).toBe(true);
    });

    it('writes changes through after boot and switches credentials off on removal', async () => {
        const { app, get } = await bootApp();
        const element = get<AppElement>('pc-app');

        element.setAttribute('with-credentials', '');
        expect(app.loader.withCredentials).toBe(true);

        element.removeAttribute('with-credentials');
        expect(app.loader.withCredentials).toBe(false);
    });

    it('does not switch credentials off for another application when booting without it', async () => {
        // Stands in for a first <pc-app with-credentials> elsewhere on the page
        http.withCredentials = true;

        const { app, get } = await bootApp();

        expect(app.loader.withCredentials, 'the page-wide flag survives a second boot').toBe(true);
        expect(get<AppElement>('pc-app').withCredentials, 'the property reports the flag in effect').toBe(true);
    });

    it('reports its own setting before the application boots', () => {
        const element = document.createElement('pc-app') as AppElement;

        expect(element.withCredentials).toBe(false);
        element.setAttribute('with-credentials', '');
        expect(element.withCredentials).toBe(true);
    });
});
