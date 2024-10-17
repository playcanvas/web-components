import { registerScript, ScriptComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a script component in the PlayCanvas engine.
 *
 * @category Components
 */
class ScriptComponentElement extends ComponentElement {
    private _scriptName = '';

    constructor() {
        super('script');
    }

    async connectedCallback() {
        super.connectedCallback();

        const src = this.getAttribute('src');
        if (src) {
            await this._loadAndRegisterScript(src);

            // Create an instance of the script on the entity
            const scriptName = this._scriptName;
            this.component!.create(scriptName);
        }
    }

    async _loadAndRegisterScript(src: string) {
        try {
            const module = await import(src);
            const ScriptClass = module.default || Object.values(module)[0];
            if (ScriptClass) {
                // Get the script name from the class
                this._scriptName = ScriptClass.name;

                // Register the script with PlayCanvas
                registerScript(ScriptClass, this._scriptName);
            } else {
                throw new Error(`No script class found in module "${src}".`);
            }
        } catch (error) {
            console.error(`Failed to load script module from "${src}":`, error);
        }
    }

    get component(): ScriptComponent | null {
        return super.component as ScriptComponent | null;
    }
}

customElements.define('pc-script', ScriptComponentElement);

export { ScriptComponentElement };
