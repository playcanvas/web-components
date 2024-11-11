import { AssetElement } from './asset';
import { AsyncElement } from './async-element';

/**
 * Represents a model in the PlayCanvas engine.
 */
class ModelElement extends AsyncElement {
    private _asset: string = '';

    async connectedCallback() {
        await this.closestApp?.ready();

        const asset = this.getAttribute('asset');
        if (asset) {
            this.asset = asset;
        }

        this._onReady();
    }

    _loadModel() {
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }
        const entity = asset.resource.instantiateRenderEntity();

        if (asset.resource.animations.length > 0) {
            entity.addComponent('anim');
            entity.anim.assignAnimation('animation', asset.resource.animations[0].resource);
        }

        const parentEntityElement = this.closestEntity;
        if (parentEntityElement) {
            parentEntityElement.ready().then(() => {
                parentEntityElement.entity!.addChild(entity);
            });
        } else {
            const appElement = this.closestApp;
            if (appElement) {
                appElement.ready().then(() => {
                    appElement.app!.root.addChild(entity);
                });
            }
        }
    }

    /**
     * Sets the asset ID of the model.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        this._loadModel();
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
