import {
    BLEND_PREMULTIPLIED,
    Entity,
    LAYERID_WORLD,
    Layer,
    SHADERLANGUAGE_GLSL,
    SHADERLANGUAGE_WGSL,
    Script,
    StandardMaterial,
    Vec3
} from 'playcanvas';

/**
 * The version of the engine's shader chunk API that the catcher's output override is written
 * against.
 */
const CHUNKS_VERSION = '2.21';

/**
 * Grounds virtual objects on the user's real head: an invisible head-shaped proxy that renders
 * only the shadows the scene casts onto it, in the spirit of the engine's shadow catcher script.
 * It also doubles as an occluder - it writes depth before the world layer renders, so world
 * geometry passing behind the head depth-fails and the camera feed shows through instead.
 *
 * Two sources of geometry can make up the catcher:
 *
 * - Any model attached to this entity. A head extended from MediaPipe's canonical face mesh is
 *   the natural choice: the facial transformation matrix is defined as the mapping of that very
 *   mesh onto the tracked face, so in canonical face space its features register with the user's
 *   face with no transform at all, and shadows bend around the nose, brow and cheeks.
 * - An ellipsoid approximating the cranium (`ellipsoid`), as a fallback when no model is
 *   attached. Disable it when a model supplies the geometry - two overlapping catcher surfaces
 *   double-darken where both are visible.
 *
 * The engine's stock shadow catcher darkens whatever the canvas already contains, which works
 * over a rendered background but not over webcam AR, where the "background" is a DOM video
 * element behind a transparent canvas. This catcher instead writes the accumulated directional
 * shadow into the canvas alpha as premultiplied black, so the page compositor darkens the video
 * exactly where the shadow falls.
 *
 * Attach to the entity that carries the head pose: an entity at the scene origin when a face
 * tracking script (like `faceTracking`) establishes canonical face space as world space, or a
 * child of the tracked head entity when the camera stays fixed and the head moves (like
 * `trackedHead`). Local space is canonical face centimeters either way - the head at the local
 * origin, facing +Z. Only directional lights with shadow casting enabled contribute, and their
 * `shadowIntensity` scales the effect.
 */
export class HeadShadowCatcher extends Script {
    static scriptName = 'headShadowCatcher';

    /**
     * Whether to create the fallback cranium ellipsoid. Set to false when a model attached to
     * this entity supplies the catcher geometry instead.
     * @type {boolean}
     * @attribute
     */
    ellipsoid = true;

    /**
     * The center of the cranium ellipsoid in local space centimeters. For grounded contact
     * shadows, place the ellipsoid so its surface coincides with the head's physics proxy
     * where objects strike it - a shadow cast onto a recessed surface floats visibly away
     * from the thing casting it.
     * @type {Vec3}
     * @attribute
     */
    center = new Vec3(0, 0.5, -1.5);

    /**
     * The size of the cranium ellipsoid in local space centimeters.
     * @type {Vec3}
     * @attribute
     */
    size = new Vec3(15, 17.5, 17.5);

    /**
     * The opacity of a fully shadowed pixel, from 0 (shadows invisible) to 1 (shadows are pure
     * black).
     * @type {number}
     * @attribute
     */
    strength = 0.55;

    /**
     * Whether to render the catcher visibly to debug its fit: a plain lit surface instead of the
     * invisible shadow-only material, so both the geometry and the shadows landing on it can be
     * checked against the tracked head.
     * @type {boolean}
     * @attribute
     */
    debug = false;

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
        // The catcher blends, so it lives in a layer whose transparent pass runs before the
        // world layer: its depth then occludes world geometry passing behind the head, the same
        // trick the headOccluder script uses with opaque depth-only geometry. The layer's opaque
        // pass is inserted too, for the opaque surface the debug mode swaps in.
        const layers = this.app.scene.layers;
        const world = layers.getLayerById(LAYERID_WORLD);
        const layer = new Layer({ name: 'headShadowCatcher' });
        layers.insertOpaque(layer, layers.getOpaqueIndex(world));
        layers.insertTransparent(layer, layers.getOpaqueIndex(world));

        const camera = this.app.root.findComponent('camera');
        if (camera) camera.layers = camera.layers.concat(layer.id);

        // The catcher only sees a light's shadow map if that light is assigned to its
        // layer, so join every shadow-casting directional light already in the scene
        const lights = this.app.root.findComponents('light').filter(
            light => light.type === 'directional' && light.castShadows
        );
        for (const light of lights) {
            light.layers = light.layers.concat(layer.id);
        }

        const material = this.debug ? this._createDebugMaterial() : this._createCatcherMaterial();
        this._material = material;
        this._layer = layer;

        if (this.ellipsoid) {
            const ellipsoid = new Entity('head-shadow-catcher-ellipsoid');
            ellipsoid.addComponent('render', {
                type: 'sphere',
                material: material,
                castShadows: false,
                layers: [layer.id]
            });
            ellipsoid.setLocalPosition(this.center);
            ellipsoid.setLocalScale(this.size);
            this.entity.addChild(ellipsoid);
            this._ellipsoid = ellipsoid;
        }

        this.on('destroy', () => {
            if (camera) camera.layers = camera.layers.filter(id => id !== layer.id);
            for (const light of lights) {
                light.layers = light.layers.filter(id => id !== layer.id);
            }
            this._ellipsoid?.destroy();
            material.destroy();
            layers.remove(layer);
        });
    }

    update(_dt) {
        // A model attached to this entity becomes part of the catcher. It may not be
        // instantiated yet when the script initializes, so keep looking until its mesh
        // instances exist, then convert them once
        if (this._modelConverted) return;

        for (const render of this.entity.findComponents('render')) {
            if (render.entity === this._ellipsoid || render.meshInstances.length === 0) continue;

            render.layers = [this._layer.id];
            render.castShadows = false;
            for (const meshInstance of render.meshInstances) {
                meshInstance.material = this._material;
            }
            this._modelConverted = true;
        }
    }

    /**
     * Creates the shadow catcher material: the engine's `shadowCatcher` flag accumulates the
     * directional shadow term into `dShadowCatcher`, and an override of the final shader output
     * turns it into premultiplied black with the shadow in alpha. With premultiplied blending
     * the canvas gains alpha (and no color) where the shadow falls, darkening the video behind
     * it. Everywhere the shadow does not fall the alpha stays 0 and the catcher is invisible.
     * @returns {StandardMaterial} The material.
     * @private
     */
    _createCatcherMaterial() {
        const material = new StandardMaterial();
        material.shadowCatcher = true;
        material.blendType = BLEND_PREMULTIPLIED;
        material.depthWrite = true;
        material.opacity = this.strength;

        // The color output is discarded by the override, so keep the shading as cheap as possible
        material.diffuse.set(0, 0, 0);
        material.specular.set(0, 0, 0);
        material.useSkybox = false;

        // The alpha is gated by how much direct light the surface would receive: a face
        // turned away from the light has nothing for an occluder to take away, and without
        // the gate the shadow map wraps the darkening around the terminator onto the far
        // side of the head. The gate assumes the catcher's light is in slot 0, which holds
        // here because only shadow-casting directional lights join the catcher layer.
        material.shaderChunksVersion = CHUNKS_VERSION;
        material.getShaderChunks(SHADERLANGUAGE_GLSL).set('outlineOutputPS', `
            float catcherFacing = clamp(dot(litArgs_worldNormal, -light0_direction), 0.0, 1.0);
            gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - dShadowCatcher) * litArgs_opacity * catcherFacing);
        `);
        material.getShaderChunks(SHADERLANGUAGE_WGSL).set('outlineOutputPS', `
            let catcherFacing = clamp(dot(litArgs_worldNormal, -uniform.light0_direction), 0.0, 1.0);
            output.color = vec4f(0.0, 0.0, 0.0, (1.0 - dShadowCatcher) * litArgs_opacity * catcherFacing);
        `);

        material.update();
        return material;
    }

    /**
     * Creates the debug material: an ordinary lit surface, so the ellipsoid's fit and the
     * shadows landing on it are both visible.
     * @returns {StandardMaterial} The material.
     * @private
     */
    _createDebugMaterial() {
        const material = new StandardMaterial();
        material.diffuse.set(0.35, 0.55, 0.9);
        material.update();
        return material;
    }
}
