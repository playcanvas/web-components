import { AudioListenerComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a audio listener component in the PlayCanvas engine.
 *
 * @category Components
 */
class ListenerComponentElement extends ComponentElement {
    constructor() {
        super('audiolistener');
    }

    /**
     * Gets the audio listener component.
     * @returns The audio listener component.
     */
    get component(): AudioListenerComponent | null {
        return super.component as AudioListenerComponent | null;
    }
}

customElements.define('pc-listener', ListenerComponentElement);

export { ListenerComponentElement };
