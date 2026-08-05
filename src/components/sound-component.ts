import type { SoundComponent } from 'playcanvas';

import { parseBool, parseEnum, parseNumber } from '../parse';

import { ComponentElement } from './component';

/**
 * The SoundComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-sounds/ | `<pc-sounds>`} elements.
 * The SoundComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class SoundComponentElement extends ComponentElement {
    private _distanceModel: 'exponential' | 'inverse' | 'linear' = 'linear';

    private _maxDistance = 10000;

    private _pitch = 1;

    private _positional = false;

    private _refDistance = 1;

    private _rollOffFactor = 1;

    private _volume = 1;

    /** @ignore */
    constructor() {
        super('sound');
    }

    getInitialComponentData() {
        return {
            distanceModel: this._distanceModel,
            maxDistance: this._maxDistance,
            pitch: this._pitch,
            positional: this._positional,
            refDistance: this._refDistance,
            rollOffFactor: this._rollOffFactor,
            volume: this._volume
        };
    }

    /**
     * Gets the underlying PlayCanvas sound component.
     * @returns The sound component.
     */
    get component(): SoundComponent {
        return super.component as SoundComponent;
    }

    /**
     * Sets which algorithm to use to reduce the volume of the sound as it moves away from the listener.
     * @param value - The distance model.
     */
    set distanceModel(value: 'exponential' | 'inverse' | 'linear') {
        this._distanceModel = value;
        if (this.component) {
            this.component.distanceModel = value;
        }
    }

    /**
     * Gets which algorithm to use to reduce the volume of the sound as it moves away from the listener.
     * @returns The distance model.
     */
    get distanceModel(): 'exponential' | 'inverse' | 'linear' {
        return this._distanceModel;
    }

    /**
     * Sets the maximum distance from the listener at which audio falloff stops.
     * @param value - The max distance.
     */
    set maxDistance(value: number) {
        this._maxDistance = value;
        if (this.component) {
            this.component.maxDistance = value;
        }
    }

    /**
     * Gets the maximum distance from the listener at which audio falloff stops.
     * @returns The max distance.
     */
    get maxDistance() {
        return this._maxDistance;
    }

    /**
     * Sets the pitch of the sound.
     * @param value - The pitch.
     */
    set pitch(value: number) {
        this._pitch = value;
        if (this.component) {
            this.component.pitch = value;
        }
    }

    /**
     * Gets the pitch of the sound.
     * @returns The pitch.
     */
    get pitch() {
        return this._pitch;
    }

    /**
     * Sets the positional flag of the sound.
     * @param value - The positional flag.
     */
    set positional(value: boolean) {
        this._positional = value;
        if (this.component) {
            this.component.positional = value;
        }
    }

    /**
     * Gets the positional flag of the sound.
     * @returns The positional flag.
     */
    get positional() {
        return this._positional;
    }

    /**
     * Sets the reference distance for reducing volume as the sound source moves further from the listener. Defaults to 1.
     * @param value - The ref distance.
     */
    set refDistance(value: number) {
        this._refDistance = value;
        if (this.component) {
            this.component.refDistance = value;
        }
    }

    /**
     * Gets the reference distance for reducing volume as the sound source moves further from the listener.
     * @returns The ref distance.
     */
    get refDistance() {
        return this._refDistance;
    }

    /**
     * Sets the factor used in the falloff equation. Defaults to 1.
     * @param value - The roll-off factor.
     */
    set rollOffFactor(value: number) {
        this._rollOffFactor = value;
        if (this.component) {
            this.component.rollOffFactor = value;
        }
    }

    /**
     * Gets the factor used in the falloff equation.
     * @returns The roll-off factor.
     */
    get rollOffFactor() {
        return this._rollOffFactor;
    }

    /**
     * Sets the volume of the sound.
     * @param value - The volume.
     */
    set volume(value: number) {
        this._volume = value;
        if (this.component) {
            this.component.volume = value;
        }
    }

    /**
     * Gets the volume of the sound.
     * @returns The volume.
     */
    get volume() {
        return this._volume;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'distance-model',
            'max-distance',
            'pitch',
            'positional',
            'ref-distance',
            'roll-off-factor',
            'volume'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'distance-model':
                this.distanceModel = parseEnum(newValue, ['exponential', 'inverse', 'linear'], 'linear', name);
                break;
            case 'max-distance':
                this.maxDistance = parseNumber(newValue, 10000, name);
                break;
            case 'pitch':
                this.pitch = parseNumber(newValue, 1, name);
                break;
            case 'positional':
                this.positional = parseBool(newValue, false);
                break;
            case 'ref-distance':
                this.refDistance = parseNumber(newValue, 1, name);
                break;
            case 'roll-off-factor':
                this.rollOffFactor = parseNumber(newValue, 1, name);
                break;
            case 'volume':
                this.volume = parseNumber(newValue, 1, name);
                break;
        }
    }
}

customElements.define('pc-sounds', SoundComponentElement);

export { SoundComponentElement };
