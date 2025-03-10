import { GSplatComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { AssetElement } from '../asset';

/**
 * The SplatComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-splat/ | `<pc-splat>`} elements.
 * The SplatComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class SplatComponentElement extends ComponentElement {
    private _asset: string = '';

    /** @ignore */
    constructor() {
        super('gsplat');
    }

    getInitialComponentData() {
        return {
            asset: AssetElement.get(this._asset)
        };
    }

    /**
     * Gets the underlying PlayCanvas splat component.
     * @returns The splat component.
     */
    get component(): GSplatComponent | null {
        return super.component as GSplatComponent | null;
    }

    /**
     * Sets id of the `pc-asset` to use for the splat.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.asset = asset;
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the splat.
     * @returns The asset ID.
     */
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

customElements.define('pc-splat', SplatComponentElement);

export { SplatComponentElement };
