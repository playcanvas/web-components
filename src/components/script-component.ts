import { ScriptComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a script component in the PlayCanvas engine.
 *
 * @category Components
 */
class ScriptComponentElement extends ComponentElement {
    constructor() {
        super('script');
    }

    /**
     * Gets the script component.
     * @returns The script component.
     */
    get component(): ScriptComponent | null {
        return super.component as ScriptComponent | null;
    }
}

customElements.define('pc-scripts', ScriptComponentElement);

export { ScriptComponentElement };
