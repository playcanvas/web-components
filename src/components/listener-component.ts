import { AudioListenerComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * The ListenerComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-listener/ | `<pc-listener>`} elements.
 * The ListenerComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ListenerComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('audiolistener');
    }

    /**
     * Gets the underlying PlayCanvas audio listener component.
     * @returns The audio listener component.
     */
    get component(): AudioListenerComponent | null {
        return super.component as AudioListenerComponent | null;
    }
}

customElements.define('pc-listener', ListenerComponentElement);

export { ListenerComponentElement };
