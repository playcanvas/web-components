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
 * @summary The `<pc-audio-listener>` element makes its entity the point from which positional
 * sounds are heard, typically the entity holding the `<pc-camera>`. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
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
