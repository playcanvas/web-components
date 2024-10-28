import { GSplatComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { AssetElement } from '../asset';

/**
 * Represents a gsplat component in the PlayCanvas engine.
 *
 * @category Components
 */
class GSplatComponentElement extends ComponentElement {
    private _asset: string = '';

    constructor() {
        super('gsplat');
    }

    getAsset() {
        const assetElement = document.querySelector(`pc-asset[id="${this._asset}"]`) as AssetElement;
        return assetElement!.asset;
    }

    getInitialComponentData() {
        return {
            asset: this.getAsset()
        };
    }

    /**
     * Gets the gsplat component.
     * @returns The gsplat component.
     */
    get component(): GSplatComponent | null {
        return super.component as GSplatComponent | null;
    }

    set asset(value: string) {
        this._asset = value;
        const asset = this.getAsset();
        if (this.component && asset) {
            this.component.asset = asset;
        }
    }

    get asset() {
        return this._asset;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'asset'];
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

customElements.define('pc-splat', GSplatComponentElement);

export { GSplatComponentElement };
