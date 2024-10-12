import { registerScript } from 'playcanvas';

// ScriptComponentElement.js
class ScriptComponentElement extends HTMLElement {
    constructor() {
        super();
        this._scriptInstance = null;
        this.entity = null;
    }

    async connectedCallback() {
        // Find the closest pc-entity element
        const entityElement = this.closest('pc-entity');
        if (entityElement && entityElement.entity) {
            this.entity = entityElement.entity;

            // Ensure the script component is added
            if (!this.entity.script) {
                this.entity.addComponent('script');
            }

            const src = this.getAttribute('src');
            if (src) {
                await this._loadAndRegisterScript(src);

                // Create an instance of the script on the entity
                const scriptName = this._scriptName;
                this._scriptInstance = this.entity.script.create(scriptName);
            } else {
                console.error('Attribute "src" is required for pc-script.');
            }
        } else {
            console.error('pc-script should be a child of pc-entity.');
        }
    }

    disconnectedCallback() {
        // Remove the script instance
        if (this._scriptInstance && this.entity && this.entity.script) {
            this.entity.script.destroy(this._scriptInstance);
            this._scriptInstance = null;
        }
    }

    async _loadAndRegisterScript(src) {
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
}

export { ScriptComponentElement };
