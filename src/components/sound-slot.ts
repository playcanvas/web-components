import { Asset, SoundSlot } from 'playcanvas';

import { AppElement } from '../app';
import { SoundComponentElement } from './sound-component';
import { AssetElement } from '../asset';

class SoundSlotElement extends HTMLElement {
    private _asset: Asset | null = null;

    private _autoPlay: boolean = false;

    private _duration: number | null = null;

    private _loop: boolean = false;

    private _name: string = '';

    private _overlap: boolean = false;

    private _pitch: number = 1;

    private _startTime: number = 0;

    private _volume: number = 1;

    soundSlot: SoundSlot | null = null;

    connectedCallback() {
        const soundElement = this.closest('pc-sound') as SoundComponentElement;

        if (!soundElement) {
            console.warn('pc-sound-slot must be used within a pc-sound element');
            return;
        }

        const options = {
            autoPlay: this._autoPlay,
            loop: this._loop,
            overlap: this._overlap,
            pitch: this._pitch,
            startTime: this._startTime,
            volume: this._volume
        } as any;
        if (this._asset) {
            options.asset = this._asset.id;
        }
        if (this._duration) {
            options.duration = this._duration;
        }
        this.soundSlot = soundElement.component!.addSlot(this._name, options);

        // on appInitialized, set the asset
        const appElement = this.closest('pc-app') as AppElement;
        appElement.addEventListener('appInitialized', () => {
            this.asset = this._asset;
            this.soundSlot!.play();
        });
    }

    disconnectedCallback() {
        const soundElement = this.closest('pc-sound') as SoundComponentElement;

        if (!soundElement) {
            console.warn('pc-sound-slot must be used within a pc-sound element');
            return;
        }

        soundElement.component!.removeSlot(this._name);
    }

    set asset(value: Asset | null) {
        this._asset = value;
        if (this.soundSlot) {
            this.soundSlot.asset = value ? value.id : 0; // the 0 should be null - fix engine types
        }
    }

    get asset() {
        return this._asset;
    }

    set autoPlay(value: boolean) {
        this._autoPlay = value;
        if (this.soundSlot) {
            this.soundSlot.autoPlay = value;
        }
    }

    get autoPlay() {
        return this._autoPlay;
    }

    set duration(value: number) {
        this._duration = value;
        if (this.soundSlot) {
            this.soundSlot.duration = value;
        }
    }

    get duration() {
        return this._duration as number;
    }

    set loop(value: boolean) {
        this._loop = value;
        if (this.soundSlot) {
            this.soundSlot.loop = value;
        }
    }

    get loop() {
        return this._loop;
    }

    set name(value: string) {
        this._name = value;
        if (this.soundSlot) {
            this.soundSlot.name = value;
        }
    }

    get name() {
        return this._name;
    }

    set overlap(value: boolean) {
        this._overlap = value;
        if (this.soundSlot) {
            this.soundSlot.overlap = value;
        }
    }
    
    get overlap() {
        return this._overlap;
    }

    set pitch(value: number) {
        this._pitch = value;
        if (this.soundSlot) {
            this.soundSlot.pitch = value;
        }
    }

    get pitch() {
        return this._pitch;
    }

    set startTime(value: number) {
        this._startTime = value;
        if (this.soundSlot) {
            this.soundSlot.startTime = value;
        }
    }

    get startTime() {
        return this._startTime;
    }

    set volume(value: number) {
        this._volume = value;
        if (this.soundSlot) {
            this.soundSlot.volume = value;
        }
    }

    get volume() {
        return this._volume;
    }

    static get observedAttributes() {
        return ['asset', 'autoPlay', 'duration', 'loop', 'name', 'overlap', 'pitch', 'startTime', 'volume'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'asset':
                const appElement = this.closest('pc-app') as AppElement;
                const assetElement = appElement.querySelector(`pc-asset[id="${newValue}"]`) as AssetElement;
                if (assetElement && assetElement.asset) {
                    assetElement
                    this.asset = assetElement.asset;
                } else {
                    console.warn(`Asset with id "${newValue}" not found`);
                }
                break;
            case 'duration':
                this.duration = parseFloat(newValue);
                break;
            case 'loop':
                this.loop = newValue === 'true';
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'overlap':
                this.overlap = newValue === 'true';
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

export { SoundSlotElement };
