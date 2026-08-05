import { BLEND_NORMAL, Color, Script } from 'playcanvas';

/** The names of the lens materials to tint, as authored in the model. */
const LENS_MATERIALS = ['lens_exterior', 'lens_interior'];

/** The name of the nose pad material, made translucent but never tinted. */
const NOSEPAD_MATERIAL = 'nose_pads';

/**
 * Makes the lenses of a glasses model work as tinted glass over a camera feed, and
 * retints them on demand.
 *
 * The sunglasses model authors its lenses with the glTF transmission extension, which
 * the engine maps to dynamic refraction. Refraction samples the rendered scene, but in
 * an AR view the "scene" behind the lenses is the transparent canvas with a DOM video
 * element showing through - so refractive lenses would render dark instead of revealing
 * the user's eyes. This script converts the lens materials to plain alpha blending: the
 * video shows through the translucent tint, while the sky lighting keeps its specular
 * reflections on the glass.
 *
 * Attach to the entity that instantiates the glasses model. Listens for a `lens:color`
 * event on the application, fired with a CSS hex color (and optionally an opacity) to
 * retint the lenses live.
 */
export class LensTint extends Script {
    static scriptName = 'lensTint';

    /**
     * The lens tint color.
     * @type {Color}
     * @attribute
     */
    color = new Color(0.118, 0.227, 0.188);

    /**
     * The lens opacity (0 is clear, 1 is solid).
     * @type {number}
     * @attribute
     */
    opacity = 0.45;

    /**
     * @type {import('playcanvas').StandardMaterial[]}
     * @private
     */
    _lensMaterials = [];

    /** @private */
    _patched = false;

    initialize() {
        this.app.on('lens:color', this._onColor, this);
        this.on('destroy', () => {
            this.app.off('lens:color', this._onColor, this);
        });

        // Patch immediately when possible: if the entity starts disabled and is enabled
        // once a face is found, this runs before the frame renders, so the lenses never
        // draw with their original transmission materials
        this._tryPatch();
    }

    update(_dt) {
        // The model may not be instantiated yet when the script initializes, so keep
        // looking until its mesh instances (and materials) exist, then patch them once
        if (!this._patched) this._tryPatch();
    }

    /**
     * Converts the lens and nose pad materials once their mesh instances exist.
     * @private
     */
    _tryPatch() {
        for (const render of this.entity.findComponents('render')) {
            for (const meshInstance of render.meshInstances) {
                const material = meshInstance.material;
                if (LENS_MATERIALS.includes(material.name)) {
                    if (!this._lensMaterials.includes(material)) {
                        this._makeTranslucent(material);
                        this._lensMaterials.push(material);
                    }
                } else if (material.name === NOSEPAD_MATERIAL) {
                    this._makeTranslucent(material);
                    material.diffuse.set(0.6, 0.6, 0.6);
                    material.opacity = 0.55;
                    material.update();
                }
            }
        }

        if (this._lensMaterials.length > 0) {
            this._patched = true;
            this._applyColor();
        }
    }

    /**
     * Swaps a material's transmission-style refraction for plain alpha blending.
     * @param {import('playcanvas').StandardMaterial} material - The material to convert.
     * @private
     */
    _makeTranslucent(material) {
        material.useDynamicRefraction = false;
        material.refraction = 0;
        material.blendType = BLEND_NORMAL;
        // Blended surfaces should not write depth: the interior and exterior lens
        // surfaces sit almost on top of each other and would z-fight over draw order
        material.depthWrite = false;
    }

    /**
     * Applies the current tint color and opacity to the lens materials.
     * @private
     */
    _applyColor() {
        for (const material of this._lensMaterials) {
            material.diffuse.copy(this.color);
            material.opacity = this.opacity;
            material.update();
        }
    }

    /**
     * Handles the `lens:color` event.
     * @param {string} hex - The tint as a CSS hex color.
     * @param {number} [opacity] - The lens opacity (0 to 1). Unchanged if omitted.
     * @private
     */
    _onColor(hex, opacity) {
        this.color.fromString(hex);
        if (typeof opacity === 'number') this.opacity = opacity;
        this._applyColor();
    }
}
