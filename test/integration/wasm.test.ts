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

describe('<pc-wasm>', () => {
    const { warnings } = useGuard();

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
            fallbackUrl: 'ammo.js'
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
            fallbackUrl: 'fallback.js'
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
});
