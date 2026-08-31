import type { RenderComponent, StandardMaterial } from 'playcanvas';

import { MaterialElement } from '../material';
import { parseBool, parseEnum } from '../parse';

import { ComponentElement } from './component';

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
 * entity — box, sphere, capsule, cone, cylinder or plane — shaded by the `<pc-material>` its
 * `material` attribute names. For glTF content, use `<pc-model>` instead. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement<RenderComponent> {
    private _castShadows = true;

    private _material = '';

    private _receiveShadows = true;

    private _type: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' = 'box';

    /** @ignore */
    constructor() {
        super('render');
    }

    protected getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            material: MaterialElement.get(this._material),
            receiveShadows: this._receiveShadows
        };
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
    set type(value: 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type(): 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' {
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

    static get observedAttributes() {
        return [...super.observedAttributes, 'cast-shadows', 'material', 'receive-shadows', 'type'];
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
            case 'type':
                this.type = parseEnum(newValue, ['box', 'capsule', 'cone', 'cylinder', 'plane', 'sphere'], 'box', name);
                break;
        }
    }
}

customElements.define('pc-render', RenderComponentElement);

export { RenderComponentElement };
