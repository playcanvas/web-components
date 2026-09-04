import type { GSplatComponent } from 'playcanvas';

import { useAsset } from '../asset';
import { parseBool, parseNumber } from '../parse';

import { ComponentElement } from './component';

/**
 * The GSplatComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-gsplat/ | `<pc-gsplat>`} elements.
 * The GSplatComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link GSplatComponent} (`gsplat`).
 *
 * @elementSummary The `<pc-gsplat>` element renders the 3D Gaussian splats of a `gsplat` asset at
 * its entity, with attributes for shadow casting and level of detail. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class GSplatComponentElement extends ComponentElement<GSplatComponent> {
    private _asset = '';

    private _castShadows = false;

    private _lodFalloff = 1;

    private _lodRangeMin = 0;

    private _lodRangeMax = 99;

    /** @ignore */
    constructor() {
        super('gsplat');
    }

    protected getInitialComponentData() {
        return {
            asset: useAsset(this._asset),
            castShadows: this._castShadows,
            lodFalloff: this._lodFalloff,
            lodRangeMin: this._lodRangeMin,
            lodRangeMax: this._lodRangeMax
        };
    }

    /**
     * Gets the underlying PlayCanvas gsplat component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The gsplat component, or `null`.
     */
    get component(): GSplatComponent | null {
        return super.component;
    }

    /**
     * Sets id of the `pc-asset` to use for the splat.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        const asset = useAsset(value);
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
     * Sets how quickly this splat's quality falls off away from the camera. Higher values
     * concentrate more of the scene-wide splat budget near the camera, while lower values spread
     * detail more evenly. Clamped to the range 0 to 8. Defaults to 1. Only affects assets that
     * contain LOD levels (e.g. `.lod-meta.json`).
     * @param value - The LOD falloff exponent.
     */
    set lodFalloff(value: number) {
        this._lodFalloff = value;
        if (this.component) {
            this.component.lodFalloff = value;
        }
    }

    /**
     * Gets how quickly this splat's quality falls off away from the camera.
     * @returns The LOD falloff exponent.
     */
    get lodFalloff() {
        return this._lodFalloff;
    }

    /**
     * Sets the minimum allowed LOD index (inclusive). The LOD selected by distance is clamped so it
     * never goes finer (lower index) than this value. Raising it avoids downloading the highest
     * quality (largest) LOD files. Defaults to 0. Only affects assets that contain LOD levels (e.g.
     * `.lod-meta.json`).
     * @param value - The minimum LOD index.
     */
    set lodRangeMin(value: number) {
        this._lodRangeMin = value;
        if (this.component) {
            this.component.lodRangeMin = value;
        }
    }

    /**
     * Gets the minimum allowed LOD index.
     * @returns The minimum LOD index.
     */
    get lodRangeMin() {
        return this._lodRangeMin;
    }

    /**
     * Sets the maximum allowed LOD index (inclusive). The LOD selected by distance is clamped so it
     * never goes coarser (higher index) than this value. The default of 99 effectively means "no
     * cap". Defaults to 99. Only affects assets that contain LOD levels (e.g. `.lod-meta.json`).
     * @param value - The maximum LOD index.
     */
    set lodRangeMax(value: number) {
        this._lodRangeMax = value;
        if (this.component) {
            this.component.lodRangeMax = value;
        }
    }

    /**
     * Gets the maximum allowed LOD index.
     * @returns The maximum LOD index.
     */
    get lodRangeMax() {
        return this._lodRangeMax;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'asset', 'cast-shadows', 'lod-falloff', 'lod-range-min', 'lod-range-max'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'cast-shadows':
                this.castShadows = parseBool(newValue, false);
                break;
            case 'lod-falloff':
                this.lodFalloff = parseNumber(newValue, 1, name);
                break;
            case 'lod-range-min':
                this.lodRangeMin = parseNumber(newValue, 0, name);
                break;
            case 'lod-range-max':
                this.lodRangeMax = parseNumber(newValue, 99, name);
                break;
        }
    }
}

customElements.define('pc-gsplat', GSplatComponentElement);

export { GSplatComponentElement };
