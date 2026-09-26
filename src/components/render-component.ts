import type { RenderComponent, StandardMaterial } from 'playcanvas';
import { SHADOW_CASCADE_0, SHADOW_CASCADE_1, SHADOW_CASCADE_2, SHADOW_CASCADE_3 } from 'playcanvas';

import { MaterialElement } from '../material';
import { parseBool, parseEnum, parseFlags } from '../parse';

import { ComponentElement } from './component';

// The shadow cascades are named by their index, nearest the camera first
const shadowCascades = new Map<'0' | '1' | '2' | '3', number>([
    ['0', SHADOW_CASCADE_0],
    ['1', SHADOW_CASCADE_1],
    ['2', SHADOW_CASCADE_2],
    ['3', SHADOW_CASCADE_3]
]);

// Every cascade, which is how the markup default `0 1 2 3` combines. The engine's own default,
// SHADOW_CASCADE_ALL, sets the bits of cascades it does not have as well (255 rather than 15), but
// directional lights stop at four cascades, so the two render the same.
const ALL_CASCADES = SHADOW_CASCADE_0 | SHADOW_CASCADE_1 | SHADOW_CASCADE_2 | SHADOW_CASCADE_3;

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
 * entity — box, sphere, capsule, cone, cylinder, plane or torus — shaded by the `<pc-material>` its
 * `material` attribute names. For glTF content, use `<pc-model>` instead. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement<RenderComponent> {
    private _castShadows = true;

    private _material = '';

    private _receiveShadows = true;

    private _shadowCascadeMask = ALL_CASCADES;

    private _type: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' | 'torus' = 'box';

    /** @ignore */
    constructor() {
        super('render');
    }

    protected getInitialComponentData() {
        const data: Record<string, unknown> = {
            type: this._type,
            castShadows: this._castShadows,
            receiveShadows: this._receiveShadows,
            shadowCascadeMask: this._shadowCascadeMask
        };

        // Only a resolved material is passed on: an undefined one would replace the engine's
        // default material with nothing at the component level
        const material = MaterialElement.get(this._material);
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
     * Sets the type of the render component.
     * @param value - The type.
     */
    set type(value: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' | 'torus') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type(): 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' | 'torus' {
        return this._type;
    }

    /**
     * Sets the cast shadows flag of the render component.
     * @param value - The cast shadows flag.
     */
    set castShadows(value: boolean) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }

    /**
     * Gets the cast shadows flag of the render component.
     * @returns The cast shadows flag.
     */
    get castShadows(): boolean {
        return this._castShadows;
    }

    /**
     * Sets the material of the render component.
     * @param value - The id of the material asset to use.
     */
    set material(value: string) {
        this._material = value;
        const material = MaterialElement.get(value);
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

    /**
     * Sets the receive shadows flag of the render component.
     * @param value - The receive shadows flag.
     */
    set receiveShadows(value: boolean) {
        this._receiveShadows = value;
        if (this.component) {
            this.component.receiveShadows = value;
        }
    }

    /**
     * Gets the receive shadows flag of the render component.
     * @returns The receive shadows flag.
     */
    get receiveShadows(): boolean {
        return this._receiveShadows;
    }

    /**
     * Sets which shadow cascades of directional lights the render component casts into, which
     * needs `cast-shadows`. In markup, it is the space-separated cascade indices from 0 to 3, such
     * as `0 1` for the two cascades nearest the camera; as a property, it is the engine's bitmask
     * of `SHADOW_CASCADE_0` to `SHADOW_CASCADE_3` flags. Defaults to all cascades, `0 1 2 3`.
     * @param value - The cascade mask.
     */
    set shadowCascadeMask(value: number) {
        this._shadowCascadeMask = value;
        if (this.component) {
            this.component.shadowCascadeMask = value;
        }
    }

    /**
     * Gets which shadow cascades of directional lights the render component casts into, which
     * needs `cast-shadows`. As a property, it is a bitmask of `SHADOW_CASCADE_0` to
     * `SHADOW_CASCADE_3` flags.
     * @returns The cascade mask.
     */
    get shadowCascadeMask() {
        return this._shadowCascadeMask;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'cast-shadows',
            'material',
            'receive-shadows',
            'shadow-cascade-mask',
            'type'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'cast-shadows':
                this.castShadows = parseBool(newValue, true);
                break;
            case 'material':
                this.material = newValue ?? '';
                break;
            case 'receive-shadows':
                this.receiveShadows = parseBool(newValue, true);
                break;
            case 'shadow-cascade-mask':
                this.shadowCascadeMask = parseFlags(newValue, shadowCascades, '0 1 2 3', name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['box', 'capsule', 'cone', 'cylinder', 'plane', 'sphere', 'torus'], 'box', name);
                break;
        }
    }
}

customElements.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
