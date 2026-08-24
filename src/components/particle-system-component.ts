import type { ParticleSystemComponent } from 'playcanvas';

import { useAsset } from '../asset';

import { ComponentElement } from './component';

/**
 * The ParticleSystemComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-particle-system/ | `<pc-particle-system>`} elements.
 * The ParticleSystemComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ParticleSystemComponent} (`particlesystem`).
 *
 * @summary The `<pc-particle-system>` element emits particles from its entity, with attributes for
 * the emitter's shape, rate, lifetime, textures and blending. Must be a child of a `<pc-entity>`,
 * `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ParticleSystemComponentElement extends ComponentElement {
    private _asset = '';

    /** @ignore */
    constructor() {
        super('particlesystem');
    }

    protected getInitialComponentData() {
        const asset = useAsset(this._asset);
        // A lazy config has no resource yet - _loadAsset applies it once the load completes
        if (!asset || !asset.resource) {
            return {};
        }

        if ((asset.resource as any).colorMapAsset) {
            const id = (asset.resource as any).colorMapAsset;
            const colorMapAsset = useAsset(id)?.id;
            if (colorMapAsset) {
                (asset.resource as any).colorMapAsset = colorMapAsset;
            }
        }

        return asset.resource;
    }

    /**
     * Gets the underlying PlayCanvas particle system component.
     * @returns The particle system component.
     */
    get component(): ParticleSystemComponent {
        return super.component as ParticleSystemComponent;
    }

    private applyConfig(resource: any) {
        if (!this.component) {
            return;
        }

        // Set all the config properties on the component
        for (const key in resource) {
            if (Object.hasOwn(resource, key)) {
                (this.component as any)[key] = resource[key];
            }
        }
    }

    private async _loadAsset() {
        await this.closestApp?.ready();

        const asset = useAsset(this._asset);
        if (!asset) {
            return;
        }

        if (asset.loaded) {
            this.applyConfig(asset.resource);
        } else {
            asset.once('load', () => {
                this.applyConfig(asset.resource);
            });
        }
    }

    /**
     * Sets the id of the `pc-asset` to use for the model.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._loadAsset();
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
