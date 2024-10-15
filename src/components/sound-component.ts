import { SoundComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { SoundSlotElement } from './sound-slot';

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

    get component(): SoundComponent | null {
        return super.component as SoundComponent | null;
    }

    set pitch(value: number) {
        this._pitch = value;
        if (this.component) {
            this.component.pitch = value;
        }
    }

    get pitch() {
        return this._pitch;
    }

    set positional(value: boolean) {
        this._positional = value;
        if (this.component) {
            this.component.positional = value;
        }
    }

    get positional() {
        return this._positional;
    }

    set volume(value: number) {
        this._volume = value;
        if (this.component) {
            this.component.volume = value;
        }
    }

    get volume() {
        return this._volume;
    }

    static get observedAttributes() {
        return ['pitch', 'positional', 'volume'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
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

customElements.define('pc-sound', SoundComponentElement);
customElements.define('pc-sound-slot', SoundSlotElement);

export { SoundComponentElement };
