import type { Asset } from 'playcanvas';
import { AnimTrack } from 'playcanvas';

import { AssetElement } from '../asset';
import { AssetBinding } from '../asset-binding';
import { AsyncElement } from '../async-element';
import { ModelElement } from '../model';
import { parseBool, parseNumber } from '../parse';

import type { ContainerWithAnimations } from './anim-component';
import { AnimComponentElement } from './anim-component';

/**
 * The AnimClipElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-anim-clip/ | `<pc-anim-clip>`}
 * elements. The AnimClipElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * A clip declares one named animation on its parent `<pc-anim>`. `name` is both the clip's name
 * and the track looked up in the clip's source: an explicit `asset` (a `container`, an
 * `animation` `.glb`, or an `animclip` JSON), or, without one, the container of the `<pc-model>`
 * enclosing the parent `<pc-anim>`. A source holding a single track supplies it whatever it is
 * named; in a multi-track source the track named `name` is chosen, falling back to the first
 * with a warning. The element becomes ready once its resolved track is assigned.
 *
 * @elementSummary The `<pc-anim-clip>` element declares one named animation clip on its parent
 * `<pc-anim>`, taken from the `asset` it names or, without one, from the enclosing `<pc-model>`'s
 * own animations. Must be a direct child of `<pc-anim>`.
 *
 * @category Components
 */
class AnimClipElement extends AsyncElement {
    /**
     * The `<pc-anim>` this clip was adopted by, captured when the parent adopts the clip and on
     * connection.
     *
     * `disconnectedCallback` cannot rediscover it: by the time the element is disconnected its
     * `parentElement` is already `null`, so a lookup would both fail to find the component and
     * emit a misleading "must be a direct child" warning for what is an ordinary removal.
     */
    private _animElement: AnimComponentElement | null = null;

    private _asset = '';

    /**
     * Watches the current source asset while it loads. Starting a new resolution or
     * disconnecting cancels it, so a superseded source can never hand its track to the parent.
     */
    private _binding = new AssetBinding();

    /**
     * Incremented on every connect and disconnect, and captured by connectedCallback on entry —
     * a resume from an await abandons itself if the value has moved on, so a stale callback can
     * neither act on a torn-down tree nor register its clip alongside a re-inserted element's
     * own callback.
     */
    private _connectionGeneration = 0;

    /**
     * Incremented on every track resolution and on disconnect, and captured by a resolution when
     * it starts. A resolution that resumes from an await abandons itself if the value has moved
     * on, so a superseded resolution cannot hand a stale track to the parent. The asset
     * subscription itself is guarded by the binding above.
     */
    private _loadGeneration = 0;

    private _loop = true;

    private _name = '';

    private _speed = 1;

    /**
     * The source complaint already made — the asset id it was made for, or `''` for the
     * no-asset-no-model case — so re-resolutions (host cycles, model reloads) do not repeat it.
     */
    private _warnedSource: string | null = null;

    /**
     * Whether the owning `<pc-anim>` already rejected this clip's name — its sweeps re-run on
     * host cycles and must not repeat the complaint.
     */
    private _warnedInvalid = false;

    /**
     * The clip's resolved track. `null` until resolution completes, during which the owning
     * `<pc-anim>` assigns the engine's placeholder track in its stead.
     *
     * @internal
     */
    _track: AnimTrack | null = null;

    async connectedCallback() {
        const generation = ++this._connectionGeneration;

        const animElement = this.animElement;
        await animElement?.ready();

        // The element may have been removed (perhaps re-inserted, which runs a callback of its
        // own), or its parent torn down, while we were waiting. A <pc-app> disconnects before
        // its children, so by the time we resume the component can already be gone - see the
        // matching guard in disconnectedCallback below.
        const component = animElement ? animElement.component : null;
        if (generation !== this._connectionGeneration || !animElement || !component) {
            return;
        }

        this._animElement = animElement;
        animElement._registerClip(this);
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback or track resolution still suspended on an await
        this._connectionGeneration++;
        this._loadGeneration++;
        this._binding.cancel();

        // Uses the cached parent rather than a fresh lookup, since parentElement is already null
        // by now. The component itself is null if the whole <pc-app> is being torn down —
        // parents disconnect first and have already removed the component.
        this._animElement?._unregisterClip(this);
        this._animElement = null;
        this._track = null;
        this._resetReady();
    }

    protected get animElement(): AnimComponentElement | null {
        const animElement = this.parentElement as AnimComponentElement;

        if (!(animElement instanceof AnimComponentElement)) {
            const label = this._name ? ` '${this._name}'` : '';
            console.warn(`pc-anim-clip${label} must be a direct child of a pc-anim element`);
            return null;
        }

        return animElement;
    }

    /**
     * Reports a name-validation failure from the owning `<pc-anim>`, once per name value.
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
     * Resolves the clip's track from its source and hands it to the owning `<pc-anim>`. Called
     * by the parent whenever the clip is (re)adopted, and again when the source changes; a newer
     * resolution supersedes one still in flight. The element becomes ready once the resolved
     * track is assigned.
     *
     * @param animElement - The owning `<pc-anim>`.
     * @internal
     */
    async _resolveTrack(animElement: AnimComponentElement) {
        this._animElement = animElement;

        const generation = ++this._loadGeneration;
        this._binding.cancel();

        if (this._asset) {
            // Every path that moves _loadGeneration also rebinds or cancels the binding, so a
            // delivery below is always current.
            const asset = this._binding.bind(this._asset, {
                load: (loaded) => this._extractTrack(loaded, `asset '${this._asset}'`),
                error: () => {
                    this._warnSource(`pc-anim-clip '${this._name}' - asset '${this._asset}' failed to load - clip not assigned`);
                }
            });
            if (!asset) {
                this._warnSource(`pc-anim-clip '${this._name}' could not find asset '${this._asset}' - clip not assigned`);
            }
            return;
        }

        const model = animElement.parentElement;
        if (!(model instanceof ModelElement)) {
            this._warnSource(`pc-anim-clip '${this._name}' has no asset and no enclosing pc-model - clip not assigned`);
            return;
        }

        await model.ready();
        if (generation !== this._loadGeneration) {
            return;
        }

        const asset = AssetElement.get(model.asset);
        if (!asset?.resource) {
            // The model's load failed; it already reported the error
            return;
        }
        this._extractTrack(asset, `model '${model.asset}'`);
    }

    /**
     * Complains about the clip's source, once per source value — resolutions re-run on host
     * cycles and model reloads, and must not repeat the complaint.
     */
    private _warnSource(message: string) {
        if (this._warnedSource === this._asset) {
            return;
        }
        this._warnedSource = this._asset;
        console.warn(message);
    }

    /**
     * Picks the clip's track out of a loaded source asset: the track named `name`, or a lone
     * track whatever it is named, or the first of several with a warning.
     *
     * @param asset - The loaded source asset.
     * @param source - How warnings name the source.
     */
    private _extractTrack(asset: Asset, source: string) {
        const label = `pc-anim-clip '${this._name}'`;

        // Widened: the engine registers an 'animclip' handler but omits the type from the
        // Asset.type union
        const type: string = asset.type;

        let candidates: unknown[];
        switch (type) {
            case 'container':
                candidates = (asset.resource as ContainerWithAnimations).animations.map(
                    (animationAsset) => animationAsset.resource
                );
                break;
            case 'animation':
                candidates = asset.resources;
                break;
            case 'animclip':
                candidates = [asset.resource];
                break;
            default:
                this._warnSource(`${label} - ${source} has type '${asset.type}', expected 'container', 'animation' or 'animclip' - clip not assigned`);
                return;
        }

        // A JSON 'animation' asset parses to the engine's legacy Animation class, which the anim
        // system rejects - only real AnimTracks qualify
        const tracks = candidates.filter((candidate): candidate is AnimTrack => candidate instanceof AnimTrack);
        if (tracks.length === 0) {
            this._warnSource(`${label} - ${source} contains no usable animation track - clip not assigned`);
            return;
        }

        let track = tracks.find((candidate) => candidate.name === this._name);
        if (!track) {
            track = tracks[0];
            if (tracks.length > 1) {
                console.warn(
                    `${label} - no track named '${this._name}' in ${source} - using '${track.name}' (available: ${tracks.map((candidate) => candidate.name).join(', ')})`
                );
            }
        }

        this._track = track;
        if (this._animElement?._onClipResolved(this)) {
            this._onReady();
        }
    }

    /**
     * Sets the id of the `pc-asset` supplying the clip's track: a `container`, an `animation`
     * `.glb`, or an `animclip` JSON. When empty, the track comes from the container of the
     * `<pc-model>` enclosing the parent `<pc-anim>`.
     * @param value - The asset id.
     */
    set asset(value: string) {
        this._asset = value;
        this._warnedSource = null;
        if (this._animElement) {
            this._resetReady();
            this._track = null;
            this._resolveTrack(this._animElement);
        }
    }

    /**
     * Gets the id of the `pc-asset` supplying the clip's track.
     * @returns The asset id.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets whether the clip loops. A non-looping clip holds its last pose when it ends — the
     * engine reports no completion. Defaults to `true`.
     * @param value - Whether the clip loops.
     */
    set loop(value: boolean) {
        this._loop = value;
        this._animElement?._onClipParamsChanged(this);
    }

    /**
     * Gets whether the clip loops.
     * @returns Whether the clip loops.
     */
    get loop() {
        return this._loop;
    }

    /**
     * Sets the name of the clip: the name it is played by, and the track looked up in the
     * clip's source. Names must be unique within a `<pc-anim>` and must not contain `.`.
     * @param value - The clip name.
     */
    set name(value: string) {
        this._name = value;
        this._warnedInvalid = false;
        if (this._animElement) {
            this._resetReady();
            this._animElement._refreshClips();
        }
    }

    /**
     * Gets the name of the clip.
     * @returns The clip name.
     */
    get name() {
        return this._name;
    }

    /**
     * Sets the playback speed of the clip, where negative values play it backwards. Applies
     * immediately, preserving the playhead. Defaults to 1.
     * @param value - The playback speed.
     */
    set speed(value: number) {
        this._speed = value;
        this._animElement?._onClipParamsChanged(this);
    }

    /**
     * Gets the playback speed of the clip.
     * @returns The playback speed.
     */
    get speed() {
        return this._speed;
    }

    static get observedAttributes() {
        return ['asset', 'loop', 'name', 'speed'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'loop':
                this.loop = parseBool(newValue, true);
                break;
            case 'name':
                this.name = newValue ?? '';
                break;
            case 'speed':
                this.speed = parseNumber(newValue, 1, name);
                break;
        }
    }
}

customElements.define('pc-anim-clip', AnimClipElement);

export { AnimClipElement };
