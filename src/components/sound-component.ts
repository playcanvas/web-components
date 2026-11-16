import type { SoundComponent } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

import { ComponentElement } from './component';

/**
 * The SoundComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-sound/ | `<pc-sound>`} elements.
 * The SoundComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link SoundComponent} (`sound`).
 *
 * @elementSummary The `<pc-sound>` element holds the `<pc-sound-slot>` children that play sounds at
 * its entity, along with the positional audio settings they share. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class SoundComponentElement extends ComponentElement<SoundComponent> {
    /**
     * Which algorithm to use to reduce the volume of the sound as it moves away from the listener.
     */
    declare distanceModel: 'exponential' | 'inverse' | 'linear';

    /**
     * The maximum distance from the listener at which audio falloff stops.
     */
    declare maxDistance: number;

    /**
     * The pitch of the sound.
     */
    declare pitch: number;

    /**
     * Whether the sounds play positionally. Positional sounds are attenuated by their distance from
     * the audio listener. Defaults to true.
     */
    declare positional: boolean;

    /**
     * The reference distance for reducing volume as the sound source moves further from the
     * listener. Defaults to 1.
     */
    declare refDistance: number;

    /**
     * The factor used in the falloff equation. Defaults to 1.
     */
    declare rollOffFactor: number;

    /**
     * The volume of the sound.
     */
    declare volume: number;

    /** @ignore */
    constructor() {
        super('sound');
    }

    /**
     * Gets the underlying PlayCanvas sound component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The sound component, or `null`.
     */
    get component(): SoundComponent | null {
        return super.component;
    }
}

defineAttributes(SoundComponentElement, 'component', {
    distanceModel: attr.oneOf(['exponential', 'inverse', 'linear'], 'linear'),
    maxDistance: attr.number(10000),
    pitch: attr.number(1),
    positional: attr.bool(true),
    refDistance: attr.number(1),
    rollOffFactor: attr.number(1),
    volume: attr.number(1)
});

globalThis.customElements?.define('pc-sound', SoundComponentElement);

export { SoundComponentElement };
