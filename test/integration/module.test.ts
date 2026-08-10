import { WasmModule } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { whenReady } from '../../src/index';
import type { ModuleElement } from '../../src/module';
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

describe('<pc-module>', () => {
    const { warnings } = useGuard();

    it('loads the configured module, becomes ready and lets the app boot', async () => {
        const { setConfig, getInstance } = stubWasmModule();

        const handle = mount(
            '<pc-app backend="null">' +
                '<pc-module name="Ammo" glue="ammo.wasm.js" wasm="ammo.wasm.wasm" fallback="ammo.js"></pc-module>' +
                '</pc-app>'
        );

        await readyWithin(handle.get<ModuleElement>('pc-module'));
        expect(setConfig).toHaveBeenCalledWith('Ammo', {
            glueUrl: 'ammo.wasm.js',
            wasmUrl: 'ammo.wasm.wasm',
            fallbackUrl: 'ammo.js'
        });
        expect(getInstance).toHaveBeenCalledTimes(1);

        // The app gates its boot on the module and still becomes ready afterwards
        await readyWithin(handle.get<AppElement>('pc-app'));
    });

    it("resolves whenReady('pc-module') instead of throwing", async () => {
        stubWasmModule();
        mount('<pc-module name="Ammo" glue="g.js" wasm="a.wasm" fallback="f.js"></pc-module>');

        // Threw for the whole pre-AsyncElement life of this element
        const moduleElement = await whenReady('pc-module');
        expect(moduleElement.tagName.toLowerCase()).toBe('pc-module');
    });

    it('reads attributes set after creation, not at construction', async () => {
        const { setConfig } = stubWasmModule();
        const handle = mount('<div></div>');

        // The old constructor-time read made exactly this sequence configure the engine with
        // null for every value before the attributes existed
        const moduleElement = document.createElement('pc-module');
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
        const handle = mount('<pc-app backend="null"><pc-module glue="g.js"></pc-module></pc-app>');

        // The broken module must not brick the whole application
        await readyWithin(handle.get<AppElement>('pc-app'));
        await expectNeverReady(handle.get<ModuleElement>('pc-module'));
        warnings.expect("pc-module requires a 'name' attribute");
    });

    it('does not reload or re-arm readiness when re-inserted', async () => {
        const { setConfig, getInstance } = stubWasmModule();
        const handle = mount('<pc-module name="Ammo" glue="g.js" wasm="a.wasm" fallback="f.js"></pc-module>');
        const moduleElement = handle.get<ModuleElement>('pc-module');
        await readyWithin(moduleElement);

        moduleElement.remove();
        handle.container.appendChild(moduleElement);

        // Wasm modules configure engine-global state that never unloads: still ready, no reload
        await readyWithin(moduleElement);
        expect(setConfig).toHaveBeenCalledTimes(1);
        expect(getInstance).toHaveBeenCalledTimes(1);
    });
});
