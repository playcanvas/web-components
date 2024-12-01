import { AudioListenerComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * The ListenerComponentElement interface provides properties and methods for manipulating
 * `<pc-listener>` elements. The ListenerComponentElement interface also inherits the properties
 * and methods of the {@link HTMLElement} interface.
 *
 * @category Components
 */
class ListenerComponentElement extends ComponentElement {
    /** @ignore */
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
