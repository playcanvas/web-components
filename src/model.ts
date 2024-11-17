import { ContainerResource, Entity } from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';

/**
 * Represents a model in the PlayCanvas engine.
 */
class ModelElement extends AsyncElement {
    private _asset: string = '';

    private _entity: Entity | null = null;

    connectedCallback() {
        this._loadModel();
        this._onReady();
    }

    disconnectedCallback() {
        this._unloadModel();
    }

    private _instantiate(container: ContainerResource) {
        this._entity = container.instantiateRenderEntity();

        // @ts-ignore
        if (container.animations.length > 0) {
            this._entity.addComponent('anim');
            // @ts-ignore
            this._entity.anim.assignAnimation('animation', container.animations[0].resource);
        }

        const parentEntityElement = this.closestEntity;
        if (parentEntityElement) {
            parentEntityElement.ready().then(() => {
                parentEntityElement.entity!.addChild(this._entity!);
            });
        } else {
            const appElement = this.closestApp;
            if (appElement) {
                appElement.ready().then(() => {
                    appElement.app!.root.addChild(this._entity!);
                });
            }
        }
    }

    private async _loadModel() {
        this._unloadModel();

        const appElement = await this.closestApp?.ready();
        const app = appElement?.app;

        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        if (asset.loaded) {
            this._instantiate(asset.resource);
        } else {
            asset.once('load', () => {
                this._instantiate(asset.resource);
            });
            app!.assets.load(asset);
        }
    }

    private _unloadModel() {
        this._entity?.destroy();
        this._entity = null;
    }

    /**
     * Sets the asset ID of the model.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._loadModel();
        }
    }

    /**
     * Gets the source URL of the model.
     * @returns The source URL of the model.
     */
    get asset(): string {
        return this._asset;
    }

    static get observedAttributes() {
        return ['asset'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
        }
    }
}

customElements.define('pc-model', ModelElement);

export { ModelElement };
