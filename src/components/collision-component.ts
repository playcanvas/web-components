import type { CollisionComponent } from 'playcanvas';
import { Quat, Vec3 } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';
import { parseEnum } from '../parse';

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
    /**
     * The rotation of the collision shape relative to the entity, in local space. Defaults to no
     * rotation.
     */
    declare angularOffset: Quat;

    /**
     * The local axis along which a `capsule`, `cylinder` or `cone` shape is aligned: 0 for X, 1 for
     * Y and 2 for Z. Defaults to 1.
     */
    declare axis: number;

    /**
     * Whether a `mesh` shape is treated as a convex hull rather than a triangle mesh. A triangle
     * mesh can only be used with a `static` rigid body; a convex hull can also move as a `dynamic`
     * or `kinematic` one. Defaults to `false`.
     */
    declare convexHull: boolean;

    /**
     * The half-extents of a `box` shape along its local X, Y and Z axes. Defaults to 0.5 in each
     * axis.
     */
    declare halfExtents: Vec3;

    /**
     * The total height of a `capsule`, `cylinder` or `cone` shape, measured tip to tip along its
     * `axis`. Defaults to 2.
     */
    declare height: number;

    /**
     * The position of the collision shape relative to the entity, along its local axes. Defaults to
     * no offset.
     */
    declare linearOffset: Vec3;

    /**
     * The radius of a `sphere`, `capsule`, `cylinder` or `cone` shape. Defaults to 0.5.
     */
    declare radius: number;

    private _type: 'box' | 'capsule' | 'compound' | 'cone' | 'cylinder' | 'mesh' | 'sphere' = 'box';

    /** @ignore */
    constructor() {
        super('collision');
    }

    protected getInitialComponentData() {
        return {
            ...super.getInitialComponentData(),
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

    /**
     * Sets the shape of the collision volume. Can be `box`, `sphere`, `capsule`, `cylinder`,
     * `cone`, `mesh` or `compound`: a `mesh` shape takes its geometry from the host entity's
     * render asset, and a `compound` shape combines the shapes of descendant entities' collision
     * components into one rigid shape. Defaults to `box`.
     * @param value - The type.
     */
    set type(value: 'box' | 'capsule' | 'compound' | 'cone' | 'cylinder' | 'mesh' | 'sphere') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
            this._applyMeshGeometryDefault();
        }
    }

    /**
     * Gets the shape of the collision volume.
     * @returns The type.
     */
    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
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

defineAttributes(CollisionComponentElement, 'component', {
    angularOffset: attr.quat(Quat.IDENTITY),
    axis: attr.number(1),
    convexHull: attr.bool(false),
    halfExtents: attr.vec3(new Vec3(0.5, 0.5, 0.5)),
    height: attr.number(2),
    linearOffset: attr.vec3(Vec3.ZERO),
    radius: attr.number(0.5)
});

globalThis.customElements?.define('pc-collision', CollisionComponentElement);

export { CollisionComponentElement };
