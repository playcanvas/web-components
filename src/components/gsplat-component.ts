import { GSplatComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { AssetElement } from '../asset';

/**
 * The GSplatComponentElement interface provides properties and methods for manipulating
 * `<pc-splat>` elements. The GSplatComponentElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 *
 * @category Components
 */
class GSplatComponentElement extends ComponentElement {
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
     * Gets the gsplat component.
     * @returns The gsplat component.
     */
    get component(): GSplatComponent | null {
        return super.component as GSplatComponent | null;
    }

    set asset(value: string) {
        this._asset = value;
        const asset = AssetElement.get(value);
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
