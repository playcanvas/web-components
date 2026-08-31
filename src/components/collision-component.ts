import type { CollisionComponent } from 'playcanvas';
import { Quat, Vec3 } from 'playcanvas';

import { parseBool, parseEnum, parseNumber, parseQuat, parseVec3 } from '../parse';

import { ComponentElement } from './component';

/**
 * The CollisionComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-collision/ | `<pc-collision>`} elements.
 * The CollisionComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * For `type="mesh"`, the collision geometry defaults to the host entity's own render component
 * (its render asset) — a collider matching the visible mesh, which is what a mesh collider on a
 * glTF node means. The default resolves each time the component applies, so a `pc-node` that
 * retargets or rebinds picks up the new node's geometry. An entity with no asset-backed render
 * component warns, and the collider has no shape.
 *
 * Engine component: {@link CollisionComponent} (`collision`).
 *
 * @elementSummary The `<pc-collision>` element gives its entity a collision shape — a box, sphere,
 * capsule, cone, cylinder or mesh — for the physics simulation to collide against. Pair it with a
 * `<pc-rigid-body>`. Must be a child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class CollisionComponentElement extends ComponentElement<CollisionComponent> {
    private _angularOffset: Quat = new Quat();

    private _axis = 1;

    private _convexHull = false;

    private _halfExtents: Vec3 = new Vec3(0.5, 0.5, 0.5);

    private _height = 2;

    private _linearOffset: Vec3 = new Vec3();

    private _radius = 0.5;

    private _type: 'box' | 'capsule' | 'compound' | 'cone' | 'cylinder' | 'mesh' | 'sphere' = 'box';

    /** @ignore */
    constructor() {
        super('collision');
    }

    protected getInitialComponentData() {
        return {
            axis: this._axis,
            angularOffset: this._angularOffset,
            convexHull: this._convexHull,
            halfExtents: this._halfExtents,
            height: this._height,
            linearOffset: this._linearOffset,
            radius: this._radius,
            type: this._type
        };
    }

    protected initComponent() {
        this._applyMeshGeometryDefault();
    }

    /**
     * Defaults a mesh collider's geometry to the host entity's own render component. The
     * engine's mesh collider only works with explicitly supplied geometry, and the element has
     * no attribute to supply it - so the host's visible geometry, the meaning a mesh collider
     * on a glTF node carries, fills the gap. Runs on every application (so a rebound `pc-node`
     * recomputes it) and on a runtime switch to `type="mesh"`; an explicitly assigned
     * `renderAsset` is never overwritten. A `pc-model` host entity never carries a render
     * component (the instantiated content beneath it does), so a mesh collider that should take
     * an asset's geometry belongs on a bound `pc-node`.
     */
    private _applyMeshGeometryDefault() {
        const component = this.component;
        if (!component || this._type !== 'mesh' || component.renderAsset !== null) {
            return;
        }

        const asset = component.entity.render?.asset ?? null;
        if (asset === null) {
            console.warn(
                `pc-collision type="mesh" on '${component.entity.name}' found no asset-backed render component to take geometry from - collider has no shape`
            );
            return;
        }
        component.renderAsset = asset;
    }

    /**
     * Gets the underlying PlayCanvas collision component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The collision component, or `null`.
     */
    get component(): CollisionComponent | null {
        return super.component;
    }

    set angularOffset(value: Quat) {
        this._angularOffset = value;
        if (this.component) {
            this.component.angularOffset = value;
        }
    }

    get angularOffset() {
        return this._angularOffset;
    }

    set axis(value: number) {
        this._axis = value;
        if (this.component) {
            this.component.axis = value;
        }
    }

    get axis() {
        return this._axis;
    }

    set convexHull(value: boolean) {
        this._convexHull = value;
        if (this.component) {
            this.component.convexHull = value;
        }
    }

    get convexHull() {
        return this._convexHull;
    }

    set halfExtents(value: Vec3) {
        this._halfExtents = value;
        if (this.component) {
            this.component.halfExtents = value;
        }
    }

    get halfExtents() {
        return this._halfExtents;
    }

    set height(value: number) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }

    get height() {
        return this._height;
    }

    set linearOffset(value: Vec3) {
        this._linearOffset = value;
        if (this.component) {
            this.component.linearOffset = value;
        }
    }

    get linearOffset() {
        return this._linearOffset;
    }

    set radius(value: number) {
        this._radius = value;
        if (this.component) {
            this.component.radius = value;
        }
    }

    get radius() {
        return this._radius;
    }

    set type(value: 'box' | 'capsule' | 'compound' | 'cone' | 'cylinder' | 'mesh' | 'sphere') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
            this._applyMeshGeometryDefault();
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'angular-offset',
            'axis',
            'convex-hull',
            'half-extents',
            'height',
            'linear-offset',
            'radius',
            'type'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'angular-offset':
                this.angularOffset = parseQuat(newValue, Quat.IDENTITY, name);
                break;
            case 'axis':
                this.axis = parseNumber(newValue, 1, name);
                break;
            case 'convex-hull':
                this.convexHull = parseBool(newValue, false);
                break;
            case 'half-extents':
                this.halfExtents = parseVec3(newValue, new Vec3(0.5, 0.5, 0.5), name);
                break;
            case 'height':
                this.height = parseNumber(newValue, 2, name);
                break;
            case 'linear-offset':
                this.linearOffset = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'radius':
                this.radius = parseNumber(newValue, 0.5, name);
                break;
            case 'type':
                this.type = parseEnum(
                    newValue,
                    ['box', 'capsule', 'compound', 'cone', 'cylinder', 'mesh', 'sphere'],
                    'box',
                    name
                );
                break;
        }
    }
}

customElements.define('pc-collision', CollisionComponentElement);

export { CollisionComponentElement };
