import { basisInitialize, WasmModule } from 'playcanvas';

/**
 * The ModuleElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-module/ | `<pc-module>`} elements.
 * The ModuleElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Note that these attributes are read once when the element is created, so changing them later
 * has no effect.
 *
 * @attribute {string} name - The name of the WebAssembly module to configure, e.g. `Basis` or
 * `Ammo`.
 * @attribute {string} glue - The URL of the module's glue script.
 * @attribute {string} wasm - The URL of the module's WebAssembly binary.
 * @attribute {string} fallback - The URL of the module's asm.js fallback script, used when
 * WebAssembly is unavailable.
 */
class ModuleElement extends HTMLElement {
    private loadPromise: Promise<void>;

    /** @ignore */
    constructor() {
        super();
        this.loadPromise = this.loadModule();
    }

    private async loadModule(): Promise<void> {
        const name = this.getAttribute('name')!;
        const glueUrl = this.getAttribute('glue')!;
        const wasmUrl = this.getAttribute('wasm')!;
        const fallbackUrl = this.getAttribute('fallback')!;
        const config = { glueUrl, wasmUrl, fallbackUrl };

        if (name === 'Basis') {
            basisInitialize(config);
        } else {
            WasmModule.setConfig(name, config);

            await new Promise<void>((resolve) => {
                WasmModule.getInstance(name, () => resolve());
            });
        }
    }

    public getLoadPromise(): Promise<void> {
        return this.loadPromise;
    }
}

customElements.define('pc-module', ModuleElement);

export { ModuleElement };
