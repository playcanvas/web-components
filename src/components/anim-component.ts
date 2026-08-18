import type { AnimComponent, Asset, ContainerResource } from 'playcanvas';
import { ANIM_CONTROL_STATES, AnimTrack } from 'playcanvas';

import { AssetElement } from '../asset';
import type { EntityBaseElement } from '../entity-base';
import { ModelElement } from '../model';
import { parseBool, parseNumber } from '../parse';

import type { AnimClipElement } from './anim-clip';
import { ComponentElement } from './component';

/**
 * A container resource with the `animations` sub-assets the engine documents but does not type:
 * one `Asset` of type `animation` per glTF animation, each holding an `AnimTrack` resource.
 */
type ContainerWithAnimations = ContainerResource & { animations: Asset[] };

/**
 * A playback snapshot captured before a clip-set rebuild and restored afterwards, so a rebuild
 * whose active clip survives it is seamless.
 */
type PlaybackState = {
    state: string;
    time: number;
    playing: boolean;
};

/**
 * The AnimComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-anim/ | `<pc-anim>`} elements.
 * The AnimComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The element drives animation clips over the host entity's hierarchy. Clips come from
 * `<pc-anim-clip>` children — or, when the element is a direct child of a `<pc-model>` and
 * declares no clips, every animation of that model's container asset is assigned, named by track
 * name, in container order. The first clip plays automatically (opt out with `activate="false"`);
 * switch clips declaratively through the `clip` attribute, or imperatively through {@link play}
 * and {@link transition}. Tracks bind to scene nodes by name, so any hierarchy whose node names
 * match a clip's curves can be animated — a model's skeleton is simply the common case.
 *
 * The engine reports no clip completion: a non-looping clip holds its last pose silently. Poll
 * the underlying {@link AnimComponent} (via {@link component}) for playback state beyond what
 * this element exposes.
 *
 * @category Components
 */
class AnimComponentElement extends ComponentElement {
    /**
     * Whether playback starts automatically once a clip is assigned.
     */
    private _activate = true;

    /**
     * The clip elements whose states are currently assigned, by clip name. The single writer of
     * a state: a later clip child re-using an adopted name is rejected as a duplicate.
     */
    private _assignedClips = new Map<string, AnimClipElement>();

    /**
     * Whether the current clip set was auto-assigned from the enclosing model rather than
     * declared by clip children.
     */
    private _autoAssigned = false;

    /**
     * The name of the active clip.
     */
    private _clip = '';

    /**
     * The element the model-readiness listener is attached to, held so disconnection can detach
     * it after `closestEntity` no longer resolves.
     */
    private _modelListenerTarget: EntityBaseElement | null = null;

    /**
     * Incremented whenever the clip source changes, and captured by an auto-assign pass on
     * entry — a pass resuming from an await abandons itself if the value has moved on, so a
     * superseded pass cannot assign clips alongside declared children or a newer pass.
     */
    private _sourceGeneration = 0;

    /**
     * The playback speed multiplier applied across all clips.
     */
    private _speed = 1;

    /**
     * The cross-fade duration of declarative clip switches, in seconds.
     */
    private _transitionTime = 0;

    /**
     * The unknown clip name already warned about, so a repeated selection of the same missing
     * name complains once.
     */
    private _warnedClip: string | null = null;

    /**
     * Rebinds when a model under the host announces readiness. The engine resolves each curve
     * once, at the first tick after assignment, and never retries — and its mesh-instance
     * broadcast fires before an instantiated hierarchy is parented, so a model that loads after
     * the clips were assigned would otherwise stay silently unbound. A re-instantiation of the
     * implicit clip source (the parent `<pc-model>`) means a new container, so the clip set
     * refreshes instead — unless every clip declares its own asset, where a rebind suffices.
     */
    private _onModelReady = (event: Event) => {
        if (!(event.target instanceof ModelElement) || !this.component) {
            return;
        }
        if (event.target === this.parentElement) {
            const implicit = this._autoAssigned ||
                [...this._assignedClips.values()].some(clip => !clip.asset);
            if (implicit) {
                this._refreshClips();
                return;
            }
        }
        this.component.rebind();
    };

    /** @ignore */
    constructor() {
        super('anim');
    }

    protected getInitialComponentData() {
        // The engine assigns creation data in key order and `activate` gates playback, so it
        // must precede any future key that builds layers (e.g. a state graph)
        return {
            activate: this._activate,
            speed: this._speed
        };
    }

    protected initComponent() {
        if (!this.component) {
            return;
        }

        // A host readiness cycle can re-run this. An identical re-add is deduped by the DOM;
        // the explicit swap handles the listener target changing across connections.
        const host = this.closestEntity;
        if (host && host !== this._modelListenerTarget) {
            this._modelListenerTarget?.removeEventListener('ready', this._onModelReady);
            host.addEventListener('ready', this._onModelReady);
            this._modelListenerTarget = host;
        }

        this._applyClips();
    }

    disconnectedCallback() {
        this._modelListenerTarget?.removeEventListener('ready', this._onModelReady);
        this._modelListenerTarget = null;

        // Invalidate any auto-assign still awaiting its model, and drop the adoption
        // bookkeeping so a reconnection starts clean
        this._sourceGeneration++;
        this._assignedClips.clear();
        this._autoAssigned = false;

        super.disconnectedCallback();
    }

    /**
     * The clip children in DOM order. Read afresh each pass — the DOM is the single source of
     * truth for the declared clip set.
     */
    private _clipElements(): AnimClipElement[] {
        return Array.from(this.querySelectorAll<AnimClipElement>(':scope > pc-anim-clip'));
    }

    /**
     * Assigns a clip's state. Until the clip's real track resolves, the engine's own placeholder
     * track stands in — it keeps the layer playable, so `activate` can start playback and the
     * declared `clip` selection can apply before any asset has loaded.
     */
    private _assignClip(clip: AnimClipElement) {
        this.component.assignAnimation(clip.name, clip._track ?? AnimTrack.EMPTY, undefined, clip.speed, clip.loop);
    }

    /**
     * Validates a clip child and, when valid, assigns its state and starts its track resolution.
     *
     * @param clip - The clip element.
     * @returns Whether the clip was adopted.
     */
    private _adoptClip(clip: AnimClipElement): boolean {
        const name = clip.name;
        if (!name) {
            clip._markInvalid('pc-anim-clip must have a name - clip not assigned');
            return false;
        }
        if (name.indexOf('.') !== -1) {
            clip._markInvalid(`pc-anim-clip '${name}' - '.' in a clip name is reserved for blend tree paths - clip not assigned`);
            return false;
        }
        if (this._assignedClips.has(name)) {
            clip._markInvalid(`pc-anim-clip '${name}' - an earlier clip already uses this name - clip not assigned`);
            return false;
        }
        this._assignedClips.set(name, clip);
        this._assignClip(clip);
        clip._resolveTrack(this);
        return true;
    }

    /**
     * Assigns the current clip set: the declared clip children when there are any, otherwise the
     * enclosing model's clips. Runs against a fresh component after a host cycle, so the
     * adoption bookkeeping rebuilds from scratch.
     */
    private _applyClips(restore?: PlaybackState) {
        if (!this.component) {
            return;
        }

        this._sourceGeneration++;
        this._assignedClips.clear();
        this._autoAssigned = false;

        const clips = this._clipElements();
        if (clips.length === 0) {
            this._kickAutoAssign(restore);
            return;
        }

        for (const clip of clips) {
            this._adoptClip(clip);
        }
        this._applySelection(restore);
    }

    /**
     * Assigns every clip of the enclosing model's container, named by track name, in container
     * order. Names the engine cannot host — dotted (reserved for blend tree paths) or already
     * taken — are skipped with a warning naming each.
     */
    private async _kickAutoAssign(restore?: PlaybackState) {
        const generation = this._sourceGeneration;

        const model = this.parentElement;
        if (!(model instanceof ModelElement)) {
            // Not inside a model: an empty component, driven through the JS API
            return;
        }

        await model.ready();

        // The source may have changed while the model loaded - a declared clip child appearing
        // flips the element over to declared mode, and wins
        const component = this.component;
        if (generation !== this._sourceGeneration || !component || this._clipElements().length > 0) {
            return;
        }

        const container = AssetElement.get(model.asset)?.resource as ContainerWithAnimations | undefined;
        if (!container) {
            // The load failed; the model already reported it
            return;
        }

        const label = this.id ? ` '${this.id}'` : '';
        if (container.animations.length === 0) {
            console.warn(`pc-anim${label} - model '${model.asset}' has no animations`);
            return;
        }

        const seen = new Set<string>();
        for (const animationAsset of container.animations) {
            const track = animationAsset.resource;
            if (!(track instanceof AnimTrack)) {
                continue;
            }
            if (track.name.indexOf('.') !== -1) {
                console.warn(`pc-anim${label} - track '${track.name}' - '.' in a clip name is reserved for blend tree paths - track skipped`);
                continue;
            }
            if (seen.has(track.name)) {
                console.warn(`pc-anim${label} - duplicate track name '${track.name}' - track skipped`);
                continue;
            }
            seen.add(track.name);
            component.assignAnimation(track.name, track);
        }

        this._autoAssigned = seen.size > 0;
        this._applySelection(restore);
    }

    /**
     * Applies the active-clip selection: the declared `clip` when it names an assigned state,
     * else a captured pre-rebuild state when it survived, else the engine's default (the first
     * assigned clip). A restore also reinstates the playhead and both playing flags — the
     * system tick reads the component's, the layer's controller reads its own.
     */
    private _applySelection(restore?: PlaybackState) {
        const component = this.component;
        const layer = component ? component.baseLayer : null;
        if (!component || !layer) {
            return;
        }

        if (this._clip && !layer.states.includes(this._clip)) {
            this._warnUnknownClip(this._clip);
        }

        let target: string | null = null;
        if (this._clip && layer.states.includes(this._clip)) {
            target = this._clip;
        } else if (restore && layer.states.includes(restore.state)) {
            target = restore.state;
        }

        if (target && layer.activeState !== target) {
            layer.play(target);
        }

        if (restore) {
            if (target === restore.state) {
                layer.activeStateCurrentTime = restore.time;
            }
            if (restore.playing) {
                layer.playing = true;
            }
            component.playing = restore.playing;
        }
    }

    private _warnUnknownClip(name: string) {
        if (this._warnedClip === name) {
            return;
        }
        this._warnedClip = name;
        const label = this.id ? ` '${this.id}'` : '';
        console.warn(`pc-anim${label} has no clip named '${name}' - selection unchanged`);
    }

    /**
     * Rebuilds the clip set from the DOM, restoring the active clip and playhead when they
     * survive the rebuild. The engine cannot remove a state from a loaded graph (unassigning
     * only empties the state's tracks), so removals, renames and source changes drop the whole
     * graph and reassign.
     *
     * @internal
     */
    _refreshClips() {
        const component = this.component;
        if (!component) {
            return;
        }
        const layer = component.baseLayer;
        const restore = layer ? {
            state: layer.activeState,
            time: layer.activeStateCurrentTime,
            playing: component.playing
        } : undefined;
        component.removeStateGraph();
        this._applyClips(restore);
    }

    /**
     * Adopts a clip child announced by its connectedCallback. The initComponent sweep adopts
     * children already present, so this is a no-op for those; it serves clips appended later,
     * and flips an auto-assigned element over to its declared children — declared clips win.
     *
     * @param clip - The clip element.
     * @internal
     */
    _registerClip(clip: AnimClipElement) {
        if (!this.component) {
            return;
        }
        if (this._autoAssigned) {
            this._refreshClips();
            return;
        }
        if (this._assignedClips.get(clip.name) === clip) {
            return;
        }
        // A clip child appearing supersedes an auto-assign still awaiting its model
        this._sourceGeneration++;
        if (this._adoptClip(clip)) {
            this._applySelection();
        }
    }

    /**
     * Releases a disconnected clip child. Rebuilds the set — a state cannot be removed from a
     * live graph — and the removal of the last child inside a `<pc-model>` flips the element
     * back to auto-assigning the model's clips.
     *
     * @param clip - The clip element.
     * @internal
     */
    _unregisterClip(clip: AnimClipElement) {
        if (!this.component) {
            // The whole subtree is coming down (parents disconnect first) - nothing to rebuild
            return;
        }
        if (this._assignedClips.get(clip.name) !== clip) {
            // The clip never held a state (invalid or duplicate name)
            return;
        }
        this._refreshClips();
    }

    /**
     * Swaps a clip's resolved track in for the placeholder (or for its previous track after an
     * asset change). A swap of the active clip restarts it: the engine preserves the playhead
     * through a track replacement, which would land mid-way into unrelated animation.
     *
     * @param clip - The clip element.
     * @returns Whether the clip still owns its state — the resolution may have been superseded
     * by a rebuild that dropped it.
     * @internal
     */
    _onClipResolved(clip: AnimClipElement): boolean {
        const component = this.component;
        if (!component || this._assignedClips.get(clip.name) !== clip) {
            return false;
        }
        this._assignClip(clip);
        const layer = component.baseLayer;
        if (layer && layer.activeState === clip.name) {
            layer.play(clip.name);
        }
        return true;
    }

    /**
     * Applies a clip's changed speed or loop. The engine bakes both into the playback state it
     * creates on state entry, so a live change re-enters the state and restores the playhead.
     *
     * @param clip - The clip element.
     * @internal
     */
    _onClipParamsChanged(clip: AnimClipElement) {
        const component = this.component;
        if (!component || this._assignedClips.get(clip.name) !== clip) {
            return;
        }
        this._assignClip(clip);
        const layer = component.baseLayer;
        if (layer && layer.activeState === clip.name) {
            const time = layer.activeStateCurrentTime;
            layer.play(clip.name);
            layer.activeStateCurrentTime = time;
        }
    }

    /**
     * Resumes playback, optionally switching to a named clip first (a hard cut). A name that
     * matches no clip leaves the selection unchanged.
     *
     * @param name - The name of the clip to play. Resumes the current clip when omitted.
     */
    play(name?: string) {
        const component = this.component;
        const layer = component ? component.baseLayer : null;
        if (!component || !layer) {
            return;
        }
        if (name !== undefined) {
            if (!layer.states.includes(name)) {
                return;
            }
            layer.play(name);
        } else {
            layer.play();
        }
        component.playing = true;
    }

    /**
     * Pauses playback, preserving the playhead — {@link play} resumes from where it stopped.
     */
    pause() {
        if (!this.component) {
            return;
        }
        this.component.playing = false;
    }

    /**
     * Cross-fades to a named clip and ensures playback is running. A name that matches no clip
     * leaves the selection unchanged.
     *
     * @param name - The name of the clip to fade to.
     * @param time - The fade duration in seconds. Defaults to the `transition-time` attribute.
     */
    transition(name: string, time?: number) {
        const component = this.component;
        const layer = component ? component.baseLayer : null;
        if (!component || !layer || !layer.states.includes(name)) {
            return;
        }
        layer.transition(name, Math.max(0, time ?? this._transitionTime));
        layer.playing = true;
        component.playing = true;
    }

    /**
     * Gets the underlying PlayCanvas anim component.
     * @returns The anim component.
     */
    get component(): AnimComponent {
        return super.component as AnimComponent;
    }

    /**
     * Gets the names of the assigned clips.
     * @returns The clip names, in assignment order.
     */
    get clips(): string[] {
        const layer = this.component ? this.component.baseLayer : null;
        return layer ? layer.states.filter(state => !ANIM_CONTROL_STATES.includes(state)) : [];
    }

    /**
     * Sets whether playback starts automatically once a clip is assigned. Defaults to `true`.
     * Applies when clips are assigned — it does not stop a clip that is already playing.
     * @param value - Whether playback starts automatically.
     */
    set activate(value: boolean) {
        this._activate = value;
        if (this.component) {
            this.component.activate = value;
        }
    }

    /**
     * Gets whether playback starts automatically once a clip is assigned.
     * @returns Whether playback starts automatically.
     */
    get activate() {
        return this._activate;
    }

    /**
     * Sets the name of the active clip. Changing it switches playback, cross-fading over
     * `transition-time` seconds (a hard cut at 0). An empty value leaves the current clip
     * playing; a name that matches no clip warns and leaves the selection unchanged.
     * @param value - The name of the active clip.
     */
    set clip(value: string) {
        this._clip = value;
        const component = this.component;
        const layer = component ? component.baseLayer : null;
        if (!component || !layer || !value) {
            return;
        }
        if (!layer.states.includes(value)) {
            this._warnUnknownClip(value);
            return;
        }
        if (layer.activeState === value) {
            return;
        }
        if (this._transitionTime > 0) {
            this.transition(value);
        } else {
            this.play(value);
        }
    }

    /**
     * Gets the name of the active clip.
     * @returns The name of the active clip.
     */
    get clip() {
        return this._clip;
    }

    /**
     * Sets the playback speed multiplier applied across all clips, where 0 freezes playback.
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
     * Gets the playback speed multiplier applied across all clips.
     * @returns The playback speed multiplier.
     */
    get speed() {
        return this._speed;
    }

    /**
     * Sets the cross-fade duration of clip switches made through the `clip` attribute, in
     * seconds. Defaults to 0 (a hard cut).
     * @param value - The cross-fade duration in seconds.
     */
    set transitionTime(value: number) {
        this._transitionTime = value;
    }

    /**
     * Gets the cross-fade duration of clip switches made through the `clip` attribute.
     * @returns The cross-fade duration in seconds.
     */
    get transitionTime() {
        return this._transitionTime;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'activate', 'clip', 'speed', 'transition-time'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'activate':
                this.activate = parseBool(newValue, true);
                break;
            case 'clip':
                this.clip = newValue ?? '';
                break;
            case 'speed':
                this.speed = parseNumber(newValue, 1, name);
                break;
            case 'transition-time':
                this.transitionTime = parseNumber(newValue, 0, name);
                break;
        }
    }
}

customElements.define('pc-anim', AnimComponentElement);

export { AnimComponentElement };
export type { ContainerWithAnimations };
