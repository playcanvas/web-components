import { basisInitialize, WasmModule } from 'playcanvas';

import { AsyncElement } from './async-element';

/**
 * The WasmElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-wasm/ | `<pc-wasm>`}
 * elements. The WasmElement interface also inherits the properties and methods of the
 * {@link AsyncElement} interface.
 *
 * The attributes are read once, when the module starts loading - on the element's first
 * connection, or earlier if a containing `<pc-app>` boots first and collects it - so changing
 * them later has no effect. The element becomes ready once the module has loaded. WebAssembly
 * modules configure engine-global state that never unloads, so readiness is not re-armed by
 * removing the element, and a re-inserted element does not load again.
 *
 * A `<pc-wasm>` without a `name` warns and never becomes ready; a containing `<pc-app>` still
 * boots.
 *
 * @attribute {string} name - The name of the WebAssembly module to configure, e.g. `Basis` or
 * `Ammo`.
 * @attribute {string} glue - The URL of the module's glue script.
 * @attribute {string} wasm - The URL of the module's WebAssembly binary.
 * @attribute {string} fallback - The URL of the module's asm.js fallback script, used when
 * WebAssembly is unavailable.
 */
class WasmElement extends AsyncElement {
    private _loadPromise: Promise<void> | null = null;

    connectedCallback() {
        this._getLoadPromise();
    }

    private async _loadModule(): Promise<void> {
        const name = this.getAttribute('name');
        if (!name) {
            console.warn("pc-wasm requires a 'name' attribute - no module was configured");
            return;
        }

        const config = {
            glueUrl: this.getAttribute('glue') ?? undefined,
            wasmUrl: this.getAttribute('wasm') ?? undefined,
            fallbackUrl: this.getAttribute('fallback') ?? undefined
        };

        if (name === 'Basis') {
            basisInitialize(config);
        } else {
            WasmModule.setConfig(name, config);

            await new Promise<void>((resolve) => {
                WasmModule.getInstance(name, () => resolve());
            });
        }

        this._onReady();
    }

    /**
     * Returns the promise that settles when the module has loaded, starting the load if it has
     * not already started - a containing `<pc-app>` boots in document order, so it may collect
     * this element before the element's own connectedCallback has run. A missing `name` resolves
     * the promise without configuring anything, so a misconfigured module never blocks the app.
     *
     * @returns The load promise.
     * @internal
     */
    _getLoadPromise(): Promise<void> {
        if (!this._loadPromise) {
            this._loadPromise = this._loadModule();
        }
        return this._loadPromise;
    }
}

customElements.define('pc-wasm', WasmElement);

export { WasmElement };
