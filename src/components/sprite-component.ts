import type { SpriteComponent } from 'playcanvas';
import { Color } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { attr, defineAttributes } from '../attributes';

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
    /**
     * The color the sprite is tinted with. Its alpha is ignored - see `opacity`. Defaults to white.
     */
    declare color: Color;

    /**
     * Whether the sprite is mirrored horizontally. Defaults to `false`.
     */
    declare flipX: boolean;

    /**
     * Whether the sprite is mirrored vertically. Defaults to `false`.
     */
    declare flipY: boolean;

    /**
     * The index of the frame to render, as last set - on an animated sprite the playing clip moves
     * on from it, so `component.frame` is the frame on screen. It is an index among the frame keys
     * of the current sprite. Setting it on an animated sprite moves the playing clip to that frame,
     * which plays on from there - but a clip starting to play begins at its first frame, so a
     * `frame` declared in markup has no effect on an animated sprite. Defaults to 0.
     */
    declare frame: number;

    /**
     * The height of the sprite in world units, used only when its sprite asset's `render-mode` is
     * `sliced` or `tiled`. Defaults to 1.
     */
    declare height: number;

    /**
     * The opacity of the sprite. It ranges from 0 to 1. Defaults to 1.
     */
    declare opacity: number;

    /**
     * The playback speed multiplier applied to every clip. 0 freezes playback. Defaults to 1.
     */
    declare speed: number;

    /**
     * The type of the sprite: `simple` or `animated`. Can be:
     *
     * - `simple` - Renders one frame of the sprite `asset`.
     * - `animated` - Plays the `<pc-sprite-clip>` children, starting with the one named by `clip`.
     *
     * Defaults to `simple`.
     */
    declare type: 'simple' | 'animated';

    /**
     * The width of the sprite in world units, used only when its sprite asset's `render-mode` is
     * `sliced` or `tiled`. Defaults to 1.
     */
    declare width: number;

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

    /**
     * The unknown asset id already warned about, so that resolving the same missing id again (a
     * host readiness cycle) complains once.
     */
    private _warnedAsset: string | null = null;

    /** @ignore */
    constructor() {
        super('sprite');
    }

    protected getInitialComponentData() {
        // The engine assigns `type` whether or not it is supplied, so it always is
        const data: Record<string, any> = {
            ...super.getInitialComponentData(),
            autoPlayClip: this._clip
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
        const asset = useAsset(this._asset, this);
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
                clip._markInvalid(
                    `pc-sprite-clip '${clip.name}' - an earlier clip already uses this name - clip not added`
                );
                continue;
            }

            this._assignedClips.set(clip.name, clip);
            clip._attach(
                this,
                component.addClip({
                    name: clip.name,
                    fps: clip.fps,
                    loop: clip.loop,
                    spriteAsset: useAsset(clip.asset, this)?.id
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

    static get observedAttributes() {
        return [...super.observedAttributes, 'asset', 'clip'];
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
        }
    }
}

// Switching type to animated starts the selected clip through the engine's auto-play
defineAttributes(SpriteComponentElement, 'component', {
    color: attr.color(Color.WHITE),
    flipX: attr.bool(false),
    flipY: attr.bool(false),
    frame: attr.number(0),
    height: attr.number(1),
    opacity: attr.number(1),
    speed: attr.number(1),
    type: attr.oneOf(['simple', 'animated'], 'simple'),
    width: attr.number(1)
});

globalThis.customElements?.define('pc-sprite', SpriteComponentElement);

export { SpriteComponentElement };
