import type { AudioListenerComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * The AudioListenerComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-audio-listener/ | `<pc-audio-listener>`} elements.
 * The AudioListenerComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link AudioListenerComponent} (`audiolistener`).
 *
 * @category Components
 */
class AudioListenerComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('audiolistener');
    }

    /**
     * Gets the underlying PlayCanvas audio listener component.
     * @returns The audio listener component.
     */
    get component(): AudioListenerComponent {
        return super.component as AudioListenerComponent;
    }
}

customElements.define('pc-audio-listener', AudioListenerComponentElement);

export { AudioListenerComponentElement };
