import { CULLFACE_FRONT, Color, Entity, MeshInstance, Plane, Script, StandardMaterial, Vec3, math } from 'playcanvas';

const normal = new Vec3();
const point = new Vec3();

/**
 * Cuts a wedge out of everything its entity renders, with clipping planes. Two planes through the
 * entity's X axis remove the wedge, and a third across the axis limits how far along it the cut
 * runs. The planes clip in intersection mode, so only what is behind all three is removed.
 *
 * The cut exposes the insides of the parts, which are their back faces. The script draws those in
 * a flat color, so a solid part shows a cut face. That needs closed meshes.
 */
export class Cutaway extends Script {
    static scriptName = 'cutaway';

    /**
     * Whether the cut is made.
     *
     * @attribute
     * @type {boolean}
     */
    cut = true;

    /**
     * The angle of the wedge, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [0, 180]
     */
    opening = 90;

    /**
     * How far the wedge is turned about the axis, in degrees.
     *
     * @attribute
     * @type {number}
     * @range [-180, 180]
     */
    rotation = 0;

    /**
     * How far along the axis the cut runs, from 0 at `start` to 1 at `end`.
     *
     * @attribute
     * @type {number}
     * @range [0, 1]
     */
    length = 1;

    /**
     * Where the cut starts along the entity's X axis.
     *
     * @attribute
     * @type {number}
     */
    start = -1;

    /**
     * Where the cut ends along the entity's X axis.
     *
     * @attribute
     * @type {number}
     */
    end = 1;

    /**
     * Whether the cut faces are capped.
     *
     * @attribute
     * @type {boolean}
     */
    caps = true;

    /**
     * The color of the caps.
     *
     * @attribute
     * @type {Color}
     */
    capColor = new Color(0.62, 0.05, 0.04);

    /** @type {Plane[]} */
    _planes = [new Plane(), new Plane(), new Plane()];

    /** The settings the planes were last built from, so they are rebuilt only on a change. */
    _applied = '';

    initialize() {
        // Unlit, and drawn with front faces culled: only the insides of the parts show
        this._capMaterial = new StandardMaterial();
        this._capMaterial.diffuse = new Color(0, 0, 0);
        this._capMaterial.emissive = this.capColor;
        this._capMaterial.useLighting = false;
        this._capMaterial.cull = CULLFACE_FRONT;
        this._capMaterial.update();

        // The meshes to cut, which a cap then draws again on the same node. A cap of an instanced
        // mesh shares its instances, so no geometry is copied.
        this._renders = this.entity.findComponents('render');
        const capMeshInstances = this._renders.flatMap((render) => {
            return render.meshInstances.map((meshInstance) => {
                const cap = new MeshInstance(meshInstance.mesh, this._capMaterial, meshInstance.node);
                if (meshInstance.instancingData) {
                    cap.setInstancing(meshInstance.instancingData.vertexBuffer);
                }
                return cap;
            });
        });

        this._caps = new Entity('section-caps');
        this._caps.addComponent('render', { meshInstances: capMeshInstances, castShadows: false });
        this.app.root.addChild(this._caps);

        this.on('destroy', () => {
            for (const render of this._renders) {
                render.clippingPlanes = [];
            }
            this._caps.destroy();
            this._capMaterial.destroy();
        });
    }

    update() {
        const axis = this.entity.getPosition();
        const settings = [
            this.cut,
            this.opening,
            this.rotation,
            this.length,
            this.start,
            this.end,
            this.caps,
            this.capColor,
            axis
        ].join();
        if (settings === this._applied) return;
        this._applied = settings;

        const from = this.rotation * math.DEG_TO_RAD;
        const to = from + this.opening * math.DEG_TO_RAD;
        const [first, second, across] = this._planes;

        // What is behind a plane, on the side its normal points away from, is clipped
        first.setFromPointNormal(axis, normal.set(0, -Math.cos(from), Math.sin(from)));
        second.setFromPointNormal(axis, normal.set(0, Math.cos(to), -Math.sin(to)));
        point.set(axis.x + math.lerp(this.start, this.end, this.length), 0, 0);
        across.setFromPointNormal(point, Vec3.RIGHT);

        // The planes are copied as they are assigned, so they are assigned again on every change
        this._caps.enabled = this.cut && this.caps;
        this._capMaterial.emissive = this.capColor;
        this._capMaterial.update();
        for (const render of [...this._renders, this._caps.render]) {
            render.clippingPlanes = this.cut ? this._planes : [];
            render.clipIntersection = true;
        }
    }
}
