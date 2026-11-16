import type { SoundSlot } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { AsyncElement } from '../async-element';
import { applyAttribute, attr, attributeNames, defineAttributes } from '../attributes';
import { parseNumber } from '../parse';

import { SoundComponentElement } from './sound-component';

/**
 * The SoundSlotElement interface provides properties and methods for manipulating
 * `<pc-sound-slot>` elements. The SoundSlotElement interface also inherits the properties and
 * methods of the {@link AsyncElement} interface.
 *
 * @elementSummary The `<pc-sound-slot>` element declares one named sound on its parent `<pc-sound>`
 * — its asset, volume, pitch, looping and autoplay. Must be a direct child of `<pc-sound>`.
 *
 * @category Components
 */
class SoundSlotElement extends AsyncElement {
    /**
     * The auto play flag of the sound slot.
     */
    declare autoPlay: boolean;

    /**
     * The loop flag of the sound slot.
     */
    declare loop: boolean;

    /**
     * The name of the sound slot.
     */
    declare name: string;

    /**
     * The overlap flag of the sound slot.
     */
    declare overlap: boolean;

    /**
     * The pitch of the sound slot.
     */
    declare pitch: number;

    /**
     * The start time of the sound slot.
     */
    declare startTime: number;

    /**
     * The volume of the sound slot.
     */
    declare volume: number;

    private _asset = '';

    private _duration: number | null = null;

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
            autoPlay: this.autoPlay,
            loop: this.loop,
            overlap: this.overlap,
            pitch: this.pitch,
            startTime: this.startTime,
            volume: this.volume
        } as any;
        if (this._duration) {
            options.duration = this._duration;
        }
        // Part of the options rather than assigned once the slot exists, so the engine's own
        // autoPlay - which plays while the component and its entity are enabled - has it to play
        const id = useAsset(this._asset)?.id;
        if (id) {
            options.asset = id;
        }

        this._soundElement = soundElement;
        this.soundSlot = component.addSlot(this.name, options);

        this._onReady();
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback still suspended on an await
        this._connectionGeneration++;

        // Uses the cached parent rather than a fresh lookup, since parentElement is already null
        // by now. The component itself is null if the parent <pc-sound> (or the whole <pc-app>) is
        // being torn down — parents disconnect first and have already removed the component.
        this._soundElement?.component?.removeSlot(this.name);
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

    static get observedAttributes() {
        return [...attributeNames(this), 'asset', 'duration'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        applyAttribute(this, name, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'duration':
                this.duration = parseNumber(newValue, null, name);
                break;
        }
    }
}

defineAttributes(SoundSlotElement, 'soundSlot', {
    autoPlay: attr.bool(false),
    loop: attr.bool(false),
    name: attr.string(''),
    overlap: attr.bool(false),
    pitch: attr.number(1),
    startTime: attr.number(0),
    volume: attr.number(1)
});

globalThis.customElements?.define('pc-sound-slot', SoundSlotElement);

export { SoundSlotElement };
