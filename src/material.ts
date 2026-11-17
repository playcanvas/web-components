import {
    BLEND_ADDITIVE,
    BLEND_ADDITIVEALPHA,
    BLEND_MAX,
    BLEND_MIN,
    BLEND_MULTIPLICATIVE,
    BLEND_MULTIPLICATIVE2X,
    BLEND_NONE,
    BLEND_NORMAL,
    BLEND_PREMULTIPLIED,
    BLEND_SCREEN,
    BLEND_SUBTRACTIVE,
    Color,
    CULLFACE_BACK,
    CULLFACE_FRONT,
    CULLFACE_FRONTANDBACK,
    CULLFACE_NONE,
    FRESNEL_NONE,
    FRESNEL_SCHLICK,
    SPECOCC_AO,
    SPECOCC_GLOSSDEPENDENT,
    SPECOCC_NONE,
    StandardMaterial,
    Vec2
} from 'playcanvas';
import type { Texture } from 'playcanvas';

import type { AppElement } from './app';
import { AssetBinding, findById } from './asset-binding';
import { applyAttribute, attr, attributeNames, defineAttributes, engineData } from './attributes';
import { HTMLElement } from './html-element';
import { parseNumber } from './parse';

/**
 * The blend modes for a material.
 *
 * @category Types
 */
export type BlendType =
    | 'none'
    | 'normal'
    | 'additive'
    | 'additive-alpha'
    | 'premultiplied'
    | 'multiplicative'
    | 'multiplicative-2x'
    | 'screen'
    | 'min'
    | 'max'
    | 'subtractive';

const blendTypes = new Map<BlendType, number>([
    ['none', BLEND_NONE],
    ['normal', BLEND_NORMAL],
    ['additive', BLEND_ADDITIVE],
    ['additive-alpha', BLEND_ADDITIVEALPHA],
    ['premultiplied', BLEND_PREMULTIPLIED],
    ['multiplicative', BLEND_MULTIPLICATIVE],
    ['multiplicative-2x', BLEND_MULTIPLICATIVE2X],
    ['screen', BLEND_SCREEN],
    ['min', BLEND_MIN],
    ['max', BLEND_MAX],
    ['subtractive', BLEND_SUBTRACTIVE]
]);

/**
 * The face culling modes for a material.
 *
 * @category Types
 */
export type CullMode = 'none' | 'back' | 'front' | 'front-and-back';

const cullModes = new Map<CullMode, number>([
    ['none', CULLFACE_NONE],
    ['back', CULLFACE_BACK],
    ['front', CULLFACE_FRONT],
    ['front-and-back', CULLFACE_FRONTANDBACK]
]);

/**
 * The Fresnel models for a material.
 *
 * @category Types
 */
export type FresnelModel = 'none' | 'schlick';

const fresnelModels = new Map<FresnelModel, number>([
    ['none', FRESNEL_NONE],
    ['schlick', FRESNEL_SCHLICK]
]);

/**
 * The specular occlusion modes for a material.
 *
 * @category Types
 */
export type OccludeSpecular = 'none' | 'ao' | 'gloss-dependent';

const occludeSpeculars = new Map<OccludeSpecular, number>([
    ['none', SPECOCC_NONE],
    ['ao', SPECOCC_AO],
    ['gloss-dependent', SPECOCC_GLOSSDEPENDENT]
]);

/**
 * The opacity dithering modes for a material.
 *
 * @category Types
 */
export type OpacityDither = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'bayer16' | 'bluenoise' | 'ignnoise';

// The DITHER_* constants are strings whose values are exactly these names, so a parsed value is
// assigned to the material unchanged rather than mapped through a table.
const opacityDithers: OpacityDither[] = ['none', 'bayer2', 'bayer4', 'bayer8', 'bayer16', 'bluenoise', 'ignnoise'];

/**
 * How a material's height map offsets the UVs of its other maps: `offset` takes a single tap of
 * the height map, and `occlusion` marches the view ray through the height field for deeper relief
 * at the cost of several taps per pixel.
 *
 * @category Types
 */
export type ParallaxMode = 'offset' | 'occlusion';

// The PARALLAX_* constants are strings whose values are exactly these names
const parallaxModes: ParallaxMode[] = ['offset', 'occlusion'];

/**
 * The texture channels a color map can sample.
 *
 * @category Types
 */
export type ColorChannel = 'r' | 'g' | 'b' | 'a' | 'rgb';

const colorChannels: ColorChannel[] = ['r', 'g', 'b', 'a', 'rgb'];

/**
 * The texture channels a scalar map can sample.
 *
 * @category Types
 */
export type ScalarChannel = 'r' | 'g' | 'b' | 'a';

const scalarChannels: ScalarChannel[] = ['r', 'g', 'b', 'a'];

/**
 * The attributes that contradict a `roughness-*` attribute: each one carries the opposite
 * interpretation of a value the aliases also write. The `gloss-map-*` modifiers are deliberately
 * absent - they only configure the shared slot (tiling, offset, channel and so on) and carry no
 * interpretation of their own, so they are the supported way to configure a `roughness-map`.
 */
const glossConflicts = ['gloss', 'gloss-invert', 'gloss-map'];

/** The aliases those attributes contradict. */
const roughnessAliases = ['roughness', 'roughness-map'];

/**
 * The texture slots a `pc-material` can populate. Each is backed by a `pc-asset` id rather than a
 * `Texture`, so the element can be authored before the asset has loaded.
 */
type TextureSlot =
    'aoMap' | 'diffuseMap' | 'emissiveMap' | 'glossMap' | 'heightMap' | 'metalnessMap' | 'normalMap' | 'opacityMap';

/** The elements with a material update queued. */
const updating = new WeakSet<MaterialElement>();

/**
 * Coalesces `material.update()` across a burst of attribute or property writes, so that setting a
 * dozen attributes in one parse costs one update rather than a dozen.
 *
 * @param element - The element whose material to update.
 */
const scheduleUpdate = (element: MaterialElement) => {
    if (updating.has(element)) return;
    updating.add(element);
    queueMicrotask(() => {
        updating.delete(element);
        element.material?.update();
    });
};

/**
 * The MaterialElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-material/ | `<pc-material>`} elements.
 * The MaterialElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * A `pc-material` must be a direct child of `pc-app` — elements placed elsewhere log a warning
 * and never create a material. Elements inserted while the application is already running are
 * created on insertion.
 *
 * The element is metal/rough by default: unlike a bare `StandardMaterial` it enables the metalness
 * workflow, which is what the `metalness-*` attributes assume and what glTF means by PBR. It also
 * defaults `metalness` to 0 rather than the engine's 1, because those two defaults have to be
 * chosen together - the engine's 1 is unreachable under its own `useMetalness` of false, and with
 * the workflow on it would make every material fully metallic, so `<pc-material diffuse="crimson">`
 * would render as dark tinted reflections of an environment that may not exist rather than as a
 * crimson surface. `metalness="1"` remains one attribute away.
 *
 * The `roughness` and `roughness-map` attributes are aliases for `gloss` and `gloss-map` that
 * additionally invert the gloss channel; do not mix the two families on one element.
 *
 * The two aliases are documented here rather than on an accessor, because they resolve to the
 * `gloss` properties and would otherwise inherit gloss's description - which reads inverted.
 *
 * @elementSummary The `<pc-material>` element defines a physically based material, which
 * `<pc-render>` elements apply by naming its `id`. It is metal/rough by default, with `metalness`
 * starting at 0. Must be a direct child of `<pc-app>`.
 *
 * @attribute {number} roughness - The roughness of the material, from 0 (shiny) to 1 (rough). An
 * alias for `gloss` that also inverts it, so do not combine it with the `gloss` attributes.
 * @attribute {string} roughness-map - The id of the `pc-asset` to use as the roughness map. An
 * alias for `gloss-map` that also inverts the gloss channel, so do not combine it with the `gloss`
 * attributes.
 *
 * @category Resources
 */
class MaterialElement extends HTMLElement {
    /**
     * The alpha used by opacity dithering, which needs an `opacity-dither` mode other than `none`.
     * It ranges from 0 to 1, and lets a material be alpha blended by `opacity` and dithered by
     * this at the same time. Defaults to `null`, which dithers by `opacity`.
     */
    declare alphaDither: number | null;

    /**
     * The alpha test reference value. Fragments with an opacity below this value are discarded.
     */
    declare alphaTest: number;

    /**
     * Whether to use alpha to coverage. It resolves transparency using multisampling.
     */
    declare alphaToCoverage: boolean;

    /**
     * The strength of the ambient occlusion map. It ranges from 0 to 1.
     */
    declare aoIntensity: number;

    /**
     * The color channel of the ambient occlusion map to sample.
     */
    declare aoMapChannel: ScalarChannel;

    /**
     * The 2D offset of the ambient occlusion map.
     */
    declare aoMapOffset: Vec2;

    /**
     * The 2D rotation of the ambient occlusion map. It is in degrees.
     */
    declare aoMapRotation: number;

    /**
     * The 2D tiling of the ambient occlusion map.
     */
    declare aoMapTiling: Vec2;

    /**
     * The UV channel the ambient occlusion map samples.
     */
    declare aoMapUv: number;

    /**
     * How the material is blended with the scene behind it.
     */
    declare blendType: BlendType;

    /**
     * The strength of the normal map. 0 is flat and 1 is the map's full effect.
     */
    declare bumpiness: number;

    /**
     * Which faces of a mesh are culled.
     */
    declare cull: CullMode;

    /**
     * The offset applied to the depth of a fragment. It is used to resolve z-fighting.
     */
    declare depthBias: number;

    /**
     * Whether fragments are tested against the depth buffer.
     */
    declare depthTest: boolean;

    /**
     * Whether fragments write to the depth buffer.
     */
    declare depthWrite: boolean;

    /**
     * The diffuse color of the material. With the metalness workflow this doubles as the specular
     * color where the surface is metallic.
     */
    declare diffuse: Color;

    /**
     * The color channels of the diffuse map to sample.
     */
    declare diffuseMapChannel: ColorChannel;

    /**
     * The 2D offset of the diffuse map.
     */
    declare diffuseMapOffset: Vec2;

    /**
     * The 2D rotation of the diffuse map. It is in degrees.
     */
    declare diffuseMapRotation: number;

    /**
     * The 2D tiling of the diffuse map.
     */
    declare diffuseMapTiling: Vec2;

    /**
     * The UV channel the diffuse map samples.
     */
    declare diffuseMapUv: number;

    /**
     * The emissive color of the material. It is added to the lit result.
     */
    declare emissive: Color;

    /**
     * The multiplier applied to the emissive color and map.
     */
    declare emissiveIntensity: number;

    /**
     * The color channels of the emissive map to sample.
     */
    declare emissiveMapChannel: ColorChannel;

    /**
     * The 2D offset of the emissive map.
     */
    declare emissiveMapOffset: Vec2;

    /**
     * The 2D rotation of the emissive map. It is in degrees.
     */
    declare emissiveMapRotation: number;

    /**
     * The 2D tiling of the emissive map.
     */
    declare emissiveMapTiling: Vec2;

    /**
     * The UV channel the emissive map samples.
     */
    declare emissiveMapUv: number;

    /**
     * Whether to use the GGX specular model. It supports anisotropy.
     */
    declare enableGGXSpecular: boolean;

    /**
     * Whether the material is shaded with the geometric normal of each triangle. That is in place
     * of the normals interpolated from its vertices, and gives the surface a faceted look.
     */
    declare flatShading: boolean;

    /**
     * The Fresnel model used for specular reflections at grazing angles.
     */
    declare fresnelModel: FresnelModel;

    /**
     * The glossiness of the material. It ranges from 0 (rough) to 1 (shiny). See also `roughness`.
     */
    declare gloss: number;

    /**
     * Whether the gloss value and map are inverted. Inverting them makes the material treat them
     * as roughness. Setting `roughness` or `roughness-map` enables this automatically.
     */
    declare glossInvert: boolean;

    /**
     * The color channel of the gloss map to sample.
     */
    declare glossMapChannel: ScalarChannel;

    /**
     * The 2D offset of the gloss map.
     */
    declare glossMapOffset: Vec2;

    /**
     * The 2D rotation of the gloss map. It is in degrees.
     */
    declare glossMapRotation: number;

    /**
     * The 2D tiling of the gloss map.
     */
    declare glossMapTiling: Vec2;

    /**
     * The UV channel the gloss map samples.
     */
    declare glossMapUv: number;

    /**
     * The height map value that sits at the level of the geometry. It ranges from 0 to 1: relief
     * above it stands out of the surface and relief below it sinks in. Defaults to 0.5; 1 treats
     * the map as pure depth and 0 as pure elevation.
     */
    declare heightMapBase: number;

    /**
     * The color channel of the height map to sample.
     */
    declare heightMapChannel: ScalarChannel;

    /**
     * The strength of the parallax effect driven by the height map.
     */
    declare heightMapFactor: number;

    /**
     * The 2D offset of the height map.
     */
    declare heightMapOffset: Vec2;

    /**
     * The 2D rotation of the height map. It is in degrees.
     */
    declare heightMapRotation: number;

    /**
     * The 2D tiling of the height map.
     */
    declare heightMapTiling: Vec2;

    /**
     * The UV channel the height map samples.
     */
    declare heightMapUv: number;

    /**
     * How metallic the surface is. It ranges from 0 (dielectric) to 1 (metal).
     */
    declare metalness: number;

    /**
     * The color channel of the metalness map to sample.
     */
    declare metalnessMapChannel: ScalarChannel;

    /**
     * The 2D offset of the metalness map.
     */
    declare metalnessMapOffset: Vec2;

    /**
     * The 2D rotation of the metalness map. It is in degrees.
     */
    declare metalnessMapRotation: number;

    /**
     * The 2D tiling of the metalness map.
     */
    declare metalnessMapTiling: Vec2;

    /**
     * The UV channel the metalness map samples.
     */
    declare metalnessMapUv: number;

    /**
     * The name of the material - the label shown wherever materials surface by name, such as
     * profilers, GPU captures and the assignments `pc-model.hierarchy()` reports. Purely a label:
     * element references resolve through `id`.
     */
    declare name: string;

    /**
     * The 2D offset of the normal map.
     */
    declare normalMapOffset: Vec2;

    /**
     * The 2D rotation of the normal map. It is in degrees.
     */
    declare normalMapRotation: number;

    /**
     * The 2D tiling of the normal map.
     */
    declare normalMapTiling: Vec2;

    /**
     * The UV channel the normal map samples.
     */
    declare normalMapUv: number;

    /**
     * Whether ambient occlusion also attenuates direct lighting.
     */
    declare occludeDirect: boolean;

    /**
     * How specular reflections are occluded.
     */
    declare occludeSpecular: OccludeSpecular;

    /**
     * The opacity of the material, which requires a `blend-type` other than `none` to have any
     * visible effect. It ranges from 0 (transparent) to 1 (opaque).
     */
    declare opacity: number;

    /**
     * The dithering used to render opacity. It approximates transparency without blending.
     */
    declare opacityDither: OpacityDither;

    /**
     * Whether specular highlights fade out as the material becomes transparent.
     */
    declare opacityFadesSpecular: boolean;

    /**
     * The color channel of the opacity map to sample.
     */
    declare opacityMapChannel: ScalarChannel;

    /**
     * The 2D offset of the opacity map.
     */
    declare opacityMapOffset: Vec2;

    /**
     * The 2D rotation of the opacity map. It is in degrees.
     */
    declare opacityMapRotation: number;

    /**
     * The 2D tiling of the opacity map.
     */
    declare opacityMapTiling: Vec2;

    /**
     * The UV channel the opacity map samples.
     */
    declare opacityMapUv: number;

    /**
     * How the height map offsets the UVs of the other maps. Can be:
     *
     * - `offset` - A single tap of the height map.
     * - `occlusion` - Marches the view ray through the height field, for deeper relief without
     * smearing at the cost of several taps per pixel. The silhouette of the mesh is unchanged.
     *
     * Defaults to `offset`.
     */
    declare parallaxMode: ParallaxMode;

    /**
     * The maximum number of height map taps along the view ray, which applies only when
     * `parallax-mode` is `occlusion`. Defaults to 16.
     */
    declare parallaxSamples: number;

    /**
     * The maximum number of height map taps towards each directional light, which applies only
     * when `parallax-mode` is `occlusion`. The taps soft-shadow the relief against itself.
     * Defaults to 0, no self-shadowing.
     */
    declare parallaxShadowSamples: number;

    /**
     * The depth offset applied in proportion to a surface's slope. It is used to resolve
     * z-fighting.
     */
    declare slopeDepthBias: number;

    /**
     * The specular color of the material, which applies only when the metalness workflow is
     * disabled or `use-metalness-specular-color` is enabled.
     */
    declare specular: Color;

    /**
     * The strength of specular reflections at direct angles, which applies only when
     * `use-metalness-specular-color` is enabled. It ranges from 0 to 1.
     */
    declare specularityFactor: number;

    /**
     * Whether back faces are lit as though their normals were flipped.
     */
    declare twoSidedLighting: boolean;

    /**
     * Whether the material is affected by scene fog.
     */
    declare useFog: boolean;

    /**
     * Whether the material is affected by scene lights. When disabled the material renders unlit,
     * using the diffuse color and map alone.
     */
    declare useLighting: boolean;

    /**
     * Whether to use the metalness workflow. The alternative is the older specular workflow.
     * Unlike a bare `StandardMaterial` this defaults to `true`, because the `metalness-*`
     * attributes have no effect without it.
     */
    declare useMetalness: boolean;

    /**
     * Whether the specular color tints reflections while the metalness workflow is in use.
     */
    declare useMetalnessSpecularColor: boolean;

    /**
     * Whether the material is lit by the scene's skybox.
     */
    declare useSkybox: boolean;

    /**
     * Whether the camera's tone mapping is applied to the material.
     */
    declare useTonemap: boolean;

    private _aoMap = '';

    private _diffuseMap = '';

    private _emissiveMap = '';

    private _glossMap = '';

    private _heightMap = '';

    private _metalnessMap = '';

    private _normalMap = '';

    private _opacityMap = '';

    /**
     * One asset binding per texture slot, created on first use and kept for the element's
     * lifetime. A slot's binding is superseded when the slot is reassigned and canceled when the
     * element disconnects, so a late-arriving asset can never write a texture the element no
     * longer wants.
     */
    private _mapBindings = new Map<TextureSlot, AssetBinding>();

    private _glossConflictWarned = false;

    /**
     * The material. `null` until the containing application has created it — an element present
     * at startup has its material once the application is ready.
     */
    material: StandardMaterial | null = null;

    async connectedCallback() {
        const appElement = (this.parentElement?.closest('pc-app') as AppElement | null) ?? null;

        // Materials must be direct children of pc-app (matches the boot query ':scope > pc-material')
        if (!appElement || this.parentElement !== appElement) {
            console.warn(`pc-material '${this.id}' must be a direct child of pc-app - material not created`);
            return;
        }

        await appElement.ready();

        // The element may have been removed or re-parented while waiting for the app
        if (!this.isConnected || this.parentElement !== appElement) return;

        // Materials present at startup are created by AppElement's boot; this branch handles
        // elements inserted (or re-inserted) after the app is already running
        if (!this.material) {
            if (!appElement.app) return; // pc-app is re-connecting; its own boot will create this
            this._createMaterial();
        }
    }

    /**
     * Creates the material from the element's properties. Called by the containing `<pc-app>`
     * element during its boot sweep, and on connection for elements inserted while the
     * application is already running.
     *
     * @internal
     */
    _createMaterial() {
        const material = new StandardMaterial();
        this.material = material;

        // Every attribute in the schema, as the engine takes it
        Object.assign(material, engineData(this));

        // Texture slots resolve a pc-asset id, which may not have loaded yet
        this.aoMap = this._aoMap;
        this.diffuseMap = this._diffuseMap;
        this.emissiveMap = this._emissiveMap;
        this.glossMap = this._glossMap;
        this.heightMap = this._heightMap;
        this.metalnessMap = this._metalnessMap;
        this.normalMap = this._normalMap;
        this.opacityMap = this._opacityMap;

        material.update();
    }

    disconnectedCallback() {
        for (const binding of this._mapBindings.values()) {
            binding.cancel();
        }

        if (this.material) {
            this.material.destroy();
            this.material = null;
        }
    }

    /**
     * Warns when a `roughness-*` attribute is combined with one that carries the opposite
     * interpretation of the same value. They write the same engine properties but disagree about
     * whether the channel is inverted, so the result would depend on attribute order rather than
     * on intent.
     *
     * Called from both families rather than only from the roughness branches, because the two
     * orderings are equally wrong and only one of them would otherwise be caught. The conflict is
     * a property of the element rather than of any one write - and an upgrading element already
     * has all of its attributes, so every branch would otherwise report the same clash - so the
     * warning latches and reports once per episode, clearing when the clash is resolved.
     */
    private _warnGlossConflict() {
        const quote = (names: string[]) => `'${names.join("', '")}'`;

        const roughness = roughnessAliases.filter((name) => this.hasAttribute(name));
        const gloss = glossConflicts.filter((name) => this.hasAttribute(name));

        if (roughness.length === 0 || gloss.length === 0) {
            this._glossConflictWarned = false;
            return;
        }

        if (this._glossConflictWarned) return;
        this._glossConflictWarned = true;

        console.warn(
            `pc-material '${this.id}' sets both ${quote(roughness)} and ${quote(gloss)} - ` +
                'the roughness-* attributes invert gloss, so the two families contradict each other. Use one or the other.'
        );
    }

    /**
     * Points a texture slot at the resource of a `pc-asset`, waiting for the asset to load when
     * it has not already. An empty id clears the slot; a slot keeps its current texture while
     * the new asset loads, and also across a failed load - a later reload can still deliver.
     *
     * @param id - The id of the `pc-asset`, or an empty string to clear the slot.
     * @param slot - The material property to write.
     */
    private _setMap(id: string, slot: TextureSlot) {
        let binding = this._mapBindings.get(slot);
        if (!binding) {
            binding = new AssetBinding(this);
            this._mapBindings.set(slot, binding);
        }

        // Drop any load still pending for this slot - its texture is no longer the one we want.
        // Canceled here rather than left to the bind below, which the material-less and
        // clear-slot returns never reach.
        binding.cancel();

        if (!this.material) return;

        if (!id) {
            this.material[slot] = null;
            scheduleUpdate(this);
            return;
        }

        binding.bind(id, {
            load: (asset) => this._applyMap(slot, asset.resource as Texture)
        });
    }

    /**
     * @param slot - The material property to write.
     * @param texture - The loaded texture, applied with its sampler state untouched - anisotropy
     * and friends belong to the `pc-asset`'s texture options.
     */
    private _applyMap(slot: TextureSlot, texture: Texture) {
        if (!this.material) return;
        this.material[slot] = texture;
        scheduleUpdate(this);
    }

    /**
     * Sets the id of the `pc-asset` to use as the ambient occlusion map.
     * @param value - The asset id.
     */
    set aoMap(value: string) {
        this._aoMap = value;
        this._setMap(value, 'aoMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the ambient occlusion map.
     * @returns The asset id.
     */
    get aoMap() {
        return this._aoMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the diffuse map.
     * @param value - The asset id.
     */
    set diffuseMap(value: string) {
        this._diffuseMap = value;
        this._setMap(value, 'diffuseMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the diffuse map.
     * @returns The asset id.
     */
    get diffuseMap() {
        return this._diffuseMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the emissive map.
     * @param value - The asset id.
     */
    set emissiveMap(value: string) {
        this._emissiveMap = value;
        this._setMap(value, 'emissiveMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the emissive map.
     * @returns The asset id.
     */
    get emissiveMap() {
        return this._emissiveMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the gloss map. See also `roughnessMap`.
     * @param value - The asset id.
     */
    set glossMap(value: string) {
        this._glossMap = value;
        this._setMap(value, 'glossMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the gloss map.
     * @returns The asset id.
     */
    get glossMap() {
        return this._glossMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the height map, which drives parallax mapping.
     * @param value - The asset id.
     */
    set heightMap(value: string) {
        this._heightMap = value;
        this._setMap(value, 'heightMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the height map.
     * @returns The asset id.
     */
    get heightMap() {
        return this._heightMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the metalness map.
     * @param value - The asset id.
     */
    set metalnessMap(value: string) {
        this._metalnessMap = value;
        this._setMap(value, 'metalnessMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the metalness map.
     * @returns The asset id.
     */
    get metalnessMap() {
        return this._metalnessMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the normal map.
     * @param value - The asset id.
     */
    set normalMap(value: string) {
        this._normalMap = value;
        this._setMap(value, 'normalMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the normal map.
     * @returns The asset id.
     */
    get normalMap() {
        return this._normalMap;
    }

    /**
     * Sets the id of the `pc-asset` to use as the opacity map.
     * @param value - The asset id.
     */
    set opacityMap(value: string) {
        this._opacityMap = value;
        this._setMap(value, 'opacityMap');
    }

    /**
     * Gets the id of the `pc-asset` used as the opacity map.
     * @returns The asset id.
     */
    get opacityMap() {
        return this._opacityMap;
    }

    /**
     * Sets the roughness of the material, from 0 (shiny) to 1 (rough). This is an alias for `gloss`
     * that also inverts the gloss channel, so do not combine it with the `gloss` attributes.
     * @param value - The roughness.
     */
    set roughness(value: number) {
        this.gloss = value;
        this.glossInvert = true;
    }

    /**
     * Gets the roughness of the material.
     * @returns The roughness.
     */
    get roughness() {
        return this.gloss;
    }

    /**
     * Sets the id of the `pc-asset` to use as the roughness map. This is an alias for `glossMap`
     * that also inverts the gloss channel, so do not combine it with the `gloss` attributes.
     * @param value - The asset id.
     */
    set roughnessMap(value: string) {
        this.glossMap = value;
        this.glossInvert = true;
    }

    /**
     * Gets the id of the `pc-asset` used as the roughness map.
     * @returns The asset id.
     */
    get roughnessMap() {
        return this._glossMap;
    }

    /**
     * Returns the {@link StandardMaterial} created by the `<pc-material>` element with the given
     * `id`, or `undefined` if there is no such element or its material has not been created yet.
     *
     * The id is an element id. Given the element that refers to the material, it is looked for in
     * that element's `<pc-app>` first and then in the tree the element is in, which is the
     * document unless the application is inside a shadow root. That is how the library's own
     * elements resolve a material, and what keeps two applications that use the same id apart.
     * Without an element, only the document is searched.
     *
     * @param id - The `id` of the `<pc-material>` element.
     * @param from - The element that refers to the material.
     * @returns The material, or `undefined`.
     */
    static get(id: string, from?: Element) {
        return (findById('pc-material', id, from) as MaterialElement | null)?.material ?? undefined;
    }

    static get observedAttributes() {
        // The schema's attributes, and those the element handles itself: the texture slots and
        // the two aliases. Sorted, so that the list stays in the alphabetical order it is read in.
        return [
            ...attributeNames(this),
            'ao-map',
            'diffuse-map',
            'emissive-map',
            'gloss-map',
            'height-map',
            'metalness-map',
            'normal-map',
            'opacity-map',
            'roughness',
            'roughness-map'
        ].sort();
    }

    // newValue is null when an attribute is removed, which several branches below rely on. The
    // other elements still declare it as `string`; widening those surfaces 21 real removal bugs of
    // the #309 shape, which is its own change rather than a signature tweak.
    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        // The schema's attributes. The switch handles the rest: the texture slots, which bind an
        // asset rather than write a value through, and the two aliases.
        applyAttribute(this, name, newValue);

        switch (name) {
            case 'ao-map':
                this.aoMap = newValue ?? '';
                break;
            case 'diffuse-map':
                this.diffuseMap = newValue ?? '';
                break;
            case 'emissive-map':
                this.emissiveMap = newValue ?? '';
                break;
            case 'gloss-map':
                this.glossMap = newValue ?? '';
                break;
            case 'height-map':
                this.heightMap = newValue ?? '';
                break;
            case 'metalness-map':
                this.metalnessMap = newValue ?? '';
                break;
            case 'normal-map':
                this.normalMap = newValue ?? '';
                break;
            case 'opacity-map':
                this.opacityMap = newValue ?? '';
                break;
            case 'roughness':
                // Aliases gloss, and inverts it so the value reads as roughness. Removing the
                // attribute restores the engine's uninverted interpretation.
                this.gloss = parseNumber(newValue, 0.25, name);
                this.glossInvert = newValue !== null;
                break;
            case 'roughness-map':
                this.glossMap = newValue ?? '';
                this.glossInvert = newValue !== null;
                break;
        }

        if (glossConflicts.includes(name) || roughnessAliases.includes(name)) {
            this._warnGlossConflict();
        }
    }
}

// A label rather than shader state, so writing it schedules no update
defineAttributes(MaterialElement, 'material', {
    name: attr.string('Untitled')
});

// Every other attribute that is a value written through to the material, each followed by an
// update. Three of the defaults are this element's own rather than the engine's:
//
// - alphaDither is null, which leaves the dither alpha following opacity as it does on a bare
//   StandardMaterial. The engine accepts it, though its declarations type the setter as taking a
//   number.
// - useMetalness is true. The engine defaults to the older specular/gloss workflow, in which
//   metalnessMap is never sampled at all - useMetalness drives the LIT_METALNESS define. This
//   element defaults the other way, so that `metalness-map` does what its name says.
// - metalness is 0, which the class docblock explains.
defineAttributes(
    MaterialElement,
    'material',
    {
        alphaDither: attr.number(null).to((value) => value as number),
        alphaTest: attr.number(0),
        alphaToCoverage: attr.bool(false),
        aoIntensity: attr.number(1),
        aoMapChannel: attr.oneOf(scalarChannels, 'g'),
        aoMapOffset: attr.vec2(Vec2.ZERO),
        aoMapRotation: attr.number(0),
        aoMapTiling: attr.vec2(Vec2.ONE),
        aoMapUv: attr.number(0),
        blendType: attr.oneOf(blendTypes, 'none'),
        bumpiness: attr.number(1),
        cull: attr.oneOf(cullModes, 'back'),
        depthBias: attr.number(0),
        depthTest: attr.bool(true),
        depthWrite: attr.bool(true),
        diffuse: attr.color(Color.WHITE),
        diffuseMapChannel: attr.oneOf(colorChannels, 'rgb'),
        diffuseMapOffset: attr.vec2(Vec2.ZERO),
        diffuseMapRotation: attr.number(0),
        diffuseMapTiling: attr.vec2(Vec2.ONE),
        diffuseMapUv: attr.number(0),
        emissive: attr.color(Color.BLACK),
        emissiveIntensity: attr.number(1),
        emissiveMapChannel: attr.oneOf(colorChannels, 'rgb'),
        emissiveMapOffset: attr.vec2(Vec2.ZERO),
        emissiveMapRotation: attr.number(0),
        emissiveMapTiling: attr.vec2(Vec2.ONE),
        emissiveMapUv: attr.number(0),
        enableGGXSpecular: attr.bool(false),
        flatShading: attr.bool(false),
        fresnelModel: attr.oneOf(fresnelModels, 'schlick'),
        gloss: attr.number(0.25),
        glossInvert: attr.bool(false),
        glossMapChannel: attr.oneOf(scalarChannels, 'g'),
        glossMapOffset: attr.vec2(Vec2.ZERO),
        glossMapRotation: attr.number(0),
        glossMapTiling: attr.vec2(Vec2.ONE),
        glossMapUv: attr.number(0),
        heightMapBase: attr.number(0.5),
        heightMapChannel: attr.oneOf(scalarChannels, 'g'),
        heightMapFactor: attr.number(1),
        heightMapOffset: attr.vec2(Vec2.ZERO),
        heightMapRotation: attr.number(0),
        heightMapTiling: attr.vec2(Vec2.ONE),
        heightMapUv: attr.number(0),
        metalness: attr.number(0),
        metalnessMapChannel: attr.oneOf(scalarChannels, 'g'),
        metalnessMapOffset: attr.vec2(Vec2.ZERO),
        metalnessMapRotation: attr.number(0),
        metalnessMapTiling: attr.vec2(Vec2.ONE),
        metalnessMapUv: attr.number(0),
        normalMapOffset: attr.vec2(Vec2.ZERO),
        normalMapRotation: attr.number(0),
        normalMapTiling: attr.vec2(Vec2.ONE),
        normalMapUv: attr.number(0),
        occludeDirect: attr.bool(false),
        occludeSpecular: attr.oneOf(occludeSpeculars, 'ao'),
        opacity: attr.number(1),
        opacityDither: attr.oneOf(opacityDithers, 'none'),
        opacityFadesSpecular: attr.bool(true),
        opacityMapChannel: attr.oneOf(scalarChannels, 'a'),
        opacityMapOffset: attr.vec2(Vec2.ZERO),
        opacityMapRotation: attr.number(0),
        opacityMapTiling: attr.vec2(Vec2.ONE),
        opacityMapUv: attr.number(0),
        parallaxMode: attr.oneOf(parallaxModes, 'offset'),
        parallaxSamples: attr.number(16),
        parallaxShadowSamples: attr.number(0),
        slopeDepthBias: attr.number(0),
        specular: attr.color(Color.BLACK),
        specularityFactor: attr.number(1),
        twoSidedLighting: attr.bool(false),
        useFog: attr.bool(true),
        useLighting: attr.bool(true),
        useMetalness: attr.bool(true),
        useMetalnessSpecularColor: attr.bool(false),
        useSkybox: attr.bool(true),
        useTonemap: attr.bool(true)
    },
    scheduleUpdate
);

globalThis.customElements?.define('pc-material', MaterialElement);

export { MaterialElement };
