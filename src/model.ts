import { AppElement } from './app';
import { AssetElement } from './asset';
import { EntityElement } from './entity';

/**
 * Represents a model in the PlayCanvas engine.
 */
class ModelElement extends HTMLElement {
    private _asset: string = '';

    async connectedCallback() {
        // Get the application
        const appElement = this.closest('pc-app') as AppElement;
        if (!appElement) {
            console.warn(`${this.tagName} must be a child of pc-app`);
            return;
        }

        await appElement.getApplication();

        const asset = this.getAttribute('asset');
        if (asset) {
            this.asset = asset;
        }
    }

    _loadModel() {
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }
        const entity = asset.resource.instantiateRenderEntity();

        const parentEntityElement = this.closest('pc-entity') as EntityElement | null;
        if (parentEntityElement) {
            parentEntityElement.entity!.addChild(entity);
        } else {
            const appElement = this.closest('pc-app') as AppElement;
            appElement.app!.root.addChild(entity);
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
