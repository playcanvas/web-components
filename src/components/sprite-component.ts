import type { SpriteComponent } from 'playcanvas';
import { Color } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { parseBool, parseColor, parseEnum, parseNumber } from '../parse';

import { ComponentElement } from './component';
import type { SpriteClipElement } from './sprite-clip';

/**
 * The SpriteComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-sprite/ | `<pc-sprite>`} elements.
 * The SpriteComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * A `simple` sprite (the default) renders one frame of the sprite `asset` it names. An
 * `animated` sprite plays its `<pc-sprite-clip>` children instead, each a named clip with a
 * sprite asset of its own: the `clip` attribute names the one that plays, and changing it
 * switches playback. Sprites are unlit, and render as transparent geometry in the world layer.
 *
 * Engine component: {@link SpriteComponent} (`sprite`).
 *
 * @elementSummary The `<pc-sprite>` element renders a 2D sprite at its entity: one frame of a
 * sprite asset, or (with `type="animated"`) the `<pc-sprite-clip>` children it plays. Must be a
 * child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class SpriteComponentElement extends ComponentElement<SpriteComponent> {
    private _asset = '';

    /**
     * The clip elements whose engine clips currently exist, by clip name. The single writer of a
     * name: a later clip child re-using an adopted name is rejected as a duplicate.
     */
    private _assignedClips = new Map<string, SpriteClipElement>();

    /**
     * The component the adopted clips were created on, which tells a component that survived a
     * host readiness cycle from a fresh one.
     */
    private _clipsComponent: SpriteComponent | null = null;

    private _clip = '';

    private _color: Color = new Color(1, 1, 1, 1);

    private _flipX = false;

    private _flipY = false;

    private _frame = 0;

    private _height = 1;

    private _opacity = 1;

    private _speed = 1;

    private _type: 'simple' | 'animated' = 'simple';

    /**
     * The unknown asset id already warned about, so that resolving the same missing id again (a
     * host readiness cycle) complains once.
     */
    private _warnedAsset: string | null = null;

    private _width = 1;

    /** @ignore */
    constructor() {
        super('sprite');
    }

    protected getInitialComponentData() {
        // The engine assigns `type` whether or not it is supplied, so it always is
        const data: Record<string, any> = {
            type: this._type,
            autoPlayClip: this._clip,
            color: this._color,
            flipX: this._flipX,
            flipY: this._flipY,
            frame: this._frame,
            height: this._height,
            opacity: this._opacity,
            speed: this._speed,
            width: this._width
        };

        const asset = this._resolveAsset();
        if (asset) {
            data.spriteAsset = asset.id;
        }

        return data;
    }

    protected initComponent() {
        // A host readiness cycle runs this again. A model reloading its content keeps its host
        // entity, and this component with it, so the adopted clips stand. A fresh component (a
        // rebinding pc-node's) holds none of them: the children let go of the old clips and are
        // adopted anew, announcing their readiness again.
        if (this.component !== this._clipsComponent) {
            this._forgetClips();
            this._clipsComponent = this.component;
        }
        this._syncClips();
    }

    disconnectedCallback() {
        this._forgetClips();
        this._clipsComponent = null;
        super.disconnectedCallback();
    }

    /**
     * Re-evaluates this component against the host's current entity, as every component element
     * does, and lets the clip children go too when the host no longer fronts one: a `<pc-node>`
     * whose binding dissolved took the component, and its clips, with it.
     *
     * @internal
     */
    _hostCycled() {
        super._hostCycled();
        if (!this.component) {
            this._forgetClips();
            this._clipsComponent = null;
        }
    }

    /**
     * Detaches every adopted clip child, for a component that is gone or replaced - its engine
     * clips went with it, so there is nothing to remove.
     */
    private _forgetClips() {
        for (const clip of this._assignedClips.values()) {
            clip._detach();
        }
        this._assignedClips.clear();
    }

    /**
     * Resolves `asset` to its engine asset, warning once when it names none.
     *
     * @returns The asset, or `undefined` when `asset` is empty or names no asset.
     */
    private _resolveAsset() {
        const asset = useAsset(this._asset);
        if (this._asset && !asset && this._warnedAsset !== this._asset) {
            this._warnedAsset = this._asset;
            const label = this.id ? ` '${this.id}'` : '';
            console.warn(`pc-sprite${label} could not find asset '${this._asset}' - sprite cleared`);
        }
        return asset;
    }

    /**
     * The clip children in DOM order. Read afresh each pass — the DOM is the single source of
     * truth for the declared clip set.
     */
    private _clipElements(): SpriteClipElement[] {
        return Array.from(this.querySelectorAll<SpriteClipElement>(':scope > pc-sprite-clip'));
    }

    /**
     * Brings the component's clips in line with the clip children: releases every clip whose
     * element has left or been renamed, then adopts every child not yet adopted. Called by the
     * children as they connect, disconnect and are renamed. Adopting the selected clip plays it,
     * even over another clip that is playing.
     *
     * @internal
     */
    _syncClips() {
        const component = this.component;
        if (!component) {
            return;
        }

        const children = this._clipElements();
        for (const [name, clip] of this._assignedClips) {
            if (clip.name !== name || !children.includes(clip)) {
                this._releaseClip(name, clip);
            }
        }

        let adoptedSelected = false;
        for (const clip of children) {
            if (this._assignedClips.get(clip.name) === clip) {
                continue;
            }
            if (!clip.name) {
                clip._markInvalid('pc-sprite-clip must have a name - clip not added');
                continue;
            }
            if (this._assignedClips.has(clip.name)) {
                clip._markInvalid(`pc-sprite-clip '${clip.name}' - an earlier clip already uses this name - clip not added`);
                continue;
            }

            this._assignedClips.set(clip.name, clip);
            clip._attach(
                this,
                component.addClip({
                    name: clip.name,
                    fps: clip.fps,
                    loop: clip.loop,
                    spriteAsset: useAsset(clip.asset)?.id
                })
            );
            if (clip.name === this._clip) {
                adoptedSelected = true;
            }
        }

        // The engine's auto-play started the selected clip on adoption only if nothing else was
        // playing
        if (adoptedSelected) {
            this._playSelected();
        }
    }

    /**
     * Removes a clip from the component. The engine's own removal only forgets the clip, which
     * would leave a current clip rendering and every clip's asset listeners attached - so a
     * current clip is stopped, and every clip lets go of its sprite asset (hiding a current
     * clip's frame), first.
     */
    private _releaseClip(name: string, clip: SpriteClipElement) {
        this._assignedClips.delete(name);

        const engineClip = clip.spriteAnimationClip;
        clip._detach();

        const component = this.component;
        if (!component || !engineClip || component.clip(name) !== engineClip) {
            return;
        }
        if (component.currentClip === engineClip) {
            component.stop();
        }
        // The engine setter accepts null - unbinding the asset - but its declared type does not
        engineClip.spriteAsset = null as unknown as number;
        component.removeClip(name);
    }

    /**
     * Plays the clip named by `clip`, unless it is already playing. Like the engine's own
     * auto-play, only an animated sprite whose component and entity are enabled plays: a
     * disabled one is left to that auto-play, which starts the clip when it is enabled.
     */
    private _playSelected() {
        const component = this.component;
        if (!component || !this._clip || component.type !== 'animated') {
            return;
        }
        if (!component.enabled || !component.entity.enabled) {
            return;
        }
        const clip = component.clip(this._clip);
        if (clip && !(component.currentClip === clip && clip.isPlaying)) {
            component.play(this._clip);
        }
    }

    /**
     * Gets the underlying PlayCanvas sprite component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The sprite component, or `null`.
     */
    get component(): SpriteComponent | null {
        return super.component;
    }

    /**
     * Sets the id of the `pc-asset` of the sprite to render (`simple` sprites only). An empty
     * value renders nothing.
     * @param value - The sprite asset id.
     */
    set asset(value: string) {
        this._asset = value;
        this._warnedAsset = null;
        if (this.component) {
            // The engine setter accepts null - clearing the sprite - but its declared type does not
            this.component.spriteAsset = this._resolveAsset()?.id ?? (null as unknown as number);
        }
    }

    /**
     * Gets the id of the `pc-asset` of the sprite to render (`simple` sprites only).
     * @returns The sprite asset id.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets the name of the clip to play (`animated` sprites only). Changing it switches playback,
     * and setting it again restarts a clip that has ended. The clip also plays whenever the
     * sprite is enabled again. An empty value leaves the current clip playing.
     * @param value - The clip name.
     */
    set clip(value: string) {
        this._clip = value;
        if (this.component) {
            this.component.autoPlayClip = value;
            this._playSelected();
        }
    }

    /**
     * Gets the name of the clip to play (`animated` sprites only).
     * @returns The clip name.
     */
    get clip() {
        return this._clip;
    }

    /**
     * Sets the color the sprite is tinted with. Its alpha is ignored - see `opacity`. Defaults
     * to white.
     * @param value - The tint color.
     */
    set color(value: Color) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }

    /**
     * Gets the color the sprite is tinted with.
     * @returns The tint color.
     */
    get color() {
        return this._color;
    }

    /**
     * Sets whether the sprite is mirrored horizontally. Defaults to `false`.
     * @param value - Whether to flip the sprite horizontally.
     */
    set flipX(value: boolean) {
        this._flipX = value;
        if (this.component) {
            this.component.flipX = value;
        }
    }

    /**
     * Gets whether the sprite is mirrored horizontally.
     * @returns Whether the sprite is flipped horizontally.
     */
    get flipX() {
        return this._flipX;
    }

    /**
     * Sets whether the sprite is mirrored vertically. Defaults to `false`.
     * @param value - Whether to flip the sprite vertically.
     */
    set flipY(value: boolean) {
        this._flipY = value;
        if (this.component) {
            this.component.flipY = value;
        }
    }

    /**
     * Gets whether the sprite is mirrored vertically.
     * @returns Whether the sprite is flipped vertically.
     */
    get flipY() {
        return this._flipY;
    }

    /**
     * Sets the index of the frame to render, among the frame keys of the current sprite. On an
     * animated sprite it moves the playing clip to that frame, which plays on from there - but a
     * clip starting to play begins at its first frame, so a `frame` declared in markup has no
     * effect on an animated sprite. Defaults to 0.
     * @param value - The frame index.
     */
    set frame(value: number) {
        this._frame = value;
        if (this.component) {
            this.component.frame = value;
        }
    }

    /**
     * Gets the index of the frame to render, as last set - on an animated sprite the playing clip
     * moves on from it, so `component.frame` is the frame on screen.
     * @returns The frame index.
     */
    get frame() {
        return this._frame;
    }

    /**
     * Sets the height of the sprite in world units, used only when its sprite asset's
     * `render-mode` is `sliced` or `tiled`. Defaults to 1.
     * @param value - The height.
     */
    set height(value: number) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }

    /**
     * Gets the height of the sprite in world units, used only when its sprite asset's
     * `render-mode` is `sliced` or `tiled`.
     * @returns The height.
     */
    get height() {
        return this._height;
    }

    /**
     * Sets the opacity of the sprite, from 0 to 1. Defaults to 1.
     * @param value - The opacity.
     */
    set opacity(value: number) {
        this._opacity = value;
        if (this.component) {
            this.component.opacity = value;
        }
    }

    /**
     * Gets the opacity of the sprite.
     * @returns The opacity.
     */
    get opacity() {
        return this._opacity;
    }

    /**
     * Sets the playback speed multiplier applied to every clip, where 0 freezes playback.
     * Defaults to 1.
     * @param value - The playback speed multiplier.
     */
    set speed(value: number) {
        this._speed = value;
        if (this.component) {
            this.component.speed = value;
        }
    }

    /**
     * Gets the playback speed multiplier applied to every clip.
     * @returns The playback speed multiplier.
     */
    get speed() {
        return this._speed;
    }

    /**
     * Sets the type of the sprite. Can be:
     *
     * - `simple` - Renders one frame of the sprite `asset`.
     * - `animated` - Plays the `<pc-sprite-clip>` children, starting with the one named by `clip`.
     *
     * Defaults to `simple`.
     * @param value - The sprite type.
     */
    set type(value: 'simple' | 'animated') {
        this._type = value;
        if (this.component) {
            // Switching to animated starts the selected clip through the engine's auto-play
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the sprite: `simple` or `animated`.
     * @returns The sprite type.
     */
    get type(): 'simple' | 'animated' {
        return this._type;
    }

    /**
     * Sets the width of the sprite in world units, used only when its sprite asset's
     * `render-mode` is `sliced` or `tiled`. Defaults to 1.
     * @param value - The width.
     */
    set width(value: number) {
        this._width = value;
        if (this.component) {
            this.component.width = value;
        }
    }

    /**
     * Gets the width of the sprite in world units, used only when its sprite asset's
     * `render-mode` is `sliced` or `tiled`.
     * @returns The width.
     */
    get width() {
        return this._width;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'asset',
            'clip',
            'color',
            'flip-x',
            'flip-y',
            'frame',
            'height',
            'opacity',
            'speed',
            'type',
            'width'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'clip':
                this.clip = newValue ?? '';
                break;
            case 'color':
                this.color = parseColor(newValue, Color.WHITE, name);
                break;
            case 'flip-x':
                this.flipX = parseBool(newValue, false);
                break;
            case 'flip-y':
                this.flipY = parseBool(newValue, false);
                break;
            case 'frame':
                this.frame = parseNumber(newValue, 0, name);
                break;
            case 'height':
                this.height = parseNumber(newValue, 1, name);
                break;
            case 'opacity':
                this.opacity = parseNumber(newValue, 1, name);
                break;
            case 'speed':
                this.speed = parseNumber(newValue, 1, name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['simple', 'animated'], 'simple', name);
                break;
            case 'width':
                this.width = parseNumber(newValue, 1, name);
                break;
        }
    }
}

globalThis.customElements?.define('pc-sprite', SpriteComponentElement);

export { SpriteComponentElement };
