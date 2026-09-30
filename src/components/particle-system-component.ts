import type { Asset, ParticleSystemComponent } from 'playcanvas';
import { Curve, CurveSet, Vec3 } from 'playcanvas';

import { AssetBinding, useAsset } from '../asset-binding';

import { ComponentElement } from './component';

/**
 * The config properties the engine builds from their JSON form when it creates the component: a
 * `Vec3` from an array, a `Curve` or `CurveSet` from a `{ type, keys }` object. The setters behind
 * them take only the built types, so a config applied to a component that already exists - a lazy
 * config that finishes loading, or an `asset` changed at runtime - is built here first. Mirrors
 * `_propertyTypes` in the engine's `ParticleSystemComponentSystem`.
 */
const CONFIG_TYPES: Partial<Record<string, 'vec3' | 'curve' | 'curveset'>> = {
    emitterExtents: 'vec3',
    emitterExtentsInner: 'vec3',
    particleNormal: 'vec3',
    wrapBounds: 'vec3',
    localVelocityGraph: 'curveset',
    localVelocityGraph2: 'curveset',
    velocityGraph: 'curveset',
    velocityGraph2: 'curveset',
    colorGraph: 'curveset',
    colorGraph2: 'curveset',
    alphaGraph: 'curve',
    alphaGraph2: 'curve',
    rotationSpeedGraph: 'curve',
    rotationSpeedGraph2: 'curve',
    radialSpeedGraph: 'curve',
    radialSpeedGraph2: 'curve',
    scaleGraph: 'curve',
    scaleGraph2: 'curve'
};

/**
 * Builds a config value from its JSON form exactly as the engine does when it creates the
 * component. A value that is already built, or has no JSON form, passes through.
 *
 * @param key - The config property.
 * @param value - The value as it appears in the config.
 * @returns The value to assign to the component.
 */
const buildConfigValue = (key: string, value: any) => {
    if (value === null || value === undefined) {
        return value;
    }

    switch (CONFIG_TYPES[key]) {
        case 'vec3':
            return Array.isArray(value) ? new Vec3(value[0], value[1], value[2]) : value;
        case 'curve': {
            if (value instanceof Curve) {
                return value;
            }
            const curve = new Curve(value.keys);
            curve.type = value.type;
            return curve;
        }
        case 'curveset': {
            if (value instanceof CurveSet) {
                return value;
            }
            const curveSet = new CurveSet(value.keys);
            curveSet.type = value.type;
            return curveSet;
        }
    }

    // The component keeps a layer list of its own rather than sharing the config's array
    return key === 'layers' && Array.isArray(value) ? value.slice() : value;
};

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

        // The engine builds the config's JSON-form values itself when it creates the component
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

        // Set the config properties on the component, built from their JSON form as the engine
        // builds creation data. `enabled` is left out: the element's attribute owns it, as it
        // does when the component is created.
        for (const key in resource) {
            if (Object.hasOwn(resource, key) && key !== 'enabled') {
                (this.component as any)[key] = buildConfigValue(key, resource[key]);
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
