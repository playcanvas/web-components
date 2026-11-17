import type { Plane, RenderComponent, StandardMaterial } from 'playcanvas';
import { SHADOW_CASCADE_0, SHADOW_CASCADE_1, SHADOW_CASCADE_2, SHADOW_CASCADE_3 } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';
import { MaterialElement } from '../material';

import { ComponentElement } from './component';

// The shadow cascades are named by their index, nearest the camera first
const shadowCascades = new Map<'0' | '1' | '2' | '3', number>([
    ['0', SHADOW_CASCADE_0],
    ['1', SHADOW_CASCADE_1],
    ['2', SHADOW_CASCADE_2],
    ['3', SHADOW_CASCADE_3]
]);

/**
 * The RenderComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-render/ | `<pc-render>`} elements.
 * The RenderComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * This element renders one of the engine's built-in primitives, selected with `type` (defaulting
 * to `box`). It does not cover the engine's `asset` render type, since there is no way to supply
 * a render asset here — use `pc-model` for glTF content instead.
 *
 * Engine component: {@link RenderComponent} (`render`).
 *
 * @elementSummary The `<pc-render>` element renders one of the engine's built-in primitives at its
 * entity — box, sphere, capsule, cone, cylinder, plane or torus — shaded by the `<pc-material>`
 * its `material` attribute names. For glTF content, use `<pc-model>` instead. Must be a child of
 * a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement<RenderComponent> {
    /**
     * The cast shadows flag of the render component.
     */
    declare castShadows: boolean;

    /**
     * Whether the clipping planes of the render component clip only what is behind all of them, in
     * place of what is behind any of them. Two planes then cut out a wedge, and three a corner.
     * Defaults to false.
     */
    declare clipIntersection: boolean;

    /**
     * The planes, in world space, that cut the render component open. They cut as a cutaway does:
     * what is behind a plane, on the side its normal points away from, is not rendered, casts no
     * shadow and cannot be picked. The rest of the scene stays whole. Up to 8 planes are used. The
     * planes are copied, so assign the array again to apply a change to one. Defaults to no planes.
     */
    declare clippingPlanes: Plane[];

    /**
     * The receive shadows flag of the render component.
     */
    declare receiveShadows: boolean;

    /**
     * Which shadow cascades of directional lights the render component casts into, which needs
     * `cast-shadows`. In markup, it is the space-separated cascade indices from 0 to 3, such as `0
     * 1` for the two cascades nearest the camera; as a property, it is the engine's bitmask of
     * `SHADOW_CASCADE_0` to `SHADOW_CASCADE_3` flags. Defaults to all cascades, `0 1 2 3`.
     */
    declare shadowCascadeMask: number;

    /**
     * The type of the render component.
     */
    declare type: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' | 'torus';

    private _material = '';

    /** @ignore */
    constructor() {
        super('render');
    }

    protected getInitialComponentData() {
        const data: Record<string, unknown> = { ...super.getInitialComponentData() };

        // Only a resolved material is passed on: an undefined one would replace the engine's
        // default material with nothing at the component level
        const material = MaterialElement.get(this._material, this);
        if (material) {
            data.material = material;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas render component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The render component, or `null`.
     */
    get component(): RenderComponent | null {
        return super.component;
    }

    /**
     * Sets the material of the render component.
     * @param value - The id of the material asset to use.
     */
    set material(value: string) {
        this._material = value;
        const material = MaterialElement.get(value, this);
        // Guarded like every other reference attribute in the library. Assigning an unresolved
        // lookup used to write `undefined` straight through to every mesh instance, and the
        // engine's MeshInstance setter takes that literally - it clears the material and skips
        // the ref/transparency/key bookkeeping, leaving the mesh with no material at all.
        if (this.component && material) {
            this.component.material = material as StandardMaterial;
        }
    }

    /**
     * Gets the id of the material asset used by the render component.
     * @returns The id of the material asset.
     */
    get material() {
        return this._material;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'material'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'material':
                this.material = newValue ?? '';
                break;
        }
    }
}

// The cascade mask defaults to every cascade, which is how `0 1 2 3` combines. The engine's own
// default, SHADOW_CASCADE_ALL, sets the bits of cascades it does not have as well (255 rather than
// 15), but directional lights stop at four cascades, so the two render the same.
defineAttributes(RenderComponentElement, 'component', {
    castShadows: attr.bool(true),
    clipIntersection: attr.bool(false),
    clippingPlanes: attr.planes(),
    receiveShadows: attr.bool(true),
    shadowCascadeMask: attr.flags(shadowCascades, '0 1 2 3'),
    type: attr.oneOf(['box', 'capsule', 'cone', 'cylinder', 'plane', 'sphere', 'torus'], 'box')
});

globalThis.customElements?.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
