import type { SpriteAnimationClip } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { AsyncElement } from '../async-element';
import { parseBool, parseNumber } from '../parse';

import { SpriteComponentElement } from './sprite-component';

/**
 * The SpriteClipElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-sprite-clip/ | `<pc-sprite-clip>`}
 * elements. The SpriteClipElement interface also inherits the properties and methods of the
 * {@link AsyncElement} interface.
 *
 * A clip declares one named animation on its parent `<pc-sprite>`: the frames of its sprite
 * `asset`, played in frame-key order at `fps` frames per second. Names must be unique within a
 * `<pc-sprite>`. The element becomes ready once its clip is added to the sprite component, which
 * loads the sprite asset itself.
 *
 * @elementSummary The `<pc-sprite-clip>` element declares one named animation clip on its parent
 * `<pc-sprite>`: a sprite asset whose frames play at a given rate, once or looping. Must be a
 * direct child of `<pc-sprite>`.
 *
 * @category Components
 */
class SpriteClipElement extends AsyncElement {
    private _asset = '';

    /**
     * Incremented on every connect and disconnect, and captured by connectedCallback on entry —
     * a resume from an await abandons itself if the value has moved on, so a stale callback can
     * neither act on a torn-down tree nor register its clip alongside a re-inserted element's own
     * callback.
     */
    private _connectionGeneration = 0;

    private _fps = 0;

    private _loop = false;

    private _name = '';

    private _spriteAnimationClip: SpriteAnimationClip | null = null;

    /**
     * The `<pc-sprite>` this clip registered with, captured at connect time.
     *
     * `disconnectedCallback` cannot rediscover it: by the time the element is disconnected its
     * `parentElement` is already `null`, so a lookup would both fail to find the component and
     * emit a misleading "must be a direct child" warning for what is an ordinary removal.
     */
    private _spriteElement: SpriteComponentElement | null = null;

    /**
     * Whether the owning `<pc-sprite>` already rejected this clip's name — its syncs re-run as
     * sibling clips come and go, and must not repeat the complaint.
     */
    private _warnedInvalid = false;

    async connectedCallback() {
        const generation = ++this._connectionGeneration;

        const spriteElement = this.spriteElement;
        await spriteElement?.ready();

        // The element may have been removed (perhaps re-inserted, which runs a callback of its
        // own), or its parent torn down, while we were waiting. A <pc-app> disconnects before
        // its children, so by the time we resume the component can already be gone - see the
        // matching guard in disconnectedCallback below.
        if (generation !== this._connectionGeneration || !spriteElement?.component) {
            return;
        }

        this._spriteElement = spriteElement;
        spriteElement._syncClips();
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback still suspended on an await
        this._connectionGeneration++;

        // Uses the cached parent rather than a fresh lookup, since parentElement is already null
        // by now. The sync finds this element gone and releases its clip - unless the parent
        // <pc-sprite> (or the whole <pc-app>) is being torn down, which disconnects the parent
        // first and takes the component, and its clips, with it.
        const spriteElement = this._spriteElement;
        this._spriteElement = null;
        spriteElement?._syncClips();
        this._detach();
    }

    protected get spriteElement(): SpriteComponentElement | null {
        const spriteElement = this.parentElement;

        if (!(spriteElement instanceof SpriteComponentElement)) {
            const label = this._name ? ` '${this._name}'` : '';
            console.warn(`pc-sprite-clip${label} must be a direct child of a pc-sprite element`);
            return null;
        }

        return spriteElement;
    }

    /**
     * Takes the engine clip the owning `<pc-sprite>` created for this element.
     *
     * @param clip - The engine clip.
     * @internal
     */
    _attach(clip: SpriteAnimationClip) {
        this._spriteAnimationClip = clip;
        this._onReady();
    }

    /**
     * Lets go of the engine clip, which the owning `<pc-sprite>` has released or lost.
     *
     * @internal
     */
    _detach() {
        this._spriteAnimationClip = null;
        this._resetReady();
    }

    /**
     * Reports a name-validation failure from the owning `<pc-sprite>`, once per name value.
     *
     * @param message - The complaint.
     * @internal
     */
    _markInvalid(message: string) {
        if (this._warnedInvalid) {
            return;
        }
        this._warnedInvalid = true;
        console.warn(message);
    }

    /**
     * Gets the engine clip this element declares. `null` until the element is ready, and while
     * its name is missing or taken by an earlier clip.
     * @returns The sprite animation clip, or `null`.
     */
    get spriteAnimationClip(): SpriteAnimationClip | null {
        return this._spriteAnimationClip;
    }

    /**
     * Sets the id of the `pc-asset` of the sprite whose frames the clip plays.
     * @param value - The sprite asset id.
     */
    set asset(value: string) {
        this._asset = value;
        if (this._spriteAnimationClip) {
            // The engine setter accepts null - clearing the clip's sprite - but its declared
            // type does not
            this._spriteAnimationClip.spriteAsset = useAsset(value)?.id ?? (null as unknown as number);
        }
    }

    /**
     * Gets the id of the `pc-asset` of the sprite whose frames the clip plays.
     * @returns The sprite asset id.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets the rate the clip plays at, in frames per second, where negative values play it
     * backwards. Defaults to 0, which holds the first frame.
     * @param value - The frames per second.
     */
    set fps(value: number) {
        this._fps = value;
        if (this._spriteAnimationClip) {
            this._spriteAnimationClip.fps = value;
        }
    }

    /**
     * Gets the rate the clip plays at, in frames per second, where negative values play it
     * backwards.
     * @returns The frames per second.
     */
    get fps() {
        return this._fps;
    }

    /**
     * Sets whether the clip loops. A clip that does not loop stops on its last frame. Defaults
     * to `false`.
     * @param value - Whether the clip loops.
     */
    set loop(value: boolean) {
        this._loop = value;
        if (this._spriteAnimationClip) {
            this._spriteAnimationClip.loop = value;
        }
    }

    /**
     * Gets whether the clip loops.
     * @returns Whether the clip loops.
     */
    get loop() {
        return this._loop;
    }

    /**
     * Sets the name of the clip, which the parent `<pc-sprite>`'s `clip` attribute selects it by.
     * Names must be unique within a `<pc-sprite>`.
     * @param value - The clip name.
     */
    set name(value: string) {
        this._name = value;
        this._warnedInvalid = false;
        this._spriteElement?._syncClips();
    }

    /**
     * Gets the name of the clip, which the parent `<pc-sprite>`'s `clip` attribute selects it by.
     * @returns The clip name.
     */
    get name() {
        return this._name;
    }

    static get observedAttributes() {
        return ['asset', 'fps', 'loop', 'name'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'fps':
                this.fps = parseNumber(newValue, 0, name);
                break;
            case 'loop':
                this.loop = parseBool(newValue, false);
                break;
            case 'name':
                this.name = newValue ?? '';
                break;
        }
    }
}

globalThis.customElements?.define('pc-sprite-clip', SpriteClipElement);

export { SpriteClipElement };
