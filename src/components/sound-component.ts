import { SoundComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a sound component in the PlayCanvas engine.
 *
 * @category Components
 */
class SoundComponentElement extends ComponentElement {
    private _pitch: number = 1;

    private _positional: boolean = false;

    private _volume: number = 1;

    constructor() {
        super('sound');
    }

    getInitialComponentData() {
        return {
            pitch: this._pitch,
            positional: this._positional,
            volume: this._volume
        };
    }

    /**
     * Gets the sound component.
     * @returns The sound component.
     */
    get component(): SoundComponent | null {
        return super.component as SoundComponent | null;
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
        return [...super.observedAttributes, 'pitch', 'positional', 'volume'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'pitch':
                this.pitch = parseFloat(newValue);
                break;
            case 'positional':
                this.positional = this.hasAttribute('positional');
                break;
            case 'volume':
                this.volume = parseFloat(newValue);
                break;
        }
    }
}

customElements.define('pc-sounds', SoundComponentElement);

export { SoundComponentElement };
