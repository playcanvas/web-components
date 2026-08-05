import { Entity, LAYERID_WORLD, Layer, Script, StandardMaterial, Vec3 } from 'playcanvas';

/**
 * Hides the parts of head-attached models (like the arms of a pair of glasses) that pass
 * behind the user's head, using invisible geometry that only writes depth. The occluder
 * is rendered before the world layer, so world geometry behind it depth-fails and the
 * transparent canvas reveals the camera feed instead - the head appears to occlude it.
 *
 * Two shapes make up the occluder:
 *
 * - Any model attached to this entity. MediaPipe's canonical face model is the natural
 *   choice: the facial transformation matrix is defined as the mapping of that very mesh
 *   onto the tracked face, so in canonical face space it registers with the user's face
 *   with no transform at all, letting the nose, brow and cheeks occlude accurately.
 * - An ellipsoid approximating the cranium, which face meshes do not cover.
 *
 * Attach to an entity at the scene origin when a face tracking script (like
 * `faceTracking`) establishes MediaPipe's canonical face space as world space: the head
 * is at the origin, facing +Z, measured in centimeters.
 */
export class HeadOccluder extends Script {
    static scriptName = 'headOccluder';

    /**
     * The center of the cranium ellipsoid in local space centimeters.
     * @type {Vec3}
     * @attribute
     */
    center = new Vec3(0, 0.5, -1.5);

    /**
     * The size of the cranium ellipsoid in local space centimeters.
     * @type {Vec3}
     * @attribute
     */
    size = new Vec3(15.5, 21, 19);

    /**
     * @type {StandardMaterial|null}
     * @private
     */
    _material = null;

    /**
     * @type {Layer|null}
     * @private
     */
    _layer = null;

    /**
     * @type {Entity|null}
     * @private
     */
    _ellipsoid = null;

    /** @private */
    _modelConverted = false;

    initialize() {
        const layers = this.app.scene.layers;
        const world = layers.getLayerById(LAYERID_WORLD);
        const layer = new Layer({ name: 'headOccluder' });
        layers.insertOpaque(layer, layers.getOpaqueIndex(world));
        this._layer = layer;

        const camera = this.app.root.findComponent('camera');
        if (camera) camera.layers = camera.layers.concat(layer.id);

        const material = new StandardMaterial();
        material.redWrite = false;
        material.greenWrite = false;
        material.blueWrite = false;
        material.alphaWrite = false;
        material.depthWrite = true;
        material.update();
        this._material = material;

        const ellipsoid = new Entity('head-occluder-ellipsoid');
        ellipsoid.addComponent('render', {
            type: 'sphere',
            material,
            castShadows: false,
            receiveShadows: false,
            layers: [layer.id]
        });
        ellipsoid.setLocalPosition(this.center);
        ellipsoid.setLocalScale(this.size);
        this.entity.addChild(ellipsoid);
        this._ellipsoid = ellipsoid;

        this.on('destroy', () => {
            if (camera) camera.layers = camera.layers.filter(id => id !== layer.id);
            ellipsoid.destroy();
            material.destroy();
            layers.remove(layer);
        });
    }

    update(_dt) {
        // A model attached to this entity becomes part of the occluder. It may not be
        // instantiated yet when the script initializes, so keep looking until its mesh
        // instances exist, then convert them once
        if (this._modelConverted) return;

        for (const render of this.entity.findComponents('render')) {
            if (render.entity === this._ellipsoid || render.meshInstances.length === 0) continue;

            render.layers = [this._layer.id];
            render.castShadows = false;
            render.receiveShadows = false;
            for (const meshInstance of render.meshInstances) {
                meshInstance.material = this._material;
            }
            this._modelConverted = true;
        }
    }
}
