//import { GSplat, GSplatComponent, GSplatInstance } from 'playcanvas';

//import { AppElement } from '../app';
import { ComponentElement } from './component';
//import { AssetElement } from '../asset';

/**
 * Represents a gsplat component in the PlayCanvas engine.
 *
 * @category Components
 */
class GSplatComponentElement extends ComponentElement {
/*    private _asset: string = '';

    private _instance: GSplatInstance | null = null;

    constructor() {
        super('gsplat');
    }

    getSplatInstance() {
        const appElement = this.closest('pc-app') as AppElement;
        const device = appElement?.app?.graphicsDevice;
        const assetElement = document.querySelector(`pc-asset[id="${this._asset}"]`) as AssetElement;
        const { splatData} = assetElement?.asset?.resource;
        const splat = splatData.isCompressed ? new GSplat(device!, splatData) : new GSplat(device!, splatData);
        return new GSplatInstance(splat, {});
    }

    getInitialComponentData() {
        return {
            instance: this.getSplatInstance()
        };
    }*/

    /**
     * Gets the gsplat component.
     * @returns The gsplat component.
     *//*
    get component(): GSplatComponent | null {
        return super.component as GSplatComponent | null;
    }

    set asset(value: string) {
        this._asset = value;
    }

    get asset() {
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
    }*/
}

//customElements.define('pc-gsplat', GSplatComponentElement);

export { GSplatComponentElement };
