import type { GSplatComponent } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { attr, defineAttributes } from '../attributes';

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
    /**
     * Whether the splat casts shadows.
     */
    declare castShadows: boolean;

    /**
     * The camera distance of the first LOD transition. That is the one from LOD 0 to LOD 1: parts
     * of the splat closer than this use the finest LOD, and each further level starts at {@link
     * lodMultiplier} times the previous distance. In world units, compensated for the camera's
     * field of view. How these distances combine with the scene-wide splat budget is set by the
     * `gsplat-splat-budget-mode` attribute of `<pc-scene>`. Clamped to a minimum of 0.1. Defaults
     * to 5. Only affects assets that contain LOD levels (e.g. `.lod-meta.json`).
     */
    declare lodBaseDistance: number;

    /**
     * The multiplier between successive LOD transition distances. Higher values keep finer detail
     * further from the camera, at a higher memory cost; lower values switch to coarser levels
     * sooner. Clamped to a minimum of 1.2. Defaults to 3. Only affects assets that contain LOD
     * levels (e.g. `.lod-meta.json`).
     */
    declare lodMultiplier: number;

    /**
     * The maximum allowed LOD index. It is inclusive: the LOD selected by distance is clamped so it
     * never goes coarser (higher index) than this value. The default of 99 effectively means "no
     * cap". Only affects assets that contain LOD levels (e.g. `.lod-meta.json`).
     */
    declare lodRangeMax: number;

    /**
     * The minimum allowed LOD index. It is inclusive: the LOD selected by distance is clamped so it
     * never goes finer (lower index) than this value. Raising it avoids downloading the highest
     * quality (largest) LOD files. Defaults to 0. Only affects assets that contain LOD levels (e.g.
     * `.lod-meta.json`).
     */
    declare lodRangeMin: number;

    private _asset = '';

    /** @ignore */
    constructor() {
        super('gsplat');
    }

    protected getInitialComponentData() {
        return {
            ...super.getInitialComponentData(),
            asset: useAsset(this._asset, this)
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
        const asset = useAsset(value, this);
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

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
        }
    }
}

defineAttributes(GSplatComponentElement, 'component', {
    castShadows: attr.bool(false),
    lodBaseDistance: attr.number(5),
    lodMultiplier: attr.number(3),
    lodRangeMax: attr.number(99),
    lodRangeMin: attr.number(0)
});

globalThis.customElements?.define('pc-gsplat', GSplatComponentElement);

export { GSplatComponentElement };
