import { basisInitialize, WasmModule } from 'playcanvas';

/**
 * The ModuleElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-module/ | `<pc-module>`} elements.
 * The ModuleElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
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
