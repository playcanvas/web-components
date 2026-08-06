import { BAKE_COLOR, Script } from 'playcanvas';

/**
 * Bakes ambient occlusion from the scene's environment lighting into this entity's geometry,
 * giving a soft contact shadow wherever other objects meet it. Attach it to a ground plane placed
 * under the models you want grounded.
 *
 * Unlike a shadow catcher, this needs no light: the occlusion comes from the environment that is
 * already lighting the scene, so it stays consistent with the lighting instead of relying on an
 * invented directional light. It suits static scenes - the bake is a one-off, and does not follow
 * anything that moves afterwards.
 *
 * Three things here cannot be expressed declaratively today: marking a render component as
 * lightmapped, the scene's ambient bake settings, and triggering the bake.
 */
export class BakedAo extends Script {
    static scriptName = 'bakedAo';

    /**
     * The number of samples used to bake the occlusion. Higher is smoother, but slower to bake.
     * @attribute
     */
    samples = 64;

    /**
     * The contrast of the baked occlusion. Negative values soften the falloff.
     * @attribute
     */
    contrast = -0.6;

    /**
     * The brightness of the baked occlusion. Negative values deepen the shadow.
     * @attribute
     */
    brightness = -0.65;

    /**
     * How much of the sphere the ambient light is taken from. 0.4 is roughly an upper hemisphere,
     * which is what a ground plane wants - a full sphere would light it from below as well.
     * @attribute
     */
    spherePart = 0.4;

    /**
     * The resolution of the baked lightmap.
     * @attribute
     */
    resolution = 2048;

    /**
     * The radius, in lightmap texels, of the denoising filter applied after baking.
     * @attribute
     */
    filterRange = 10;

    /**
     * The strength of the denoising filter applied after baking.
     * @attribute
     */
    filterSmoothness = 0.2;

    /** Guards against queueing more than one bake at a time. */
    _bakeQueued = false;

    initialize() {
        const render = this.entity.render;
        if (!render) {
            console.warn('bakedAo: no render component to bake into - add one to this entity');
            return;
        }

        const scene = this.app.scene;

        scene.lightmapMode = BAKE_COLOR;
        scene.lightmapMaxResolution = this.resolution;

        // Lightmap size is derived from world-space area scaled by this multiplier, then clamped
        // to lightmapMaxResolution. Deliberately overshooting lets the clamp above decide, so the
        // resolution holds whatever size the plane is given.
        scene.lightmapSizeMultiplier = this.resolution;

        scene.ambientBake = true;
        scene.ambientBakeNumSamples = this.samples;
        scene.ambientBakeOcclusionContrast = this.contrast;
        scene.ambientBakeOcclusionBrightness = this.brightness;
        scene.ambientBakeSpherePart = this.spherePart;

        // Occlusion baked from a sample count this modest is grainy without denoising
        scene.lightmapFilterEnabled = true;
        scene.lightmapFilterRange = this.filterRange;
        scene.lightmapFilterSmoothness = this.filterSmoothness;

        render.lightmapped = true;

        // The receiver must not occlude itself. castShadowsLightmap defaults to true, and a plane
        // casting the bake's straight-down shadow onto itself is coplanar with that shadow, which
        // bakes the whole lightmap black.
        render.castShadowsLightmap = false;

        // Bake once every model is in the scene, and again whenever one reloads, so the occlusion
        // always matches the geometry actually present. Occluders need no setup of their own:
        // castShadowsLightmap defaults to true for them.
        const models = Array.from(document.querySelectorAll('pc-model'));
        const request = () => {
            if (models.every((model) => model.entity)) {
                this._scheduleBake();
            }
        };
        models.forEach((model) => model.addEventListener('load', request));
        this.on('destroy', () => {
            models.forEach((model) => model.removeEventListener('load', request));
        });
        request();
    }

    /**
     * Queues a bake to run outside the engine's frame. Baking from within the update or render
     * loop submits its own GPU work mid-frame, which invalidates the command encoder WebGPU is
     * building for that frame and corrupts the rest of it.
     */
    _scheduleBake() {
        if (this._bakeQueued) {
            return;
        }
        this._bakeQueued = true;
        setTimeout(() => {
            this._bakeQueued = false;
            this.app.lightmapper.bake(null, BAKE_COLOR);
        }, 0);
    }
}
