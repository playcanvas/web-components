import type { AppBase, Texture } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AssetElement } from '../../src/asset';
import { bootApp, settle } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { parkLoads } from '../helpers/loader';
import { readyWithin } from '../helpers/ready';

/**
 * `<pc-app area-light-luts>` is the one switch behind area lights: it binds the lookup table
 * asset, hands the tables to `AppBase#setAreaLightLuts` and enables area lights in clustered
 * lighting - two engine settings that are only ever useful together. The engine installs a shared
 * 2x2 placeholder for both tables at init and offers no way back to it, which is why the tests
 * watch the bound textures rather than a spy.
 */

/** The number of values in each table - a 64x64 RGBA texture. */
const LUT_LENGTH = 64 * 64 * 4;

/**
 * A lookup table file of the shape the engine examples ship, filled with `value`.
 *
 * @param value - The value to fill both tables with.
 * @returns The parsed file.
 */
const tables = (value = 0) => ({
    LTC_MAT_1: new Array<number>(LUT_LENGTH).fill(value),
    LTC_MAT_2: new Array<number>(LUT_LENGTH).fill(value)
});

/**
 * A JSON asset as a `data:` URI, so it preloads without I/O.
 *
 * @param data - The object to serialize.
 * @returns The data: URI.
 */
const jsonSrc = (data: unknown) => `data:application/json,${encodeURIComponent(JSON.stringify(data))}`;

/** Two lazy lookup table assets whose loads the tests park and settle in a chosen order. */
const LAZY_ASSETS = `
    <pc-asset id="luts-a" type="json" src="luts-a.json" lazy></pc-asset>
    <pc-asset id="luts-b" type="json" src="luts-b.json" lazy></pc-asset>
`;

/**
 * The texture the engine currently samples one of the lookup tables from.
 *
 * @param app - The booted application.
 * @param index - Which of the two tables to read.
 * @returns The bound texture.
 */
const lutTexture = (app: AppBase, index: 1 | 2) =>
    app.graphicsDevice.scope.resolve(`areaLightsLutTex${index}`).getValue() as Texture;

describe('<pc-app> area lights', () => {
    const { warnings, uncaught } = useGuard();

    describe('[area-light-luts]', () => {
        it('leaves the engine placeholder tables and area lights disabled when omitted', async () => {
            const { app, appElement } = await bootApp();

            expect(appElement.areaLightLuts).toBe('');
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);

            const placeholder = lutTexture(app, 1);
            expect(placeholder.width).toBe(2);
            expect(lutTexture(app, 2), 'the placeholder is shared by both tables').toBe(placeholder);
        });

        it('preloads the tables named at boot and enables area lights before the first frame', async () => {
            const { app } = await bootApp(`<pc-asset id="luts" type="json" src="${jsonSrc(tables())}"></pc-asset>`, {
                appAttributes: 'area-light-luts="luts"'
            });

            // bootApp resolves from the preload callback, so both are proven to be in place before
            // app.start() rather than some time after
            expect(app.scene.lighting.areaLightsEnabled).toBe(true);
            expect(lutTexture(app, 1).width).toBe(64);
            expect(lutTexture(app, 2), 'the two tables are separate textures').not.toBe(lutTexture(app, 1));
        });

        it('applies a lazily loaded asset when it arrives and only then enables area lights', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);
            const placeholder = lutTexture(app, 1);

            appElement.setAttribute('area-light-luts', 'luts-a');
            expect(parked.has('luts-a.json'), 'binding the lazy asset started its load').toBe(true);
            expect(app.scene.lighting.areaLightsEnabled, 'nothing to enable until the tables exist').toBe(false);
            expect(lutTexture(app, 1)).toBe(placeholder);

            parked.get('luts-a.json')!(null, tables());

            expect(app.scene.lighting.areaLightsEnabled).toBe(true);
            expect(lutTexture(app, 1)).not.toBe(placeholder);
            expect(lutTexture(app, 1).width).toBe(64);
        });

        it('applies an asset that has already loaded as soon as it is bound', async () => {
            const { app, appElement, get } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);

            const asset = get<AssetElement>('pc-asset[id="luts-a"]').asset!;
            app.assets.load(asset);
            parked.get('luts-a.json')!(null, tables());
            expect(app.scene.lighting.areaLightsEnabled, 'loading alone changes nothing').toBe(false);

            appElement.setAttribute('area-light-luts', 'luts-a');

            expect(app.scene.lighting.areaLightsEnabled).toBe(true);
            expect(lutTexture(app, 1).width).toBe(64);
        });

        it('applies only the newest asset when a superseded load settles later', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);

            appElement.setAttribute('area-light-luts', 'luts-a');
            appElement.setAttribute('area-light-luts', 'luts-b');
            expect(parked.has('luts-b.json')).toBe(true);

            // B settles first, then A - the superseded tables must not overwrite their replacement
            parked.get('luts-b.json')!(null, tables());
            const current = lutTexture(app, 1);
            expect(current.width).toBe(64);

            parked.get('luts-a.json')!(null, tables(1));

            expect(lutTexture(app, 1), 'the superseded tables did not apply').toBe(current);
            expect(app.scene.lighting.areaLightsEnabled).toBe(true);
            expect(uncaught.seen).toEqual([]);
        });

        it('never applies a load that was cleared while it was pending', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);
            const placeholder = lutTexture(app, 1);

            appElement.setAttribute('area-light-luts', 'luts-a');
            appElement.removeAttribute('area-light-luts');
            parked.get('luts-a.json')!(null, tables());

            expect(appElement.areaLightLuts).toBe('');
            expect(lutTexture(app, 1)).toBe(placeholder);
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
        });

        it('disables area lights again when removed, leaving the applied tables in place', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);

            appElement.setAttribute('area-light-luts', 'luts-a');
            parked.get('luts-a.json')!(null, tables());
            const applied = lutTexture(app, 1);
            expect(app.scene.lighting.areaLightsEnabled).toBe(true);

            appElement.removeAttribute('area-light-luts');

            // The engine offers no way back to its placeholder, so only the switch can be undone
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
            expect(lutTexture(app, 1)).toBe(applied);
        });

        it('refuses a file that is not a lookup table', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);
            const placeholder = lutTexture(app, 1);

            appElement.setAttribute('area-light-luts', 'luts-a');
            parked.get('luts-a.json')!(null, { LTC_MAT_1: [1, 2, 3] });

            warnings.expect(
                "pc-asset 'luts-a' is not an area light lookup table - expected LTC_MAT_1 and LTC_MAT_2 arrays of 16384 numbers - not applied"
            );
            expect(lutTexture(app, 1)).toBe(placeholder);
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
            expect(uncaught.seen).toEqual([]);
        });

        it('refuses a table whose entries are not all finite numbers', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);
            const placeholder = lutTexture(app, 1);

            appElement.setAttribute('area-light-luts', 'luts-a');
            const file = tables();
            (file.LTC_MAT_2 as unknown[])[100] = 'nan';
            parked.get('luts-a.json')!(null, file);

            warnings.expect("pc-asset 'luts-a' is not an area light lookup table");
            expect(lutTexture(app, 1)).toBe(placeholder);
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
        });

        it('warns when the asset id resolves to nothing', async () => {
            const { app } = await bootApp('', { appAttributes: 'area-light-luts="missing"' });

            warnings.expect("pc-app could not find asset 'missing' - area light lookup tables not applied");
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
        });

        it('switches area lights off when changed to an asset that does not exist', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);

            appElement.setAttribute('area-light-luts', 'luts-a');
            parked.get('luts-a.json')!(null, tables());
            expect(app.scene.lighting.areaLightsEnabled).toBe(true);

            appElement.setAttribute('area-light-luts', 'missing');

            warnings.expect("pc-app could not find asset 'missing' - area light lookup tables not applied");
            expect(app.scene.lighting.areaLightsEnabled, 'nothing valid is bound any more').toBe(false);
        });

        it('treats an id that would not survive a selector as missing rather than throwing', async () => {
            const { app, appElement } = await bootApp();
            const id = 'lu"ts';

            expect(() => appElement.setAttribute('area-light-luts', id)).not.toThrow();

            warnings.expect(`pc-app could not find asset '${id}' - area light lookup tables not applied`);
            expect(app.scene.lighting.areaLightsEnabled).toBe(false);
        });

        it('cancels a pending load when the element is removed', async () => {
            const { app, appElement } = await bootApp(LAZY_ASSETS);
            const parked = parkLoads(app);

            appElement.setAttribute('area-light-luts', 'luts-a');
            const settleLoad = parked.get('luts-a.json')!;

            appElement.remove();

            // The application is gone, so a load settling now has nothing to apply to. The registry
            // still completes the asset against the destroyed loader, which warns that it has no
            // handler left - the engine's teardown, not the element's.
            expect(() => settleLoad(null, tables())).not.toThrow();
            warnings.allow('No resource handler found for: json');
            expect(uncaught.seen).toEqual([]);
        });

        it('binds again when a removed element is re-inserted', async () => {
            const { appElement, container } = await bootApp(
                `<pc-asset id="luts" type="json" src="${jsonSrc(tables())}"></pc-asset>`,
                { appAttributes: 'area-light-luts="luts"' }
            );

            appElement.remove();
            container.appendChild(appElement);
            await readyWithin(appElement);
            await settle(container);

            const app = appElement.app!;
            app.autoRender = false;
            expect(app.scene.lighting.areaLightsEnabled).toBe(true);
            expect(lutTexture(app, 1).width).toBe(64);
        });
    });
});
