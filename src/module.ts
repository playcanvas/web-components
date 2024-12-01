import { basisInitialize, WasmModule } from 'playcanvas';

/**
 * The ModuleElement interface provides properties and methods for manipulating
 * `<pc-module>` elements. The ModuleElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
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
        const glue = this.getAttribute('glue')!;
        const wasm = this.getAttribute('wasm')!;
        const fallback = this.getAttribute('fallback')!;

        if (name === 'Basis') {
            basisInitialize({
                glueUrl: glue,
                wasmUrl: wasm,
                fallbackUrl: fallback
            });
        } else {
            WasmModule.setConfig(name, {
                glueUrl: glue,
                wasmUrl: wasm,
                fallbackUrl: fallback
            });

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
