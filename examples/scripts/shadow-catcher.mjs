import { Script, Entity, Layer, StandardMaterial, BLEND_NORMAL, CHUNKAPI_1_65, SHADOW_VSM16, SHADOWUPDATE_REALTIME } from 'playcanvas';

const endPS = `
    litArgs_opacity = mix(light0_shadowIntensity, 0.0, shadow0);
    gl_FragColor.rgb = vec3(0.0);
`;

export class ShadowCatcher extends Script {
    /** @type {Layer|null} */
    layer = null;

    /** @type {StandardMaterial|null} */
    material = null;

    /** @type {Entity|null} */
    plane = null;

    /** @type {Entity|null} */
    light = null;
    
    initialize() {
        // create and add the shadow layer
        this.layer = new Layer({
            name: 'Shadow Layer'
        });

        const layers = this.app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        const idx = layers.getTransparentIndex(worldLayer);
        layers.insert(this.layer, idx + 1);

        // create shadow catcher material
        this.material = new StandardMaterial();
        this.material.useSkybox = false;
        this.material.blendType = BLEND_NORMAL;
        this.material.depthWrite = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.specular.set(0, 0, 0);
        this.material.chunks = {
            APIVersion: CHUNKAPI_1_65,
            endPS: endPS
        };
        this.material.update();

        // create shadow catcher geometry
        this.plane = new Entity('ShadowPlane');
        this.plane.addComponent('render', {
            type: 'plane',
            castShadows: false,
            material: this.material
        });
        this.plane.setLocalScale(2 * 4, 1, 2 * 4);

        // create shadow catcher light
        this.light = new Entity('ShadowLight');
        this.light.addComponent('light', {
            type: 'directional',
            castShadows: true,
            normalOffsetBias: 0,
            shadowBias: 0,
            shadowDistance: 10,
            shadowResolution: 2048,
            shadowType: SHADOW_VSM16,
            shadowUpdateMode: SHADOWUPDATE_REALTIME,
            vsmBlurSize: 64,
            enabled: true,
            shadowIntensity: 0.6
        });

        this.app.root.addChild(this.plane);
        this.app.root.addChild(this.light);
        this.plane.render.layers = [this.layer.id];
        this.light.light.layers = [this.layer.id];

        // add the shadow layer to the camera
        const camera = this.app.root.findComponent('camera');
        camera.layers = camera.layers.concat([this.layer.id]);

        this.entity.findComponents('render').forEach((component) => {
            this.layer.shadowCasters = this.layer.shadowCasters.concat(component.meshInstances);
        });
    }
}
