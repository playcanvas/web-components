import { WasmModule } from 'playcanvas';

class ModuleElement extends HTMLElement {
    private loadPromise: Promise<void>;

    constructor() {
        super();
        this.loadPromise = this.loadModule();
    }

    private async loadModule(): Promise<void> {
        const name = this.getAttribute('name')!;
        const glue = this.getAttribute('glue')!;
        const wasm = this.getAttribute('wasm')!;
        const fallback = this.getAttribute('fallback')!;

        WasmModule.setConfig(name, {
            glueUrl: glue,
            wasmUrl: wasm,
            fallbackUrl: fallback
        });

        await new Promise<void>((resolve) => {
            WasmModule.getInstance(name, () => resolve());
        });
    }

    public getLoadPromise(): Promise<void> {
        return this.loadPromise;
    }
}

customElements.define('pc-module', ModuleElement);

export { ModuleElement };
