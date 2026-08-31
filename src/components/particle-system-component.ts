import type { Asset, ParticleSystemComponent } from 'playcanvas';

import { useAsset } from '../asset';
import { AssetBinding } from '../asset-binding';

import { ComponentElement } from './component';

/**
 * The ParticleSystemComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-particle-system/ | `<pc-particle-system>`} elements.
 * The ParticleSystemComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ParticleSystemComponent} (`particlesystem`).
 *
 * @elementSummary The `<pc-particle-system>` element emits particles from its entity, with
 * attributes for the emitter's shape, rate, lifetime, textures and blending. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ParticleSystemComponentElement extends ComponentElement<ParticleSystemComponent> {
    private _asset = '';

    /**
     * The subscription to the current config asset while its load is in flight. Rebinding
     * supersedes it and disconnect cancels it, so a superseded config — an earlier asset that
     * finishes loading after its replacement, or a callback left behind by a previous
     * connection — can never configure the component.
     */
    private _binding = new AssetBinding();

    /** @ignore */
    constructor() {
        super('particlesystem');
    }

    protected getInitialComponentData() {
        const asset = useAsset(this._asset);
        // A lazy config has no resource yet - the config binding applies it once the load
        // completes
        if (!asset || !asset.resource) {
            return {};
        }

        this._resolveColorMap(asset.resource);
        return asset.resource;
    }

    protected initComponent() {
        // A loaded config already arrived through getInitialComponentData - the binding is only
        // needed for a load still in flight. Resolution here also starts a lazy config's load.
        const asset = useAsset(this._asset);
        if (asset && !asset.loaded) {
            this._bindConfig();
        }
    }

    disconnectedCallback() {
        // The binding dies with the connection, so a config that finishes loading later cannot
        // configure the component a reconnection creates - that connection binds afresh.
        this._binding.cancel();
        super.disconnectedCallback();
    }

    /**
     * Gets the underlying PlayCanvas particle system component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The particle system component, or `null`.
     */
    get component(): ParticleSystemComponent | null {
        return super.component;
    }

    /**
     * Rewrites the config's `colorMapAsset` from the `pc-asset` id it is authored with to the
     * engine asset id the component resolves, starting the texture's load if it is lazy. The
     * rewrite is in place, so a config applied again — a host cycle, a reconnection — is already
     * resolved and passes through unchanged.
     */
    private _resolveColorMap(resource: any) {
        if (resource.colorMapAsset) {
            const colorMapAsset = useAsset(resource.colorMapAsset)?.id;
            if (colorMapAsset) {
                resource.colorMapAsset = colorMapAsset;
            }
        }
    }

    private applyConfig(resource: any) {
        if (!this.component) {
            return;
        }

        this._resolveColorMap(resource);

        // Set all the config properties on the component
        for (const key in resource) {
            if (Object.hasOwn(resource, key)) {
                (this.component as any)[key] = resource[key];
            }
        }
    }

    private _bindConfig() {
        this._binding.bind(this._asset, {
            load: (asset: Asset) => this.applyConfig(asset.resource)
        });
    }

    /**
     * Sets the id of the `pc-asset` to use for the model.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._bindConfig();
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the model.
     * @returns The asset ID.
     */
    get asset(): string {
        return this._asset;
    }

    // Control methods
    /**
     * Starts playing the particle system
     */
    play() {
        if (this.component) {
            this.component.play();
        }
    }

    /**
     * Pauses the particle system
     */
    pause() {
        if (this.component) {
            this.component.pause();
        }
    }

    /**
     * Resets the particle system
     */
    reset() {
        if (this.component) {
            this.component.reset();
        }
    }

    /**
     * Stops the particle system
     */
    stop() {
        if (this.component) {
            this.component.stop();
        }
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'asset'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
        }
    }
}

customElements.define('pc-particle-system', ParticleSystemComponentElement);

export { ParticleSystemComponentElement };
