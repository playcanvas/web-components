import type { SoundSlot } from 'playcanvas';

import { useAsset } from '../asset';
import { AsyncElement } from '../async-element';
import { parseBool, parseNumber } from '../parse';

import { SoundComponentElement } from './sound-component';

/**
 * The SoundSlotElement interface provides properties and methods for manipulating
 * `<pc-sound-slot>` elements. The SoundSlotElement interface also inherits the properties and
 * methods of the {@link AsyncElement} interface.
 */
class SoundSlotElement extends AsyncElement {
    private _asset = '';

    private _autoPlay = false;

    private _duration: number | null = null;

    private _loop = false;

    private _name = '';

    private _overlap = false;

    private _pitch = 1;

    private _startTime = 0;

    private _volume = 1;

    /**
     * The `<pc-sound>` this slot was added to, captured at connect time.
     *
     * `disconnectedCallback` cannot rediscover it: by the time the element is disconnected its
     * `parentElement` is already `null`, so a lookup would both fail to find the component and
     * emit a misleading "must be a direct child" warning for what is an ordinary removal.
     */
    private _soundElement: SoundComponentElement | null = null;

    /**
     * Incremented on every connect and disconnect, and captured by connectedCallback on entry —
     * a resume from an await abandons itself if the value has moved on, so a stale callback can
     * neither act on a torn-down tree nor add its slot alongside a re-inserted element's own
     * callback.
     */
    private _connectionGeneration = 0;

    /**
     * The sound slot.
     */
    soundSlot: SoundSlot | null = null;

    async connectedCallback() {
        const generation = ++this._connectionGeneration;

        const soundElement = this.soundElement;
        await soundElement?.ready();

        // The element may have been removed (perhaps re-inserted, which runs a callback of its
        // own), or its parent torn down, while we were waiting. A <pc-app> disconnects before
        // its children, so by the time we resume the component can already be gone - see the
        // matching guard in disconnectedCallback below.
        const component = soundElement?.component;
        if (generation !== this._connectionGeneration || !component) {
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
        if (this._duration) {
            options.duration = this._duration;
        }

        this._soundElement = soundElement;
        this.soundSlot = component.addSlot(this._name, options);
        this.asset = this._asset;
        if (this._autoPlay) {
            this.soundSlot!.play();
        }

        this._onReady();
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback still suspended on an await
        this._connectionGeneration++;

        // Uses the cached parent rather than a fresh lookup, since parentElement is already null
        // by now. The component itself is null if the parent <pc-sound> (or the whole <pc-app>) is
        // being torn down — parents disconnect first and have already removed the component.
        this._soundElement?.component?.removeSlot(this._name);
        this._soundElement = null;
        this.soundSlot = null;
        this._resetReady();
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
     * Sets the id of the `pc-asset` to use for the sound slot.
     * @param value - The asset.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.soundSlot) {
            const id = useAsset(value)?.id;
            if (id) {
                this.soundSlot.asset = id;
            }
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the sound slot.
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
     * Sets the duration of the sound slot, in seconds (or `null` to play the whole clip).
     * @param value - The duration.
     */
    set duration(value: number | null) {
        this._duration = value;
        if (this.soundSlot && value !== null) {
            this.soundSlot.duration = value;
        }
    }

    /**
     * Gets the duration of the sound slot.
     * @returns The duration.
     */
    get duration(): number | null {
        return this._duration;
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
        return ['asset', 'auto-play', 'duration', 'loop', 'name', 'overlap', 'pitch', 'start-time', 'volume'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'auto-play':
                this.autoPlay = parseBool(newValue, false);
                break;
            case 'duration':
                this.duration = parseNumber(newValue, null, name);
                break;
            case 'loop':
                this.loop = parseBool(newValue, false);
                break;
            case 'name':
                this.name = newValue ?? '';
                break;
            case 'overlap':
                this.overlap = parseBool(newValue, false);
                break;
            case 'pitch':
                this.pitch = parseNumber(newValue, 1, name);
                break;
            case 'start-time':
                this.startTime = parseNumber(newValue, 0, name);
                break;
            case 'volume':
                this.volume = parseNumber(newValue, 1, name);
                break;
        }
    }
}

customElements.define('pc-sound-slot', SoundSlotElement);

export { SoundSlotElement };
