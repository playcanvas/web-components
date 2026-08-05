import { Entity, LAYERID_WORLD, Layer, Script, StandardMaterial, Vec3 } from 'playcanvas';

/**
 * Hides the parts of head-attached models (like the arms of a pair of glasses) that pass
 * behind the user's head, using an invisible ellipsoid that only writes depth. The
 * ellipsoid is rendered before the world layer, so world geometry behind it depth-fails
 * and the transparent canvas reveals the camera feed instead - the head appears to
 * occlude it.
 *
 * Attach to an entity at the scene origin when a face tracking script (like
 * `faceTracking`) establishes MediaPipe's canonical face space as world space: the head
 * is at the origin, facing +Z, measured in centimeters.
 */
export class HeadOccluder extends Script {
    static scriptName = 'headOccluder';

    /**
     * The center of the occluder ellipsoid in local space centimeters.
     * @type {Vec3}
     * @attribute
     */
    center = new Vec3(0, 0.5, -1.5);

    /**
     * The size of the occluder ellipsoid in local space centimeters.
     * @type {Vec3}
     * @attribute
     */
    size = new Vec3(15.5, 21, 19);

    initialize() {
        const layers = this.app.scene.layers;
        const world = layers.getLayerById(LAYERID_WORLD);
        const layer = new Layer({ name: 'headOccluder' });
        layers.insertOpaque(layer, layers.getOpaqueIndex(world));

        const camera = this.app.root.findComponent('camera');
        if (camera) camera.layers = camera.layers.concat(layer.id);

        const material = new StandardMaterial();
        material.redWrite = false;
        material.greenWrite = false;
        material.blueWrite = false;
        material.alphaWrite = false;
        material.depthWrite = true;
        material.update();

        const entity = new Entity('head-occluder-ellipsoid');
        entity.addComponent('render', {
            type: 'sphere',
            material,
            castShadows: false,
            receiveShadows: false,
            layers: [layer.id]
        });
        entity.setLocalPosition(this.center);
        entity.setLocalScale(this.size);
        this.entity.addChild(entity);

        this.on('destroy', () => {
            if (camera) camera.layers = camera.layers.filter(id => id !== layer.id);
            entity.destroy();
            material.destroy();
            layers.remove(layer);
        });
    }
}
