import { ParticleSystemComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { AssetElement } from '../asset';

/**
 * The ParticleSystemComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-particles/ | `<pc-particles>`} elements.
 * The ParticleSystemComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ParticleSystemComponentElement extends ComponentElement {
    private _asset: string = '';

    /** @ignore */
    constructor() {
        super('particlesystem');
    }

    getInitialComponentData() {
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return {};
        }

        if ((asset.resource as any).colorMapAsset) {
            const id = (asset.resource as any).colorMapAsset;
            const colorMapAsset = AssetElement.get(id)?.id;
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
    get component(): ParticleSystemComponent | null {
        return super.component as ParticleSystemComponent | null;
    }

    private applyConfig(resource: any) {
        if (!this.component) {
            return;
        }

        // Set all the config properties on the component
        for (const key in resource) {
            if (resource.hasOwnProperty(key)) {
                (this.component as any)[key] = resource[key];
            }
        }
    }

    private async _loadAsset() {
        const appElement = await this.closestApp?.ready();
        const app = appElement?.app;

        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        if (asset.loaded) {
            this.applyConfig(asset.resource);
        } else {
            asset.once('load', () => {
                this.applyConfig(asset.resource);
            });
            app!.assets.load(asset);
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
        return [
            ...super.observedAttributes,
            'asset'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
        }
    }
}

customElements.define('pc-particles', ParticleSystemComponentElement);

export { ParticleSystemComponentElement };
