import { SoundSlot } from 'playcanvas';

import { AppElement } from '../app';
import { SoundComponentElement } from './sound-component';
import { AssetElement } from '../asset';

/**
 * Represents a sound slot in the PlayCanvas engine.
 */
class SoundSlotElement extends HTMLElement {
    private _asset: string = '';

    private _autoPlay: boolean = false;

    private _duration: number | null = null;

    private _loop: boolean = false;

    private _name: string = '';

    private _overlap: boolean = false;

    private _pitch: number = 1;

    private _startTime: number = 0;

    private _volume: number = 1;

    /**
     * The sound slot.
     */
    soundSlot: SoundSlot | null = null;

    getAsset() {
        const assetElement = document.querySelector(`pc-asset[id="${this._asset}"]`) as AssetElement;
        return assetElement!.asset;
    }

    async connectedCallback() {
        const appElement = this.closest('pc-app') as AppElement | null;
        if (!appElement) {
            console.error(`${this.tagName.toLowerCase()} should be a descendant of pc-app`);
            return;
        }

        await appElement.getApplication();

        const options = {
            autoPlay: this._autoPlay,
            loop: this._loop,
            overlap: this._overlap,
            pitch: this._pitch,
            startTime: this._startTime,
            volume: this._volume
        } as any;
        if (this._duration) {
            options.duration = this._duration;
        }
        this.soundSlot = this.soundElement!.component!.addSlot(this._name, options);
        this.asset = this._asset;
        this.soundSlot!.play();
    }

    disconnectedCallback() {
        this.soundElement!.component!.removeSlot(this._name);
    }

    protected get soundElement(): SoundComponentElement | null {
        const soundElement = this.parentElement as SoundComponentElement;

        if (!(soundElement instanceof SoundComponentElement)) {
            console.warn('pc-sound-slot must be a direct child of a pc-sound element');
            return null;
        }

        return soundElement;
    }

    /**
     * Sets the asset of the sound slot.
     * @param value - The asset.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.soundSlot) {
            const id = this.getAsset()?.id;
            if (id) {
                this.soundSlot.asset = id;
            }
        }
    }

    /**
     * Gets the asset of the sound slot.
     * @returns The asset.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets the auto play flag of the sound slot.
     * @param value - The auto play flag.
     */
    set autoPlay(value: boolean) {
        this._autoPlay = value;
        if (this.soundSlot) {
            this.soundSlot.autoPlay = value;
        }
    }

    /**
     * Gets the auto play flag of the sound slot.
     * @returns The auto play flag.
     */
    get autoPlay() {
        return this._autoPlay;
    }

    /**
     * Sets the duration of the sound slot.
     * @param value - The duration.
     */
    set duration(value: number) {
        this._duration = value;
        if (this.soundSlot) {
            this.soundSlot.duration = value;
        }
    }

    /**
     * Gets the duration of the sound slot.
     * @returns The duration.
     */
    get duration() {
        return this._duration as number;
    }

    /**
     * Sets the loop flag of the sound slot.
     * @param value - The loop flag.
     */
    set loop(value: boolean) {
        this._loop = value;
        if (this.soundSlot) {
            this.soundSlot.loop = value;
        }
    }

    /**
     * Gets the loop flag of the sound slot.
     * @returns The loop flag.
     */
    get loop() {
        return this._loop;
    }

    /**
     * Sets the name of the sound slot.
     * @param value - The name.
     */
    set name(value: string) {
        this._name = value;
        if (this.soundSlot) {
            this.soundSlot.name = value;
        }
    }

    /**
     * Gets the name of the sound slot.
     * @returns The name.
     */
    get name() {
        return this._name;
    }

    /**
     * Sets the overlap flag of the sound slot.
     * @param value - The overlap flag.
     */
    set overlap(value: boolean) {
        this._overlap = value;
        if (this.soundSlot) {
            this.soundSlot.overlap = value;
        }
    }

    /**
     * Gets the overlap flag of the sound slot.
     * @returns The overlap flag.
     */
    get overlap() {
        return this._overlap;
    }

    /**
     * Sets the pitch of the sound slot.
     * @param value - The pitch.
     */
    set pitch(value: number) {
        this._pitch = value;
        if (this.soundSlot) {
            this.soundSlot.pitch = value;
        }
    }

    /**
     * Gets the pitch of the sound slot.
     * @returns The pitch.
     */
    get pitch() {
        return this._pitch;
    }

    /**
     * Sets the start time of the sound slot.
     * @param value - The start time.
     */
    set startTime(value: number) {
        this._startTime = value;
        if (this.soundSlot) {
            this.soundSlot.startTime = value;
        }
    }

    /**
     * Gets the start time of the sound slot.
     * @returns The start time.
     */
    get startTime() {
        return this._startTime;
    }

    /**
     * Sets the volume of the sound slot.
     * @param value - The volume.
     */
    set volume(value: number) {
        this._volume = value;
        if (this.soundSlot) {
            this.soundSlot.volume = value;
        }
    }

    /**
     * Gets the volume of the sound slot.
     * @returns The volume.
     */
    get volume() {
        return this._volume;
    }

    static get observedAttributes() {
        return ['asset', 'autoPlay', 'duration', 'loop', 'name', 'overlap', 'pitch', 'startTime', 'volume'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'duration':
                this.duration = parseFloat(newValue);
                break;
            case 'loop':
                this.loop = this.hasAttribute('loop');
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'overlap':
                this.overlap = this.hasAttribute('overlap');
                break;
            case 'pitch':
                this.pitch = parseFloat(newValue);
                break;
            case 'startTime':
                this.startTime = parseFloat(newValue);
                break;
            case 'volume':
                this.volume = parseFloat(newValue);
                break;
        }
    }
}

customElements.define('pc-sound-slot', SoundSlotElement);

export { SoundSlotElement };
