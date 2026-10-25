import { WasmModule } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { whenReady } from '../../src/index';
import type { WasmElement } from '../../src/wasm';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * Stubs the engine's wasm loader: no real network or script execution can happen in jsdom, and
 * the element's contract - configure, wait for the instance, announce readiness - is what these
 * tests pin. The Basis branch is not covered: basisInitialize is a plain module export, and the
 * setup file has already loaded src/ against the real engine before any per-file vi.mock could
 * replace it (WasmModule's statics are spyable because the spies mutate the shared class).
 */
const stubWasmModule = () => {
    const setConfig = vi.spyOn(WasmModule, 'setConfig').mockImplementation(() => undefined);
    const getInstance = vi.spyOn(WasmModule, 'getInstance').mockImplementation((_name, callback) => callback({}));
    return { setConfig, getInstance };
};

/**
 * Stubs the engine's wasm loader for a module that fails to load: no instance ever arrives, and
 * `fail` reports the failure the way the engine does - only to the error handler of the
 * configuration the load started with, the first one set.
 *
 * The engine never loads a failed module again, so a failure lasts for the rest of this file, and
 * each test that fails a module gives it a name of its own.
 */
const stubFailingWasmModule = () => {
    const configs: Parameters<typeof WasmModule.setConfig>[1][] = [];
    const setConfig = vi.spyOn(WasmModule, 'setConfig').mockImplementation((_name, config) => {
        configs.push(config);
    });
    const getInstance = vi.spyOn(WasmModule, 'getInstance').mockImplementation(() => undefined);
    const fail = (error: string) => {
        expect(configs.length, 'no module load has started').toBeGreaterThan(0);
        configs[0]?.errorHandler?.(error);
    };
    return { setConfig, getInstance, fail };
};

describe('<pc-wasm>', () => {
    const { errors, warnings } = useGuard();

    it('loads the configured module, becomes ready and lets the app boot', async () => {
        const { setConfig, getInstance } = stubWasmModule();

        const handle = mount(
            '<pc-app backend="null">' +
                '<pc-wasm name="Ammo" glue="ammo.wasm.js" wasm="ammo.wasm.wasm" fallback="ammo.js"></pc-wasm>' +
                '</pc-app>'
        );

        await readyWithin(handle.get<WasmElement>('pc-wasm'));
        expect(setConfig).toHaveBeenCalledWith('Ammo', {
            glueUrl: 'ammo.wasm.js',
            wasmUrl: 'ammo.wasm.wasm',
            fallbackUrl: 'ammo.js',
            errorHandler: expect.any(Function)
        });
        expect(getInstance).toHaveBeenCalledTimes(1);

        // The app gates its boot on the module and still becomes ready afterwards
        await readyWithin(handle.get<AppElement>('pc-app'));
    });

    it("resolves whenReady('pc-wasm') instead of throwing", async () => {
        stubWasmModule();
        mount('<pc-wasm name="Ammo" glue="g.js" wasm="a.wasm" fallback="f.js"></pc-wasm>');

        // Threw for the whole pre-AsyncElement life of this element
        const moduleElement = await whenReady('pc-wasm');
        expect(moduleElement.tagName.toLowerCase()).toBe('pc-wasm');
    });

    it('reads attributes set after creation, not at construction', async () => {
        const { setConfig } = stubWasmModule();
        const handle = mount('<div></div>');

        // The old constructor-time read made exactly this sequence configure the engine with
        // null for every value before the attributes existed
        const moduleElement = document.createElement('pc-wasm');
        moduleElement.setAttribute('name', 'Ammo');
        moduleElement.setAttribute('glue', 'glue.js');
        moduleElement.setAttribute('wasm', 'ammo.wasm');
        moduleElement.setAttribute('fallback', 'fallback.js');
        expect(setConfig).not.toHaveBeenCalled();

        handle.container.appendChild(moduleElement);

        await readyWithin(moduleElement);
        expect(setConfig).toHaveBeenCalledWith('Ammo', {
            glueUrl: 'glue.js',
            wasmUrl: 'ammo.wasm',
            fallbackUrl: 'fallback.js',
            errorHandler: expect.any(Function)
        });
    });

    it('warns and never becomes ready without a name, but does not block the app', async () => {
        stubWasmModule();
        const handle = mount('<pc-app backend="null"><pc-wasm glue="g.js"></pc-wasm></pc-app>');

        // The broken module must not brick the whole application
        await readyWithin(handle.get<AppElement>('pc-app'));
        await expectNeverReady(handle.get<WasmElement>('pc-wasm'));
        warnings.expect("pc-wasm requires a 'name' attribute");
    });

    it('does not reload or re-arm readiness when re-inserted', async () => {
        const { setConfig, getInstance } = stubWasmModule();
        const handle = mount('<pc-wasm name="Ammo" glue="g.js" wasm="a.wasm" fallback="f.js"></pc-wasm>');
        const moduleElement = handle.get<WasmElement>('pc-wasm');
        await readyWithin(moduleElement);

        moduleElement.remove();
        handle.container.appendChild(moduleElement);

        // Wasm modules configure engine-global state that never unloads: still ready, no reload
        await readyWithin(moduleElement);
        expect(setConfig).toHaveBeenCalledTimes(1);
        expect(getInstance).toHaveBeenCalledTimes(1);
    });

    it('fires error, settles and lets the app boot when the module fails to load', async () => {
        const { fail } = stubFailingWasmModule();
        const handle = mount(
            '<pc-app backend="null">' +
                '<pc-wasm name="Missing" glue="missing.wasm.js" wasm="missing.wasm" fallback="missing.js"></pc-wasm>' +
                '</pc-app>'
        );
        const appElement = handle.get<AppElement>('pc-app');
        const moduleElement = handle.get<WasmElement>('pc-wasm');
        const events: ErrorEvent[] = [];
        moduleElement.addEventListener('error', (event) => events.push(event as ErrorEvent));

        // The app waits for the module until the engine reports the failure
        await expectNeverReady(appElement);
        fail("Failed to load script='missing.wasm.js'");

        // Both used to wait forever: the engine never calls back a module that failed to load
        await readyWithin(moduleElement);
        await readyWithin(appElement);
        expect(events.map((event) => event.message)).toEqual(["Failed to load script='missing.wasm.js'"]);
        expect(events[0].bubbles).toBe(false);
        errors.expect("pc-wasm failed to load module 'Missing' - Failed to load script='missing.wasm.js'");
    });

    it('fires error once when the engine reports the failure twice', async () => {
        const { fail } = stubFailingWasmModule();
        const handle = mount('<pc-wasm name="Aborted" glue="aborted.wasm.js" wasm="aborted.wasm"></pc-wasm>');
        const moduleElement = handle.get<WasmElement>('pc-wasm');
        const messages: string[] = [];
        moduleElement.addEventListener('error', (event) => messages.push((event as ErrorEvent).message));

        // The engine reports a binary that fails to load twice
        fail('wasm module aborted.');
        fail('wasm module aborted.');

        await readyWithin(moduleElement);
        expect(messages).toEqual(['wasm module aborted.']);
        errors.expect("pc-wasm failed to load module 'Aborted'");
    });

    it('fails every element waiting for the module, not only the one whose load the engine started', async () => {
        const { fail } = stubFailingWasmModule();
        const handle = mount(
            '<pc-wasm name="Shared" glue="shared.wasm.js" wasm="shared.wasm"></pc-wasm>' +
                '<pc-wasm name="Shared" glue="shared.wasm.js" wasm="shared.wasm"></pc-wasm>'
        );
        const moduleElements = handle.all<WasmElement>('pc-wasm');
        const failed: EventTarget[] = [];

        // error does not bubble, so one capture listener observes both elements
        handle.container.addEventListener('error', (event) => failed.push(event.target!), true);
        fail("Failed to load script='shared.wasm.js'");

        await Promise.all(moduleElements.map((element) => readyWithin(element)));
        expect(failed).toEqual(moduleElements);
        errors.expect("pc-wasm failed to load module 'Shared'", 2);
    });

    it('fails a later element for a failed module straight away, without asking the engine again', async () => {
        const { setConfig, getInstance, fail } = stubFailingWasmModule();
        const handle = mount('<pc-wasm name="Gone" glue="gone.wasm.js" wasm="gone.wasm"></pc-wasm>');
        fail("Failed to load script='gone.wasm.js'");
        await readyWithin(handle.get<WasmElement>('pc-wasm'));
        errors.expect("pc-wasm failed to load module 'Gone'");

        // The engine never loads a failed module again, even from other URLs, so an app that asks
        // for it later would otherwise wait for it forever
        const laterApp = document.createElement('pc-app');
        laterApp.setAttribute('backend', 'null');
        laterApp.innerHTML = '<pc-wasm name="Gone" glue="fixed.wasm.js" wasm="fixed.wasm"></pc-wasm>';
        const messages: string[] = [];
        laterApp.firstElementChild!.addEventListener('error', (event) => {
            messages.push((event as ErrorEvent).message);
        });
        handle.container.appendChild(laterApp);

        await readyWithin(laterApp);
        expect(messages).toEqual(["Failed to load script='gone.wasm.js'"]);
        expect(setConfig).toHaveBeenCalledTimes(1);
        expect(getInstance).toHaveBeenCalledTimes(1);
        errors.expect("pc-wasm failed to load module 'Gone'");
    });

    // Last in the file: it fails Ammo itself, and a failed module stays failed for the rest of it
    it("boots the app without physics when Ammo's binary fails to load after its glue ran", async () => {
        const globals = window as unknown as Record<string, unknown>;
        const { getInstance, fail } = stubFailingWasmModule();

        // Ammo's glue script publishes the module as a global as soon as it runs, before its
        // binary has loaded
        getInstance.mockImplementation((name) => {
            globals[name] = {};
        });
        const handle = mount(
            '<pc-app backend="null">' +
                '<pc-wasm name="Ammo" glue="ammo.wasm.js" wasm="missing.wasm" fallback="ammo.js"></pc-wasm>' +
                '</pc-app>'
        );
        expect(globals.Ammo).toEqual({});
        fail('wasm module aborted.');

        // The engine takes any defined Ammo for a loaded one: creating the physics world from the
        // half-loaded module threw out of app.start(), and the app never became ready
        await readyWithin(handle.get<AppElement>('pc-app'));
        expect(globals.Ammo).toBeUndefined();
        errors.expect("pc-wasm failed to load module 'Ammo' - wasm module aborted.");
    });
});
