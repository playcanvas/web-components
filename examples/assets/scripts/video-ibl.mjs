import { EnvLighting, Script, Texture } from 'playcanvas';

/** The fraction of the equirect's width covered by the camera's actual view (~100 degrees). */
const BAND_WIDTH = 0.28;

/** The fraction of the equirect's height covered by the camera's actual view (~63 degrees). */
const BAND_HEIGHT = 0.35;

/**
 * Lights the scene with the live camera feed: a low-frequency image-based lighting estimate
 * rebuilt from the video every few moments, so virtual objects pick up the room's real color
 * temperature, brightness and rough bright-region direction instead of a canned environment.
 *
 * A single fixed webcam cannot see the light that actually falls on the subject - the feed
 * shows the room behind them, one camera's field of view of it - so this is an estimate in
 * the spirit of mobile AR lighting estimation, not a true environment capture. The frame is
 * stretched over the whole sphere to set the ambient average everywhere, and the region the
 * camera genuinely observes is painted into its band of the panorama, so reflections lean
 * roughly the right way. Prefiltering does the rest: at these resolutions the result is soft
 * ambient and glossy tint, not mirror reflections.
 *
 * Pairs with the `cameraFeed` script: this script idles until `camera:ready` fires, leaving
 * whatever lighting the scene declares (like a `pc-sky`) untouched as the fallback - so `?sim`
 * pages and denied camera permissions keep working unchanged.
 */
export class VideoIbl extends Script {
    static scriptName = 'videoIbl';

    /**
     * The intensity of the video lighting, applied to the scene's skybox intensity while the
     * estimate is live. The scene's previous intensity is restored if the script is destroyed.
     * @type {number}
     * @attribute
     */
    intensity = 0.5;

    /**
     * The seconds between lighting rebuilds. Room lighting changes slowly, so a leisurely
     * cadence costs nothing visible.
     * @type {number}
     * @attribute
     */
    interval = 1;

    /**
     * Whether the camera feed is displayed mirrored (the `cameraFeed` default). The panorama
     * is flipped to match, so on-screen room features tint from the side they appear on.
     * @type {boolean}
     * @attribute
     */
    mirror = true;

    /**
     * The rotation of the panorama in degrees, for nudging the observed band away from the
     * camera's view direction if directional reflections matter.
     * @type {number}
     * @attribute
     */
    rotation = 0;

    /**
     * The width of the panorama in texels (the height is half). Lighting is prefiltered, so
     * small stays smooth - raise it only if glossy reflections need more shape.
     * @type {number}
     * @attribute
     */
    resolution = 64;

    /** @private */
    _source = null;

    /** @private */
    _canvas = null;

    /** @private */
    _ctx = null;

    /** @private */
    _texture = null;

    /** @private */
    _lightingSource = null;

    /** @private */
    _atlas = null;

    /** @private */
    _timer = Infinity;

    /** @private */
    _active = false;

    /** @private */
    _prevAtlas = null;

    /** @private */
    _prevIntensity = 1;

    initialize() {
        const onReady = (video) => {
            this._source = video;
            this._timer = Infinity; // rebuild on the next update
        };
        this.app.on('camera:ready', onReady);

        this.on('destroy', () => {
            this.app.off('camera:ready', onReady);
            if (this._active) {
                this.app.scene.envAtlas = this._prevAtlas;
                this.app.scene.skyboxIntensity = this._prevIntensity;
            }
            this._atlas?.destroy();
            this._lightingSource?.destroy();
            this._texture?.destroy();
        });
    }

    /**
     * @param {number} dt - The delta time since the last frame in seconds.
     */
    update(dt) {
        if (!this._source) return;

        this._timer += dt;
        if (this._timer < this.interval) return;
        this._timer = 0;

        this._rebuild();
    }

    /**
     * Rebuilds the lighting estimate from the current video frame.
     * @private
     */
    _rebuild() {
        const width = Math.max(16, this.resolution);
        const height = width / 2;

        if (!this._canvas) {
            this._canvas = document.createElement('canvas');
            this._canvas.width = width;
            this._canvas.height = height;
            this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
            // Mipmaps matter: with them the cubemap projection samples each texel once,
            // without them it falls back to 1024 samples per texel
            this._texture = new Texture(this.app.graphicsDevice, {
                name: 'video-ibl-equirect',
                width: width,
                height: height,
                mipmaps: true
            });
        }

        const ctx = this._ctx;
        ctx.save();
        if (this.mirror) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
        }

        // The whole sphere gets the stretched frame - the low-frequency average from every
        // direction - and the band the camera actually observes gets the frame at its true
        // extent, so bright regions pull reflections from the right way. The camera looks
        // down -Z, which the engine's equirect mapping puts at the panorama seam (u = 0),
        // so the band is drawn wrapping across both edges.
        ctx.drawImage(this._source, 0, 0, width, height);
        const bandW = Math.round(width * BAND_WIDTH);
        const bandH = Math.round(height * BAND_HEIGHT);
        const bandY = Math.round((height - bandH) / 2);
        const seam = ((this.rotation / 360) % 1 + 1) % 1;
        const bandX = Math.round(seam * width - bandW / 2);
        ctx.drawImage(this._source, bandX - width, bandY, bandW, bandH);
        ctx.drawImage(this._source, bandX, bandY, bandW, bandH);
        ctx.drawImage(this._source, bandX + width, bandY, bandW, bandH);
        ctx.restore();

        this._texture.setSource(this._canvas);
        this._lightingSource = EnvLighting.generateLightingSource(this._texture, {
            target: this._lightingSource,
            size: 64
        });
        // A small atlas with modest sample counts: the source is tiny and low-frequency,
        // and the engine's 512px/1024-sample defaults would burn tens of milliseconds of
        // GPU time per rebuild for detail that does not exist
        this._atlas = EnvLighting.generateAtlas(this._lightingSource, {
            target: this._atlas,
            size: 128,
            numReflectionSamples: 64,
            numAmbientSamples: 256
        });

        if (!this._active) {
            this._active = true;
            this._prevAtlas = this.app.scene.envAtlas;
            this._prevIntensity = this.app.scene.skyboxIntensity;
            this.app.scene.skyboxIntensity = this.intensity;
        }
        this.app.scene.envAtlas = this._atlas;
    }
}
