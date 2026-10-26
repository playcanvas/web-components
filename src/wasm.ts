import { basisInitialize, WasmModule } from 'playcanvas';

import { AsyncElement } from './async-element';

/**
 * A WebAssembly module's failure to load, shared by every element that loads the module.
 */
type ModuleFailure = {
    /** The engine's error, once the module has failed to load. */
    error?: string;

    /** Resolves with the engine's error when the module fails to load. */
    failed: Promise<string>;

    /** Records the failure. Given to the engine as the module's error handler. */
    fail: (error: string) => void;
};

/**
 * The failure record of each WebAssembly module, by module name. The engine reports a module that
 * fails to load only to the error handler of the configuration its load started with, and never
 * loads that module again: the elements already waiting for it are never called back, and an
 * element that asks for it later is only queued behind them. Keeping the failure per module lets
 * every one of those elements fail with it.
 */
const moduleFailures = new Map<string, ModuleFailure>();

/**
 * Returns the failure record of a WebAssembly module, creating it on first use - which is just
 * before the module's load starts.
 *
 * @param name - The name of the module.
 * @returns The module's failure record.
 */
const getModuleFailure = (name: string): ModuleFailure => {
    let failure = moduleFailures.get(name);
    if (!failure) {
        // A failed load puts the module's global back as it found it. A glue script can publish
        // the module there before its binary has loaded - Ammo's does - and the engine takes any
        // defined Ammo for a loaded one, so the app would otherwise throw creating its physics.
        const globals = window as unknown as Record<string, unknown>;
        const previous = globals[name];

        let resolveFailed!: (error: string) => void;
        const record: ModuleFailure = {
            failed: new Promise<string>((resolve) => {
                resolveFailed = resolve;
            }),
            fail: (error) => {
                globals[name] = previous;

                // The engine can report one failure more than once - it does for a binary that
                // fails to load - so the first report stands
                record.error ??= error;
                resolveFailed(record.error);
            }
        };
        failure = record;
        moduleFailures.set(name, failure);
    }
    return failure;
};

/**
 * The WasmElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-wasm/ | `<pc-wasm>`}
 * elements. The WasmElement interface also inherits the properties and methods of the
 * {@link AsyncElement} interface.
 *
 * The attributes are read once, when the module starts loading - on the element's first
 * connection, or earlier if a containing `<pc-app>` boots first and collects it - so changing
 * them later has no effect. The element becomes ready once the module has loaded, or has failed
 * to load. WebAssembly modules configure engine-global state that never unloads, so readiness is
 * not re-armed by removing the element, and a re-inserted element does not load again.
 *
 * A module that fails to load fires `error` and logs the failure, and a containing `<pc-app>`
 * boots without it. The engine never tries to load a failed module again, so every `<pc-wasm>`
 * for that module fails with it - one already waiting for the module when it fails, and one added
 * later, which fails straight away.
 *
 * A `<pc-wasm>` without a `name` warns and never becomes ready; a containing `<pc-app>` still
 * boots.
 *
 * @elementSummary The `<pc-wasm>` element loads a WebAssembly module the engine needs before the
 * application starts — `Ammo` for physics, `Basis` or `DracoDecoderModule` for compressed assets.
 * Must be a direct child of `<pc-app>`.
 *
 * @attribute {string} name - The name of the WebAssembly module to configure, e.g. `Basis` or
 * `Ammo`.
 * @attribute {string} glue - The URL of the module's glue script.
 * @attribute {string} wasm - The URL of the module's WebAssembly binary.
 * @attribute {string} fallback - The URL of the module's asm.js fallback script, used when
 * WebAssembly is unavailable.
 *
 * @fires {ErrorEvent} error - Fired when the module fails to load, with the engine's error in
 * `message`. Does not bubble. The element still becomes ready — readiness means the load settled,
 * not that it succeeded.
 *
 * @category Resources
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
            const failure = getModuleFailure(name);

            // A module that has already failed fails this element straight away, rather than
            // queueing it behind a load that never completes
            const error =
                failure.error ??
                (await new Promise<string | null>((resolve) => {
                    WasmModule.setConfig(name, { ...config, errorHandler: failure.fail });
                    WasmModule.getInstance(name, () => resolve(null));
                    failure.failed.then(resolve);
                }));

            // Logged here because the engine no longer logs a failure once it has an error handler
            if (error !== null) {
                console.error(`pc-wasm failed to load module '${name}' - ${error}`);
                this.dispatchEvent(new ErrorEvent('error', { message: error }));
            }
        }

        // A failed module settles readiness too, mirroring pc-asset: readiness means the load
        // settled, not that it succeeded
        this._onReady();
    }

    /**
     * Returns the promise that settles when the module has loaded or failed to load, starting the
     * load if it has not already started - a containing `<pc-app>` boots in document order, so it
     * may collect this element before the element's own connectedCallback has run. A missing
     * `name` resolves the promise without configuring anything, so neither a misconfigured module
     * nor a failed one ever blocks the app.
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

globalThis.customElements?.define('pc-wasm', WasmElement);

export { WasmElement };
