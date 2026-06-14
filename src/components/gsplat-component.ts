import { GSplatComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { AssetElement } from '../asset';

/**
 * The GSplatComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-gsplat/ | `<pc-gsplat>`} elements.
 * The GSplatComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class GSplatComponentElement extends ComponentElement {
    private _asset = '';

    private _castShadows = false;

    private _lodBaseDistance = 5;

    private _lodMultiplier = 3;

    /** @ignore */
    constructor() {
        super('gsplat');
    }

    getInitialComponentData() {
        return {
            asset: AssetElement.get(this._asset),
            castShadows: this._castShadows,
            lodBaseDistance: this._lodBaseDistance,
            lodMultiplier: this._lodMultiplier
        };
    }

    /**
     * Gets the underlying PlayCanvas gsplat component.
     * @returns The gsplat component.
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

    /**
     * Sets whether the splat casts shadows.
     * @param value - Whether the splat casts shadows.
     */
    set castShadows(value: boolean) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }

    /**
     * Gets whether the splat casts shadows.
     * @returns Whether the splat casts shadows.
     */
    get castShadows() {
        return this._castShadows;
    }

    /**
     * Sets the base distance for the first LOD transition (LOD 0 to LOD 1). Splats closer than
     * this distance use the highest quality LOD. Each subsequent LOD level transitions at a
     * progressively larger distance, controlled by {@link lodMultiplier}. Clamped to a minimum of
     * 0.1. Defaults to 5. Only affects assets that contain LOD levels (e.g. `.lod-meta.json`).
     * @param value - The LOD base distance.
     */
    set lodBaseDistance(value: number) {
        this._lodBaseDistance = value;
        if (this.component) {
            this.component.lodBaseDistance = value;
        }
    }

    /**
     * Gets the base distance for the first LOD transition.
     * @returns The LOD base distance.
     */
    get lodBaseDistance() {
        return this._lodBaseDistance;
    }

    /**
     * Sets the multiplier between successive LOD distance thresholds. Each LOD level transitions
     * at this factor times the previous level's distance, creating a geometric progression. Lower
     * values keep higher quality at distance; higher values switch to coarser LODs sooner. Clamped
     * to a minimum of 1.2. Defaults to 3. Only affects assets that contain LOD levels (e.g.
     * `.lod-meta.json`).
     * @param value - The LOD multiplier.
     */
    set lodMultiplier(value: number) {
        this._lodMultiplier = value;
        if (this.component) {
            this.component.lodMultiplier = value;
        }
    }

    /**
     * Gets the multiplier between successive LOD distance thresholds.
     * @returns The LOD multiplier.
     */
    get lodMultiplier() {
        return this._lodMultiplier;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'asset',
            'cast-shadows',
            'lod-base-distance',
            'lod-multiplier'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'cast-shadows':
                this.castShadows = this.hasAttribute('cast-shadows');
                break;
            case 'lod-base-distance':
                this.lodBaseDistance = Number(newValue);
                break;
            case 'lod-multiplier':
                this.lodMultiplier = Number(newValue);
                break;
        }
    }
}

customElements.define('pc-gsplat', GSplatComponentElement);

export { GSplatComponentElement };
