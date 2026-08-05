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
import type { EventHandle, Texture } from 'playcanvas';

import type { AppElement } from './app';
import { AssetElement } from './asset';
import { parseBool, parseColor, parseEnum, parseNumber, parseVec2 } from './parse';

type BlendType =
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

type CullMode = 'none' | 'back' | 'front' | 'front-and-back';

const cullModes = new Map<CullMode, number>([
    ['none', CULLFACE_NONE],
    ['back', CULLFACE_BACK],
    ['front', CULLFACE_FRONT],
    ['front-and-back', CULLFACE_FRONTANDBACK]
]);

type FresnelModel = 'none' | 'schlick';

const fresnelModels = new Map<FresnelModel, number>([
    ['none', FRESNEL_NONE],
    ['schlick', FRESNEL_SCHLICK]
]);

type OccludeSpecular = 'none' | 'ao' | 'gloss-dependent';

const occludeSpeculars = new Map<OccludeSpecular, number>([
    ['none', SPECOCC_NONE],
    ['ao', SPECOCC_AO],
    ['gloss-dependent', SPECOCC_GLOSSDEPENDENT]
]);

// The DITHER_* constants are strings whose values are exactly these names, so a parsed value is
// assigned to the material unchanged rather than mapped through a table.
type OpacityDither = 'none' | 'bayer8' | 'bluenoise' | 'ignnoise';

const opacityDithers: OpacityDither[] = ['none', 'bayer8', 'bluenoise', 'ignnoise'];

type ColorChannel = 'r' | 'g' | 'b' | 'a' | 'rgb';

const colorChannels: ColorChannel[] = ['r', 'g', 'b', 'a', 'rgb'];

type ScalarChannel = 'r' | 'g' | 'b' | 'a';

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
 * @attribute {number} roughness - The roughness of the material, from 0 (shiny) to 1 (rough). An
 * alias for `gloss` that also inverts it, so do not combine it with the `gloss` attributes.
 * @attribute {string} roughness-map - The id of the `pc-asset` to use as the roughness map. An
 * alias for `gloss-map` that also inverts the gloss channel, so do not combine it with the `gloss`
 * attributes.
 */
class MaterialElement extends HTMLElement {
    private _alphaTest = 0;

    private _alphaToCoverage = false;

    private _aoIntensity = 1;

    private _aoMap = '';

    private _aoMapChannel: ScalarChannel = 'g';

    private _aoMapOffset = new Vec2(0, 0);

    private _aoMapRotation = 0;

    private _aoMapTiling = new Vec2(1, 1);

    private _aoMapUv = 0;

    private _blendType: BlendType = 'none';

    private _bumpiness = 1;

    private _cull: CullMode = 'back';

    private _depthBias = 0;

    private _depthTest = true;

    private _depthWrite = true;

    private _diffuse = new Color(1, 1, 1);

    private _diffuseMap = '';

    private _diffuseMapChannel: ColorChannel = 'rgb';

    private _diffuseMapOffset = new Vec2(0, 0);

    private _diffuseMapRotation = 0;

    private _diffuseMapTiling = new Vec2(1, 1);

    private _diffuseMapUv = 0;

    private _emissive = new Color(0, 0, 0);

    private _emissiveIntensity = 1;

    private _emissiveMap = '';

    private _emissiveMapChannel: ColorChannel = 'rgb';

    private _emissiveMapOffset = new Vec2(0, 0);

    private _emissiveMapRotation = 0;

    private _emissiveMapTiling = new Vec2(1, 1);

    private _emissiveMapUv = 0;

    private _enableGGXSpecular = false;

    private _fresnelModel: FresnelModel = 'schlick';

    private _gloss = 0.25;

    private _glossInvert = false;

    private _glossMap = '';

    private _glossMapChannel: ScalarChannel = 'g';

    private _glossMapOffset = new Vec2(0, 0);

    private _glossMapRotation = 0;

    private _glossMapTiling = new Vec2(1, 1);

    private _glossMapUv = 0;

    private _heightMap = '';

    private _heightMapChannel: ScalarChannel = 'g';

    private _heightMapFactor = 1;

    private _heightMapOffset = new Vec2(0, 0);

    private _heightMapRotation = 0;

    private _heightMapTiling = new Vec2(1, 1);

    private _heightMapUv = 0;

    private _metalness = 0;

    private _metalnessMap = '';

    private _metalnessMapChannel: ScalarChannel = 'g';

    private _metalnessMapOffset = new Vec2(0, 0);

    private _metalnessMapRotation = 0;

    private _metalnessMapTiling = new Vec2(1, 1);

    private _metalnessMapUv = 0;

    private _normalMap = '';

    private _normalMapOffset = new Vec2(0, 0);

    private _normalMapRotation = 0;

    private _normalMapTiling = new Vec2(1, 1);

    private _normalMapUv = 0;

    private _occludeDirect = false;

    private _occludeSpecular: OccludeSpecular = 'ao';

    private _opacity = 1;

    private _opacityDither: OpacityDither = 'none';

    private _opacityFadesSpecular = true;

    private _opacityMap = '';

    private _opacityMapChannel: ScalarChannel = 'a';

    private _opacityMapOffset = new Vec2(0, 0);

    private _opacityMapRotation = 0;

    private _opacityMapTiling = new Vec2(1, 1);

    private _opacityMapUv = 0;

    private _slopeDepthBias = 0;

    private _specular = new Color(0, 0, 0);

    private _specularityFactor = 1;

    private _twoSidedLighting = false;

    private _useFog = true;

    private _useLighting = true;

    // Diverges from the engine default of false - see the class docblock and _createMaterial()
    private _useMetalness = true;

    private _useMetalnessSpecularColor = false;

    private _useSkybox = true;

    private _useTonemap = true;

    /**
     * Pending `load` handlers, one per texture slot. A slot's handler is torn down when the slot is
     * reassigned or the element disconnects, so a late-arriving asset can never write a texture the
     * element no longer wants.
     */
    private _mapHandles = new Map<TextureSlot, EventHandle>();

    private _updateScheduled = false;

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
     * Creates the material from the element's cached properties. Called by the containing
     * `<pc-app>` element during its boot sweep, and on connection for elements inserted while
     * the application is already running.
     *
     * @internal
     */
    _createMaterial() {
        const material = new StandardMaterial();
        this.material = material;

        material.alphaTest = this._alphaTest;
        material.alphaToCoverage = this._alphaToCoverage;
        material.aoIntensity = this._aoIntensity;
        material.aoMapChannel = this._aoMapChannel;
        material.aoMapOffset = this._aoMapOffset;
        material.aoMapRotation = this._aoMapRotation;
        material.aoMapTiling = this._aoMapTiling;
        material.aoMapUv = this._aoMapUv;
        material.blendType = blendTypes.get(this._blendType) ?? BLEND_NONE;
        material.bumpiness = this._bumpiness;
        material.cull = cullModes.get(this._cull) ?? CULLFACE_BACK;
        material.depthBias = this._depthBias;
        material.depthTest = this._depthTest;
        material.depthWrite = this._depthWrite;
        material.diffuse = this._diffuse;
        material.diffuseMapChannel = this._diffuseMapChannel;
        material.diffuseMapOffset = this._diffuseMapOffset;
        material.diffuseMapRotation = this._diffuseMapRotation;
        material.diffuseMapTiling = this._diffuseMapTiling;
        material.diffuseMapUv = this._diffuseMapUv;
        material.emissive = this._emissive;
        material.emissiveIntensity = this._emissiveIntensity;
        material.emissiveMapChannel = this._emissiveMapChannel;
        material.emissiveMapOffset = this._emissiveMapOffset;
        material.emissiveMapRotation = this._emissiveMapRotation;
        material.emissiveMapTiling = this._emissiveMapTiling;
        material.emissiveMapUv = this._emissiveMapUv;
        material.enableGGXSpecular = this._enableGGXSpecular;
        material.fresnelModel = fresnelModels.get(this._fresnelModel) ?? FRESNEL_SCHLICK;
        material.gloss = this._gloss;
        material.glossInvert = this._glossInvert;
        material.glossMapChannel = this._glossMapChannel;
        material.glossMapOffset = this._glossMapOffset;
        material.glossMapRotation = this._glossMapRotation;
        material.glossMapTiling = this._glossMapTiling;
        material.glossMapUv = this._glossMapUv;
        material.heightMapChannel = this._heightMapChannel;
        material.heightMapFactor = this._heightMapFactor;
        material.heightMapOffset = this._heightMapOffset;
        material.heightMapRotation = this._heightMapRotation;
        material.heightMapTiling = this._heightMapTiling;
        material.heightMapUv = this._heightMapUv;
        material.metalness = this._metalness;
        material.metalnessMapChannel = this._metalnessMapChannel;
        material.metalnessMapOffset = this._metalnessMapOffset;
        material.metalnessMapRotation = this._metalnessMapRotation;
        material.metalnessMapTiling = this._metalnessMapTiling;
        material.metalnessMapUv = this._metalnessMapUv;
        material.normalMapOffset = this._normalMapOffset;
        material.normalMapRotation = this._normalMapRotation;
        material.normalMapTiling = this._normalMapTiling;
        material.normalMapUv = this._normalMapUv;
        // @ts-ignore the engine's generated .d.ts types occludeDirect as a number, but its own
        // JSDoc documents it as a boolean and its runtime default is `false`
        material.occludeDirect = this._occludeDirect;
        material.occludeSpecular = occludeSpeculars.get(this._occludeSpecular) ?? SPECOCC_AO;
        material.opacity = this._opacity;
        material.opacityDither = this._opacityDither;
        material.opacityFadesSpecular = this._opacityFadesSpecular;
        material.opacityMapChannel = this._opacityMapChannel;
        material.opacityMapOffset = this._opacityMapOffset;
        material.opacityMapRotation = this._opacityMapRotation;
        material.opacityMapTiling = this._opacityMapTiling;
        material.opacityMapUv = this._opacityMapUv;
        material.slopeDepthBias = this._slopeDepthBias;
        material.specular = this._specular;
        material.specularityFactor = this._specularityFactor;
        material.twoSidedLighting = this._twoSidedLighting;
        material.useFog = this._useFog;
        material.useLighting = this._useLighting;

        // The engine defaults to the older specular/gloss workflow, in which metalnessMap is never
        // sampled at all - useMetalness drives the LIT_METALNESS define. This element defaults the
        // other way, so that `metalness-map` does what its name says.
        material.useMetalness = this._useMetalness;
        material.useMetalnessSpecularColor = this._useMetalnessSpecularColor;
        material.useSkybox = this._useSkybox;
        material.useTonemap = this._useTonemap;

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
        for (const handle of this._mapHandles.values()) {
            handle.off();
        }
        this._mapHandles.clear();

        if (this.material) {
            this.material.destroy();
            this.material = null;
        }
    }

    /**
     * Coalesces `material.update()` across a burst of attribute or property writes, so that setting
     * a dozen attributes in one parse costs one update rather than a dozen.
     */
    private _scheduleUpdate() {
        if (this._updateScheduled) return;
        this._updateScheduled = true;
        queueMicrotask(() => {
            this._updateScheduled = false;
            this.material?.update();
        });
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
     * Points a texture slot at the resource of a `pc-asset`, waiting for the asset to load when it
     * has not already. An empty id clears the slot.
     *
     * @param id - The id of the `pc-asset`, or an empty string to clear the slot.
     * @param slot - The material property to write.
     */
    private _setMap(id: string, slot: TextureSlot) {
        // Drop any load still pending for this slot - its texture is no longer the one we want
        this._mapHandles.get(slot)?.off();
        this._mapHandles.delete(slot);

        if (!this.material) return;

        if (!id) {
            this.material[slot] = null;
            this._scheduleUpdate();
            return;
        }

        const asset = AssetElement.get(id);
        if (!asset) return;

        if (asset.loaded) {
            this._applyMap(slot, asset.resource as Texture);
            return;
        }

        this._mapHandles.set(
            slot,
            asset.once('load', () => {
                this._mapHandles.delete(slot);
                this._applyMap(slot, asset.resource as Texture);
            })
        );
    }

    /**
     * @param slot - The material property to write.
     * @param texture - The loaded texture, applied with its sampler state untouched - anisotropy
     * and friends belong to the `pc-asset`'s texture options.
     */
    private _applyMap(slot: TextureSlot, texture: Texture) {
        if (!this.material) return;
        this.material[slot] = texture;
        this._scheduleUpdate();
    }

    /**
     * Sets the alpha test reference value. Fragments with an opacity below this value are discarded.
     * @param value - The alpha test reference value.
     */
    set alphaTest(value: number) {
        this._alphaTest = value;
        if (this.material) {
            this.material.alphaTest = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the alpha test reference value.
     * @returns The alpha test reference value.
     */
    get alphaTest() {
        return this._alphaTest;
    }

    /**
     * Sets whether to use alpha to coverage, which resolves transparency using multisampling.
     * @param value - The alpha to coverage flag.
     */
    set alphaToCoverage(value: boolean) {
        this._alphaToCoverage = value;
        if (this.material) {
            this.material.alphaToCoverage = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether to use alpha to coverage.
     * @returns The alpha to coverage flag.
     */
    get alphaToCoverage() {
        return this._alphaToCoverage;
    }

    /**
     * Sets the strength of the ambient occlusion map, from 0 to 1.
     * @param value - The ambient occlusion intensity.
     */
    set aoIntensity(value: number) {
        this._aoIntensity = value;
        if (this.material) {
            this.material.aoIntensity = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the strength of the ambient occlusion map.
     * @returns The ambient occlusion intensity.
     */
    get aoIntensity() {
        return this._aoIntensity;
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
     * Sets the color channel of the ambient occlusion map to sample.
     * @param value - The channel.
     */
    set aoMapChannel(value: ScalarChannel) {
        this._aoMapChannel = value;
        if (this.material) {
            this.material.aoMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channel of the ambient occlusion map to sample.
     * @returns The channel.
     */
    get aoMapChannel(): ScalarChannel {
        return this._aoMapChannel;
    }

    /**
     * Sets the 2D offset of the ambient occlusion map.
     * @param value - The offset.
     */
    set aoMapOffset(value: Vec2) {
        this._aoMapOffset = value;
        if (this.material) {
            this.material.aoMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the ambient occlusion map.
     * @returns The offset.
     */
    get aoMapOffset() {
        return this._aoMapOffset;
    }

    /**
     * Sets the 2D rotation of the ambient occlusion map, in degrees.
     * @param value - The rotation.
     */
    set aoMapRotation(value: number) {
        this._aoMapRotation = value;
        if (this.material) {
            this.material.aoMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the ambient occlusion map.
     * @returns The rotation.
     */
    get aoMapRotation() {
        return this._aoMapRotation;
    }

    /**
     * Sets the 2D tiling of the ambient occlusion map.
     * @param value - The tiling.
     */
    set aoMapTiling(value: Vec2) {
        this._aoMapTiling = value;
        if (this.material) {
            this.material.aoMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the ambient occlusion map.
     * @returns The tiling.
     */
    get aoMapTiling() {
        return this._aoMapTiling;
    }

    /**
     * Sets the UV channel the ambient occlusion map samples.
     * @param value - The UV channel.
     */
    set aoMapUv(value: number) {
        this._aoMapUv = value;
        if (this.material) {
            this.material.aoMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the ambient occlusion map samples.
     * @returns The UV channel.
     */
    get aoMapUv() {
        return this._aoMapUv;
    }

    /**
     * Sets how the material is blended with the scene behind it.
     * @param value - The blend type.
     */
    set blendType(value: BlendType) {
        this._blendType = value;
        if (this.material) {
            this.material.blendType = blendTypes.get(value) ?? BLEND_NONE;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets how the material is blended with the scene behind it.
     * @returns The blend type.
     */
    get blendType(): BlendType {
        return this._blendType;
    }

    /**
     * Sets the strength of the normal map, where 0 is flat and 1 is the map's full effect.
     * @param value - The bumpiness.
     */
    set bumpiness(value: number) {
        this._bumpiness = value;
        if (this.material) {
            this.material.bumpiness = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the strength of the normal map.
     * @returns The bumpiness.
     */
    get bumpiness() {
        return this._bumpiness;
    }

    /**
     * Sets which faces of a mesh are culled.
     * @param value - The cull mode.
     */
    set cull(value: CullMode) {
        this._cull = value;
        if (this.material) {
            this.material.cull = cullModes.get(value) ?? CULLFACE_BACK;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets which faces of a mesh are culled.
     * @returns The cull mode.
     */
    get cull(): CullMode {
        return this._cull;
    }

    /**
     * Sets the offset applied to the depth of a fragment, used to resolve z-fighting.
     * @param value - The depth bias.
     */
    set depthBias(value: number) {
        this._depthBias = value;
        if (this.material) {
            this.material.depthBias = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the offset applied to the depth of a fragment.
     * @returns The depth bias.
     */
    get depthBias() {
        return this._depthBias;
    }

    /**
     * Sets whether fragments are tested against the depth buffer.
     * @param value - The depth test flag.
     */
    set depthTest(value: boolean) {
        this._depthTest = value;
        if (this.material) {
            this.material.depthTest = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether fragments are tested against the depth buffer.
     * @returns The depth test flag.
     */
    get depthTest() {
        return this._depthTest;
    }

    /**
     * Sets whether fragments write to the depth buffer.
     * @param value - The depth write flag.
     */
    set depthWrite(value: boolean) {
        this._depthWrite = value;
        if (this.material) {
            this.material.depthWrite = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether fragments write to the depth buffer.
     * @returns The depth write flag.
     */
    get depthWrite() {
        return this._depthWrite;
    }

    /**
     * Sets the diffuse color of the material. With the metalness workflow this doubles as the
     * specular color where the surface is metallic.
     * @param value - The diffuse color.
     */
    set diffuse(value: Color) {
        this._diffuse = value;
        if (this.material) {
            this.material.diffuse = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the diffuse color of the material.
     * @returns The diffuse color.
     */
    get diffuse(): Color {
        return this._diffuse;
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
     * Sets the color channels of the diffuse map to sample.
     * @param value - The channels.
     */
    set diffuseMapChannel(value: ColorChannel) {
        this._diffuseMapChannel = value;
        if (this.material) {
            this.material.diffuseMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channels of the diffuse map to sample.
     * @returns The channels.
     */
    get diffuseMapChannel(): ColorChannel {
        return this._diffuseMapChannel;
    }

    /**
     * Sets the 2D offset of the diffuse map.
     * @param value - The offset.
     */
    set diffuseMapOffset(value: Vec2) {
        this._diffuseMapOffset = value;
        if (this.material) {
            this.material.diffuseMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the diffuse map.
     * @returns The offset.
     */
    get diffuseMapOffset() {
        return this._diffuseMapOffset;
    }

    /**
     * Sets the 2D rotation of the diffuse map, in degrees.
     * @param value - The rotation.
     */
    set diffuseMapRotation(value: number) {
        this._diffuseMapRotation = value;
        if (this.material) {
            this.material.diffuseMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the diffuse map.
     * @returns The rotation.
     */
    get diffuseMapRotation() {
        return this._diffuseMapRotation;
    }

    /**
     * Sets the 2D tiling of the diffuse map.
     * @param value - The tiling.
     */
    set diffuseMapTiling(value: Vec2) {
        this._diffuseMapTiling = value;
        if (this.material) {
            this.material.diffuseMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the diffuse map.
     * @returns The tiling.
     */
    get diffuseMapTiling() {
        return this._diffuseMapTiling;
    }

    /**
     * Sets the UV channel the diffuse map samples.
     * @param value - The UV channel.
     */
    set diffuseMapUv(value: number) {
        this._diffuseMapUv = value;
        if (this.material) {
            this.material.diffuseMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the diffuse map samples.
     * @returns The UV channel.
     */
    get diffuseMapUv() {
        return this._diffuseMapUv;
    }

    /**
     * Sets the emissive color of the material, which is added to the lit result.
     * @param value - The emissive color.
     */
    set emissive(value: Color) {
        this._emissive = value;
        if (this.material) {
            this.material.emissive = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the emissive color of the material.
     * @returns The emissive color.
     */
    get emissive(): Color {
        return this._emissive;
    }

    /**
     * Sets the multiplier applied to the emissive color and map.
     * @param value - The emissive intensity.
     */
    set emissiveIntensity(value: number) {
        this._emissiveIntensity = value;
        if (this.material) {
            this.material.emissiveIntensity = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the multiplier applied to the emissive color and map.
     * @returns The emissive intensity.
     */
    get emissiveIntensity() {
        return this._emissiveIntensity;
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
     * Sets the color channels of the emissive map to sample.
     * @param value - The channels.
     */
    set emissiveMapChannel(value: ColorChannel) {
        this._emissiveMapChannel = value;
        if (this.material) {
            this.material.emissiveMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channels of the emissive map to sample.
     * @returns The channels.
     */
    get emissiveMapChannel(): ColorChannel {
        return this._emissiveMapChannel;
    }

    /**
     * Sets the 2D offset of the emissive map.
     * @param value - The offset.
     */
    set emissiveMapOffset(value: Vec2) {
        this._emissiveMapOffset = value;
        if (this.material) {
            this.material.emissiveMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the emissive map.
     * @returns The offset.
     */
    get emissiveMapOffset() {
        return this._emissiveMapOffset;
    }

    /**
     * Sets the 2D rotation of the emissive map, in degrees.
     * @param value - The rotation.
     */
    set emissiveMapRotation(value: number) {
        this._emissiveMapRotation = value;
        if (this.material) {
            this.material.emissiveMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the emissive map.
     * @returns The rotation.
     */
    get emissiveMapRotation() {
        return this._emissiveMapRotation;
    }

    /**
     * Sets the 2D tiling of the emissive map.
     * @param value - The tiling.
     */
    set emissiveMapTiling(value: Vec2) {
        this._emissiveMapTiling = value;
        if (this.material) {
            this.material.emissiveMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the emissive map.
     * @returns The tiling.
     */
    get emissiveMapTiling() {
        return this._emissiveMapTiling;
    }

    /**
     * Sets the UV channel the emissive map samples.
     * @param value - The UV channel.
     */
    set emissiveMapUv(value: number) {
        this._emissiveMapUv = value;
        if (this.material) {
            this.material.emissiveMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the emissive map samples.
     * @returns The UV channel.
     */
    get emissiveMapUv() {
        return this._emissiveMapUv;
    }

    /**
     * Sets whether to use the GGX specular model, which supports anisotropy.
     * @param value - The GGX specular flag.
     */
    set enableGGXSpecular(value: boolean) {
        this._enableGGXSpecular = value;
        if (this.material) {
            this.material.enableGGXSpecular = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether to use the GGX specular model.
     * @returns The GGX specular flag.
     */
    get enableGGXSpecular() {
        return this._enableGGXSpecular;
    }

    /**
     * Sets the Fresnel model used for specular reflections at grazing angles.
     * @param value - The Fresnel model.
     */
    set fresnelModel(value: FresnelModel) {
        this._fresnelModel = value;
        if (this.material) {
            this.material.fresnelModel = fresnelModels.get(value) ?? FRESNEL_SCHLICK;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the Fresnel model used for specular reflections at grazing angles.
     * @returns The Fresnel model.
     */
    get fresnelModel(): FresnelModel {
        return this._fresnelModel;
    }

    /**
     * Sets the glossiness of the material, from 0 (rough) to 1 (shiny). See also `roughness`.
     * @param value - The gloss.
     */
    set gloss(value: number) {
        this._gloss = value;
        if (this.material) {
            this.material.gloss = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the glossiness of the material.
     * @returns The gloss.
     */
    get gloss() {
        return this._gloss;
    }

    /**
     * Sets whether the gloss value and map are inverted, which makes the material treat them as
     * roughness. Setting `roughness` or `roughness-map` enables this automatically.
     * @param value - The gloss invert flag.
     */
    set glossInvert(value: boolean) {
        this._glossInvert = value;
        if (this.material) {
            this.material.glossInvert = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the gloss value and map are inverted.
     * @returns The gloss invert flag.
     */
    get glossInvert() {
        return this._glossInvert;
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
     * Sets the color channel of the gloss map to sample.
     * @param value - The channel.
     */
    set glossMapChannel(value: ScalarChannel) {
        this._glossMapChannel = value;
        if (this.material) {
            this.material.glossMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channel of the gloss map to sample.
     * @returns The channel.
     */
    get glossMapChannel(): ScalarChannel {
        return this._glossMapChannel;
    }

    /**
     * Sets the 2D offset of the gloss map.
     * @param value - The offset.
     */
    set glossMapOffset(value: Vec2) {
        this._glossMapOffset = value;
        if (this.material) {
            this.material.glossMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the gloss map.
     * @returns The offset.
     */
    get glossMapOffset() {
        return this._glossMapOffset;
    }

    /**
     * Sets the 2D rotation of the gloss map, in degrees.
     * @param value - The rotation.
     */
    set glossMapRotation(value: number) {
        this._glossMapRotation = value;
        if (this.material) {
            this.material.glossMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the gloss map.
     * @returns The rotation.
     */
    get glossMapRotation() {
        return this._glossMapRotation;
    }

    /**
     * Sets the 2D tiling of the gloss map.
     * @param value - The tiling.
     */
    set glossMapTiling(value: Vec2) {
        this._glossMapTiling = value;
        if (this.material) {
            this.material.glossMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the gloss map.
     * @returns The tiling.
     */
    get glossMapTiling() {
        return this._glossMapTiling;
    }

    /**
     * Sets the UV channel the gloss map samples.
     * @param value - The UV channel.
     */
    set glossMapUv(value: number) {
        this._glossMapUv = value;
        if (this.material) {
            this.material.glossMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the gloss map samples.
     * @returns The UV channel.
     */
    get glossMapUv() {
        return this._glossMapUv;
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
     * Sets the color channel of the height map to sample.
     * @param value - The channel.
     */
    set heightMapChannel(value: ScalarChannel) {
        this._heightMapChannel = value;
        if (this.material) {
            this.material.heightMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channel of the height map to sample.
     * @returns The channel.
     */
    get heightMapChannel(): ScalarChannel {
        return this._heightMapChannel;
    }

    /**
     * Sets the strength of the parallax effect driven by the height map.
     * @param value - The height map factor.
     */
    set heightMapFactor(value: number) {
        this._heightMapFactor = value;
        if (this.material) {
            this.material.heightMapFactor = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the strength of the parallax effect driven by the height map.
     * @returns The height map factor.
     */
    get heightMapFactor() {
        return this._heightMapFactor;
    }

    /**
     * Sets the 2D offset of the height map.
     * @param value - The offset.
     */
    set heightMapOffset(value: Vec2) {
        this._heightMapOffset = value;
        if (this.material) {
            this.material.heightMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the height map.
     * @returns The offset.
     */
    get heightMapOffset() {
        return this._heightMapOffset;
    }

    /**
     * Sets the 2D rotation of the height map, in degrees.
     * @param value - The rotation.
     */
    set heightMapRotation(value: number) {
        this._heightMapRotation = value;
        if (this.material) {
            this.material.heightMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the height map.
     * @returns The rotation.
     */
    get heightMapRotation() {
        return this._heightMapRotation;
    }

    /**
     * Sets the 2D tiling of the height map.
     * @param value - The tiling.
     */
    set heightMapTiling(value: Vec2) {
        this._heightMapTiling = value;
        if (this.material) {
            this.material.heightMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the height map.
     * @returns The tiling.
     */
    get heightMapTiling() {
        return this._heightMapTiling;
    }

    /**
     * Sets the UV channel the height map samples.
     * @param value - The UV channel.
     */
    set heightMapUv(value: number) {
        this._heightMapUv = value;
        if (this.material) {
            this.material.heightMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the height map samples.
     * @returns The UV channel.
     */
    get heightMapUv() {
        return this._heightMapUv;
    }

    /**
     * Sets how metallic the surface is, from 0 (dielectric) to 1 (metal).
     * @param value - The metalness.
     */
    set metalness(value: number) {
        this._metalness = value;
        if (this.material) {
            this.material.metalness = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets how metallic the surface is.
     * @returns The metalness.
     */
    get metalness() {
        return this._metalness;
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
     * Sets the color channel of the metalness map to sample.
     * @param value - The channel.
     */
    set metalnessMapChannel(value: ScalarChannel) {
        this._metalnessMapChannel = value;
        if (this.material) {
            this.material.metalnessMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channel of the metalness map to sample.
     * @returns The channel.
     */
    get metalnessMapChannel(): ScalarChannel {
        return this._metalnessMapChannel;
    }

    /**
     * Sets the 2D offset of the metalness map.
     * @param value - The offset.
     */
    set metalnessMapOffset(value: Vec2) {
        this._metalnessMapOffset = value;
        if (this.material) {
            this.material.metalnessMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the metalness map.
     * @returns The offset.
     */
    get metalnessMapOffset() {
        return this._metalnessMapOffset;
    }

    /**
     * Sets the 2D rotation of the metalness map, in degrees.
     * @param value - The rotation.
     */
    set metalnessMapRotation(value: number) {
        this._metalnessMapRotation = value;
        if (this.material) {
            this.material.metalnessMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the metalness map.
     * @returns The rotation.
     */
    get metalnessMapRotation() {
        return this._metalnessMapRotation;
    }

    /**
     * Sets the 2D tiling of the metalness map.
     * @param value - The tiling.
     */
    set metalnessMapTiling(value: Vec2) {
        this._metalnessMapTiling = value;
        if (this.material) {
            this.material.metalnessMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the metalness map.
     * @returns The tiling.
     */
    get metalnessMapTiling() {
        return this._metalnessMapTiling;
    }

    /**
     * Sets the UV channel the metalness map samples.
     * @param value - The UV channel.
     */
    set metalnessMapUv(value: number) {
        this._metalnessMapUv = value;
        if (this.material) {
            this.material.metalnessMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the metalness map samples.
     * @returns The UV channel.
     */
    get metalnessMapUv() {
        return this._metalnessMapUv;
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
     * Sets the 2D offset of the normal map.
     * @param value - The offset.
     */
    set normalMapOffset(value: Vec2) {
        this._normalMapOffset = value;
        if (this.material) {
            this.material.normalMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the normal map.
     * @returns The offset.
     */
    get normalMapOffset() {
        return this._normalMapOffset;
    }

    /**
     * Sets the 2D rotation of the normal map, in degrees.
     * @param value - The rotation.
     */
    set normalMapRotation(value: number) {
        this._normalMapRotation = value;
        if (this.material) {
            this.material.normalMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the normal map.
     * @returns The rotation.
     */
    get normalMapRotation() {
        return this._normalMapRotation;
    }

    /**
     * Sets the 2D tiling of the normal map.
     * @param value - The tiling.
     */
    set normalMapTiling(value: Vec2) {
        this._normalMapTiling = value;
        if (this.material) {
            this.material.normalMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the normal map.
     * @returns The tiling.
     */
    get normalMapTiling() {
        return this._normalMapTiling;
    }

    /**
     * Sets the UV channel the normal map samples.
     * @param value - The UV channel.
     */
    set normalMapUv(value: number) {
        this._normalMapUv = value;
        if (this.material) {
            this.material.normalMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the normal map samples.
     * @returns The UV channel.
     */
    get normalMapUv() {
        return this._normalMapUv;
    }

    /**
     * Sets whether ambient occlusion also attenuates direct lighting.
     * @param value - The occlude direct flag.
     */
    set occludeDirect(value: boolean) {
        this._occludeDirect = value;
        if (this.material) {
            // @ts-ignore see _createMaterial() - the engine mistypes occludeDirect as a number
            this.material.occludeDirect = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether ambient occlusion also attenuates direct lighting.
     * @returns The occlude direct flag.
     */
    get occludeDirect() {
        return this._occludeDirect;
    }

    /**
     * Sets how specular reflections are occluded.
     * @param value - The specular occlusion mode.
     */
    set occludeSpecular(value: OccludeSpecular) {
        this._occludeSpecular = value;
        if (this.material) {
            this.material.occludeSpecular = occludeSpeculars.get(value) ?? SPECOCC_AO;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets how specular reflections are occluded.
     * @returns The specular occlusion mode.
     */
    get occludeSpecular(): OccludeSpecular {
        return this._occludeSpecular;
    }

    /**
     * Sets the opacity of the material, from 0 (transparent) to 1 (opaque), which requires a
     * `blend-type` other than `none` to have any visible effect.
     * @param value - The opacity.
     */
    set opacity(value: number) {
        this._opacity = value;
        if (this.material) {
            this.material.opacity = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the opacity of the material, which requires a `blend-type` other than `none` to have
     * any visible effect.
     * @returns The opacity.
     */
    get opacity() {
        return this._opacity;
    }

    /**
     * Sets the dithering used to render opacity, which approximates transparency without blending.
     * @param value - The dither mode.
     */
    set opacityDither(value: OpacityDither) {
        this._opacityDither = value;
        if (this.material) {
            this.material.opacityDither = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the dithering used to render opacity.
     * @returns The dither mode.
     */
    get opacityDither(): OpacityDither {
        return this._opacityDither;
    }

    /**
     * Sets whether specular highlights fade out as the material becomes transparent.
     * @param value - The opacity fades specular flag.
     */
    set opacityFadesSpecular(value: boolean) {
        this._opacityFadesSpecular = value;
        if (this.material) {
            this.material.opacityFadesSpecular = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether specular highlights fade out as the material becomes transparent.
     * @returns The opacity fades specular flag.
     */
    get opacityFadesSpecular() {
        return this._opacityFadesSpecular;
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
     * Sets the color channel of the opacity map to sample.
     * @param value - The channel.
     */
    set opacityMapChannel(value: ScalarChannel) {
        this._opacityMapChannel = value;
        if (this.material) {
            this.material.opacityMapChannel = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the color channel of the opacity map to sample.
     * @returns The channel.
     */
    get opacityMapChannel(): ScalarChannel {
        return this._opacityMapChannel;
    }

    /**
     * Sets the 2D offset of the opacity map.
     * @param value - The offset.
     */
    set opacityMapOffset(value: Vec2) {
        this._opacityMapOffset = value;
        if (this.material) {
            this.material.opacityMapOffset = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D offset of the opacity map.
     * @returns The offset.
     */
    get opacityMapOffset() {
        return this._opacityMapOffset;
    }

    /**
     * Sets the 2D rotation of the opacity map, in degrees.
     * @param value - The rotation.
     */
    set opacityMapRotation(value: number) {
        this._opacityMapRotation = value;
        if (this.material) {
            this.material.opacityMapRotation = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D rotation of the opacity map.
     * @returns The rotation.
     */
    get opacityMapRotation() {
        return this._opacityMapRotation;
    }

    /**
     * Sets the 2D tiling of the opacity map.
     * @param value - The tiling.
     */
    set opacityMapTiling(value: Vec2) {
        this._opacityMapTiling = value;
        if (this.material) {
            this.material.opacityMapTiling = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the 2D tiling of the opacity map.
     * @returns The tiling.
     */
    get opacityMapTiling() {
        return this._opacityMapTiling;
    }

    /**
     * Sets the UV channel the opacity map samples.
     * @param value - The UV channel.
     */
    set opacityMapUv(value: number) {
        this._opacityMapUv = value;
        if (this.material) {
            this.material.opacityMapUv = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the UV channel the opacity map samples.
     * @returns The UV channel.
     */
    get opacityMapUv() {
        return this._opacityMapUv;
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
        return this._gloss;
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
     * Sets the depth offset applied in proportion to a surface's slope, used to resolve z-fighting.
     * @param value - The slope depth bias.
     */
    set slopeDepthBias(value: number) {
        this._slopeDepthBias = value;
        if (this.material) {
            this.material.slopeDepthBias = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the depth offset applied in proportion to a surface's slope.
     * @returns The slope depth bias.
     */
    get slopeDepthBias() {
        return this._slopeDepthBias;
    }

    /**
     * Sets the specular color of the material, which applies only when the metalness workflow is
     * disabled or `use-metalness-specular-color` is enabled.
     * @param value - The specular color.
     */
    set specular(value: Color) {
        this._specular = value;
        if (this.material) {
            this.material.specular = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the specular color of the material, which applies only when the metalness workflow is
     * disabled or `use-metalness-specular-color` is enabled.
     * @returns The specular color.
     */
    get specular(): Color {
        return this._specular;
    }

    /**
     * Sets the strength of specular reflections at direct angles, from 0 to 1, which applies only
     * when `use-metalness-specular-color` is enabled.
     * @param value - The specularity factor.
     */
    set specularityFactor(value: number) {
        this._specularityFactor = value;
        if (this.material) {
            this.material.specularityFactor = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets the strength of specular reflections at direct angles, which applies only when
     * `use-metalness-specular-color` is enabled.
     * @returns The specularity factor.
     */
    get specularityFactor() {
        return this._specularityFactor;
    }

    /**
     * Sets whether back faces are lit as though their normals were flipped.
     * @param value - The two sided lighting flag.
     */
    set twoSidedLighting(value: boolean) {
        this._twoSidedLighting = value;
        if (this.material) {
            this.material.twoSidedLighting = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether back faces are lit as though their normals were flipped.
     * @returns The two sided lighting flag.
     */
    get twoSidedLighting() {
        return this._twoSidedLighting;
    }

    /**
     * Sets whether the material is affected by scene fog.
     * @param value - The use fog flag.
     */
    set useFog(value: boolean) {
        this._useFog = value;
        if (this.material) {
            this.material.useFog = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the material is affected by scene fog.
     * @returns The use fog flag.
     */
    get useFog() {
        return this._useFog;
    }

    /**
     * Sets whether the material is affected by scene lights. When disabled the material renders
     * unlit, using the diffuse color and map alone.
     * @param value - The use lighting flag.
     */
    set useLighting(value: boolean) {
        this._useLighting = value;
        if (this.material) {
            this.material.useLighting = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the material is affected by scene lights.
     * @returns The use lighting flag.
     */
    get useLighting() {
        return this._useLighting;
    }

    /**
     * Sets whether to use the metalness workflow rather than the older specular workflow. Unlike a
     * bare `StandardMaterial` this defaults to `true`, because the `metalness-*` attributes have no
     * effect without it.
     * @param value - The use metalness flag.
     */
    set useMetalness(value: boolean) {
        this._useMetalness = value;
        if (this.material) {
            this.material.useMetalness = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether to use the metalness workflow.
     * @returns The use metalness flag.
     */
    get useMetalness() {
        return this._useMetalness;
    }

    /**
     * Sets whether the specular color tints reflections while the metalness workflow is in use.
     * @param value - The use metalness specular color flag.
     */
    set useMetalnessSpecularColor(value: boolean) {
        this._useMetalnessSpecularColor = value;
        if (this.material) {
            this.material.useMetalnessSpecularColor = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the specular color tints reflections while the metalness workflow is in use.
     * @returns The use metalness specular color flag.
     */
    get useMetalnessSpecularColor() {
        return this._useMetalnessSpecularColor;
    }

    /**
     * Sets whether the material is lit by the scene's skybox.
     * @param value - The use skybox flag.
     */
    set useSkybox(value: boolean) {
        this._useSkybox = value;
        if (this.material) {
            this.material.useSkybox = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the material is lit by the scene's skybox.
     * @returns The use skybox flag.
     */
    get useSkybox() {
        return this._useSkybox;
    }

    /**
     * Sets whether the camera's tone mapping is applied to the material.
     * @param value - The use tonemap flag.
     */
    set useTonemap(value: boolean) {
        this._useTonemap = value;
        if (this.material) {
            this.material.useTonemap = value;
            this._scheduleUpdate();
        }
    }

    /**
     * Gets whether the camera's tone mapping is applied to the material.
     * @returns The use tonemap flag.
     */
    get useTonemap() {
        return this._useTonemap;
    }

    /**
     * Returns the {@link StandardMaterial} created by the `<pc-material>` element with the given
     * `id`, or `undefined` if there is no such element or its material has not been created yet.
     *
     * @param id - The `id` of the `<pc-material>` element.
     * @returns The material, or `undefined`.
     */
    static get(id: string) {
        const materialElement = document.querySelector<MaterialElement>(`pc-material[id="${id}"]`);
        return materialElement?.material;
    }

    static get observedAttributes() {
        return [
            'alpha-test',
            'alpha-to-coverage',
            'ao-intensity',
            'ao-map',
            'ao-map-channel',
            'ao-map-offset',
            'ao-map-rotation',
            'ao-map-tiling',
            'ao-map-uv',
            'blend-type',
            'bumpiness',
            'cull',
            'depth-bias',
            'depth-test',
            'depth-write',
            'diffuse',
            'diffuse-map',
            'diffuse-map-channel',
            'diffuse-map-offset',
            'diffuse-map-rotation',
            'diffuse-map-tiling',
            'diffuse-map-uv',
            'emissive',
            'emissive-intensity',
            'emissive-map',
            'emissive-map-channel',
            'emissive-map-offset',
            'emissive-map-rotation',
            'emissive-map-tiling',
            'emissive-map-uv',
            'enable-ggx-specular',
            'fresnel-model',
            'gloss',
            'gloss-invert',
            'gloss-map',
            'gloss-map-channel',
            'gloss-map-offset',
            'gloss-map-rotation',
            'gloss-map-tiling',
            'gloss-map-uv',
            'height-map',
            'height-map-channel',
            'height-map-factor',
            'height-map-offset',
            'height-map-rotation',
            'height-map-tiling',
            'height-map-uv',
            'metalness',
            'metalness-map',
            'metalness-map-channel',
            'metalness-map-offset',
            'metalness-map-rotation',
            'metalness-map-tiling',
            'metalness-map-uv',
            'normal-map',
            'normal-map-offset',
            'normal-map-rotation',
            'normal-map-tiling',
            'normal-map-uv',
            'occlude-direct',
            'occlude-specular',
            'opacity',
            'opacity-dither',
            'opacity-fades-specular',
            'opacity-map',
            'opacity-map-channel',
            'opacity-map-offset',
            'opacity-map-rotation',
            'opacity-map-tiling',
            'opacity-map-uv',
            'roughness',
            'roughness-map',
            'slope-depth-bias',
            'specular',
            'specularity-factor',
            'two-sided-lighting',
            'use-fog',
            'use-lighting',
            'use-metalness',
            'use-metalness-specular-color',
            'use-skybox',
            'use-tonemap'
        ];
    }

    // newValue is null when an attribute is removed, which several branches below rely on. The
    // other elements still declare it as `string`; widening those surfaces 21 real removal bugs of
    // the #309 shape, which is its own change rather than a signature tweak.
    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'alpha-test':
                this.alphaTest = parseNumber(newValue, 0, name);
                break;
            case 'alpha-to-coverage':
                this.alphaToCoverage = parseBool(newValue, false);
                break;
            case 'ao-intensity':
                this.aoIntensity = parseNumber(newValue, 1, name);
                break;
            case 'ao-map':
                this.aoMap = newValue ?? '';
                break;
            case 'ao-map-channel':
                this.aoMapChannel = parseEnum(newValue, scalarChannels, 'g', name);
                break;
            case 'ao-map-offset':
                this.aoMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'ao-map-rotation':
                this.aoMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'ao-map-tiling':
                this.aoMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'ao-map-uv':
                this.aoMapUv = parseNumber(newValue, 0, name);
                break;
            case 'blend-type':
                this.blendType = parseEnum(newValue, blendTypes, 'none', name);
                break;
            case 'bumpiness':
                this.bumpiness = parseNumber(newValue, 1, name);
                break;
            case 'cull':
                this.cull = parseEnum(newValue, cullModes, 'back', name);
                break;
            case 'depth-bias':
                this.depthBias = parseNumber(newValue, 0, name);
                break;
            case 'depth-test':
                this.depthTest = parseBool(newValue, true);
                break;
            case 'depth-write':
                this.depthWrite = parseBool(newValue, true);
                break;
            case 'diffuse':
                this.diffuse = parseColor(newValue, new Color(1, 1, 1), name);
                break;
            case 'diffuse-map':
                this.diffuseMap = newValue ?? '';
                break;
            case 'diffuse-map-channel':
                this.diffuseMapChannel = parseEnum(newValue, colorChannels, 'rgb', name);
                break;
            case 'diffuse-map-offset':
                this.diffuseMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'diffuse-map-rotation':
                this.diffuseMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'diffuse-map-tiling':
                this.diffuseMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'diffuse-map-uv':
                this.diffuseMapUv = parseNumber(newValue, 0, name);
                break;
            case 'emissive':
                this.emissive = parseColor(newValue, new Color(0, 0, 0), name);
                break;
            case 'emissive-intensity':
                this.emissiveIntensity = parseNumber(newValue, 1, name);
                break;
            case 'emissive-map':
                this.emissiveMap = newValue ?? '';
                break;
            case 'emissive-map-channel':
                this.emissiveMapChannel = parseEnum(newValue, colorChannels, 'rgb', name);
                break;
            case 'emissive-map-offset':
                this.emissiveMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'emissive-map-rotation':
                this.emissiveMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'emissive-map-tiling':
                this.emissiveMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'emissive-map-uv':
                this.emissiveMapUv = parseNumber(newValue, 0, name);
                break;
            case 'enable-ggx-specular':
                this.enableGGXSpecular = parseBool(newValue, false);
                break;
            case 'fresnel-model':
                this.fresnelModel = parseEnum(newValue, fresnelModels, 'schlick', name);
                break;
            case 'gloss':
                this.gloss = parseNumber(newValue, 0.25, name);
                this._warnGlossConflict();
                break;
            case 'gloss-invert':
                this.glossInvert = parseBool(newValue, false);
                this._warnGlossConflict();
                break;
            case 'gloss-map':
                this.glossMap = newValue ?? '';
                this._warnGlossConflict();
                break;
            case 'gloss-map-channel':
                this.glossMapChannel = parseEnum(newValue, scalarChannels, 'g', name);
                break;
            case 'gloss-map-offset':
                this.glossMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'gloss-map-rotation':
                this.glossMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'gloss-map-tiling':
                this.glossMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'gloss-map-uv':
                this.glossMapUv = parseNumber(newValue, 0, name);
                break;
            case 'height-map':
                this.heightMap = newValue ?? '';
                break;
            case 'height-map-channel':
                this.heightMapChannel = parseEnum(newValue, scalarChannels, 'g', name);
                break;
            case 'height-map-factor':
                this.heightMapFactor = parseNumber(newValue, 1, name);
                break;
            case 'height-map-offset':
                this.heightMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'height-map-rotation':
                this.heightMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'height-map-tiling':
                this.heightMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'height-map-uv':
                this.heightMapUv = parseNumber(newValue, 0, name);
                break;
            case 'metalness':
                this.metalness = parseNumber(newValue, 0, name);
                break;
            case 'metalness-map':
                this.metalnessMap = newValue ?? '';
                break;
            case 'metalness-map-channel':
                this.metalnessMapChannel = parseEnum(newValue, scalarChannels, 'g', name);
                break;
            case 'metalness-map-offset':
                this.metalnessMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'metalness-map-rotation':
                this.metalnessMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'metalness-map-tiling':
                this.metalnessMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'metalness-map-uv':
                this.metalnessMapUv = parseNumber(newValue, 0, name);
                break;
            case 'normal-map':
                this.normalMap = newValue ?? '';
                break;
            case 'normal-map-offset':
                this.normalMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'normal-map-rotation':
                this.normalMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'normal-map-tiling':
                this.normalMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'normal-map-uv':
                this.normalMapUv = parseNumber(newValue, 0, name);
                break;
            case 'occlude-direct':
                this.occludeDirect = parseBool(newValue, false);
                break;
            case 'occlude-specular':
                this.occludeSpecular = parseEnum(newValue, occludeSpeculars, 'ao', name);
                break;
            case 'opacity':
                this.opacity = parseNumber(newValue, 1, name);
                break;
            case 'opacity-dither':
                this.opacityDither = parseEnum(newValue, opacityDithers, 'none', name);
                break;
            case 'opacity-fades-specular':
                this.opacityFadesSpecular = parseBool(newValue, true);
                break;
            case 'opacity-map':
                this.opacityMap = newValue ?? '';
                break;
            case 'opacity-map-channel':
                this.opacityMapChannel = parseEnum(newValue, scalarChannels, 'a', name);
                break;
            case 'opacity-map-offset':
                this.opacityMapOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'opacity-map-rotation':
                this.opacityMapRotation = parseNumber(newValue, 0, name);
                break;
            case 'opacity-map-tiling':
                this.opacityMapTiling = parseVec2(newValue, new Vec2(1, 1), name);
                break;
            case 'opacity-map-uv':
                this.opacityMapUv = parseNumber(newValue, 0, name);
                break;
            case 'roughness':
                // Aliases gloss, and inverts it so the value reads as roughness. Removing the
                // attribute restores the engine's uninverted interpretation.
                this.gloss = parseNumber(newValue, 0.25, name);
                this.glossInvert = newValue !== null;
                this._warnGlossConflict();
                break;
            case 'roughness-map':
                this.glossMap = newValue ?? '';
                this.glossInvert = newValue !== null;
                this._warnGlossConflict();
                break;
            case 'slope-depth-bias':
                this.slopeDepthBias = parseNumber(newValue, 0, name);
                break;
            case 'specular':
                this.specular = parseColor(newValue, new Color(0, 0, 0), name);
                break;
            case 'specularity-factor':
                this.specularityFactor = parseNumber(newValue, 1, name);
                break;
            case 'two-sided-lighting':
                this.twoSidedLighting = parseBool(newValue, false);
                break;
            case 'use-fog':
                this.useFog = parseBool(newValue, true);
                break;
            case 'use-lighting':
                this.useLighting = parseBool(newValue, true);
                break;
            case 'use-metalness':
                this.useMetalness = parseBool(newValue, true);
                break;
            case 'use-metalness-specular-color':
                this.useMetalnessSpecularColor = parseBool(newValue, false);
                break;
            case 'use-skybox':
                this.useSkybox = parseBool(newValue, true);
                break;
            case 'use-tonemap':
                this.useTonemap = parseBool(newValue, true);
                break;
        }
    }
}

customElements.define('pc-material', MaterialElement);

export { MaterialElement };
