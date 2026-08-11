import {
    ADDRESS_CLAMP_TO_EDGE,
    ADDRESS_MIRRORED_REPEAT,
    ADDRESS_REPEAT,
    Asset,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    FILTER_LINEAR_MIPMAP_NEAREST,
    FILTER_NEAREST,
    FILTER_NEAREST_MIPMAP_LINEAR,
    FILTER_NEAREST_MIPMAP_NEAREST,
    SPRITE_RENDERMODE_SIMPLE,
    SPRITE_RENDERMODE_SLICED,
    SPRITE_RENDERMODE_TILED
} from 'playcanvas';
import type { Texture, TextureAtlas } from 'playcanvas';

import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';

import { AsyncElement } from './async-element';
import { parseBool, parseEnum, parseNumber } from './parse';

const renderModes = new Map<'simple' | 'sliced' | 'tiled', number>([
    ['simple', SPRITE_RENDERMODE_SIMPLE],
    ['sliced', SPRITE_RENDERMODE_SLICED],
    ['tiled', SPRITE_RENDERMODE_TILED]
]);

type AddressMode = 'repeat' | 'clamp' | 'mirror';

const addressModes = new Map<AddressMode, number>([
    ['repeat', ADDRESS_REPEAT],
    ['clamp', ADDRESS_CLAMP_TO_EDGE],
    ['mirror', ADDRESS_MIRRORED_REPEAT]
]);

type MinFilterMode =
    'nearest' | 'linear' | 'nearest-mip-nearest' | 'linear-mip-nearest' | 'nearest-mip-linear' | 'linear-mip-linear';

const minFilterModes = new Map<MinFilterMode, number>([
    ['nearest', FILTER_NEAREST],
    ['linear', FILTER_LINEAR],
    ['nearest-mip-nearest', FILTER_NEAREST_MIPMAP_NEAREST],
    ['linear-mip-nearest', FILTER_LINEAR_MIPMAP_NEAREST],
    ['nearest-mip-linear', FILTER_NEAREST_MIPMAP_LINEAR],
    ['linear-mip-linear', FILTER_LINEAR_MIPMAP_LINEAR]
]);

// Magnification has no mip variants - the engine (and the GPU) only accepts these two.
type MagFilterMode = 'nearest' | 'linear';

const magFilterModes = new Map<MagFilterMode, number>([
    ['nearest', FILTER_NEAREST],
    ['linear', FILTER_LINEAR]
]);

// The engine's texture JSON spells the filter names with underscores ('linear_mip_linear'); the
// attribute values are kebab-case like every other enum attribute in this library. The address
// mode names contain no dashes, so for them the rename is the identity.
const toTextureJson = (name: string) => name.replace(/-/g, '_');

/** The Texture properties written by the texture option attributes. */
type TextureOptionProperty =
    'addressU' | 'addressV' | 'anisotropy' | 'flipY' | 'magFilter' | 'minFilter' | 'mipmaps' | 'srgb';

// Engine Texture constructor defaults, restored on a loaded texture when a texture option
// attribute is removed.
const textureOptionDefaults: Record<TextureOptionProperty, number | boolean> = {
    addressU: ADDRESS_REPEAT,
    addressV: ADDRESS_REPEAT,
    anisotropy: 1,
    flipY: false,
    magFilter: FILTER_LINEAR,
    minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
    mipmaps: true,
    srgb: false
};

// Attributes that only apply to certain asset types, used to warn when one is set on an asset of
// any other type (where it would otherwise be silently ignored).
const typeScopedAttributes: [attributes: string[], types: string[]][] = [
    [
        ['address-u', 'address-v', 'anisotropy', 'flip-y', 'mag-filter', 'min-filter', 'mipmaps', 'srgb'],
        ['texture', 'textureatlas']
    ],
    [['atlas', 'frame-keys', 'pixels-per-unit', 'render-mode'], ['sprite']]
];

const extToType = new Map([
    ['bin', 'binary'],
    ['css', 'css'],
    ['frag', 'shader'],
    ['glb', 'container'],
    ['glsl', 'shader'],
    ['gltf', 'container'],
    ['hdr', 'texture'],
    ['html', 'html'],
    ['jpg', 'texture'],
    ['js', 'script'],
    ['json', 'json'],
    ['ktx2', 'texture'],
    ['mp3', 'audio'],
    ['mjs', 'script'],
    ['ply', 'gsplat'],
    ['png', 'texture'],
    ['sog', 'gsplat'],
    ['txt', 'text'],
    ['vert', 'shader'],
    ['webp', 'texture']
]);

// provide buffer view callback so we can handle models compressed with MeshOptimizer
// https://github.com/zeux/meshoptimizer
const processBufferView = (
    gltfBuffer: any,
    buffers: any[],
    continuation: (err: string | null, result: any) => void
) => {
    if (gltfBuffer.extensions && gltfBuffer.extensions.EXT_meshopt_compression) {
        const extensionDef = gltfBuffer.extensions.EXT_meshopt_compression;

        Promise.all([MeshoptDecoder.ready, buffers[extensionDef.buffer]]).then((promiseResult) => {
            const buffer = promiseResult[1];

            const byteOffset = extensionDef.byteOffset || 0;
            const byteLength = extensionDef.byteLength || 0;

            const count = extensionDef.count;
            const stride = extensionDef.byteStride;

            const result = new Uint8Array(count * stride);
            const source = new Uint8Array(buffer.buffer, buffer.byteOffset + byteOffset, byteLength);

            MeshoptDecoder.decodeGltfBuffer(result, count, stride, source, extensionDef.mode, extensionDef.filter);

            continuation(null, result);
        });
    } else {
        continuation(null, null);
    }
};

/**
 * The AssetElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-asset/ | `<pc-asset>`} elements.
 * The AssetElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The element becomes ready once the containing application has started and the asset is in the
 * state declared by the markup: loaded for preloaded assets (even if loading failed — check the
 * asset's `resource`), or registered and awaiting a load for `lazy` assets. Elements inserted
 * while the application is running are created and registered on insertion, and begin loading
 * immediately unless `lazy`. A `pc-asset` must be a direct child of `pc-app` — elements placed
 * elsewhere, or with an unsupported asset type, never become ready.
 *
 * A `lazy` asset loads on first use: the first time any element resolves it by `id` — a model,
 * a material map, a sky, a script `asset:` reference — or when the `lazy` attribute is removed,
 * whichever comes first. Until then it stays registered and unloaded.
 *
 * For `texture` and `textureatlas` assets, the texture options (`address-u`, `address-v`,
 * `min-filter`, `mag-filter`, `anisotropy`, `mipmaps`, `srgb`, `flip-y`) apply when the texture is
 * created and — like `lazy` — are observed: changing one updates a texture that has already
 * loaded, and removing one restores the engine default. Changing `srgb` or `mipmaps` on a loaded
 * texture recreates the underlying GPU resource, so prefer declaring those up front. Each option
 * overrides the matching key in the `data` JSON; options left unset write nothing, leaving the
 * engine's per-format defaults in force.
 *
 * Apart from `lazy` and the texture options, these attributes are read once when the asset is
 * created, so changing them later has no effect.
 *
 * @attribute {string} id - The identifier used to reference the asset from other elements.
 * @attribute {string} src - The URL of the asset to load.
 * @attribute {string} type - The asset type. Inferred from the `src` file extension when omitted.
 * @attribute {string} data - Additional asset data, as a JSON object.
 * @attribute {string} atlas - For a `sprite` asset, the `id` of the texture atlas asset it uses.
 * The atlas must be declared before the sprite.
 * @attribute {string} frame-keys - For a `sprite` asset, the atlas frame keys it uses, separated
 * by spaces or commas.
 * @attribute {number} pixels-per-unit - For a `sprite` asset, the number of pixels per world unit.
 * @attribute {'simple' | 'sliced' | 'tiled'} render-mode - For a `sprite` asset, how the sprite is
 * rendered when resized.
 *
 * @fires {Event} load - Fired each time the asset finishes loading, including a `lazy` asset
 * loaded later and any subsequent reloads. Does not bubble — listen on this element, or use a
 * capture-phase listener on an ancestor to observe every asset.
 * @fires {ErrorEvent} error - Fired when the asset fails to load, with the engine's error in
 * `message`. Does not bubble. The element still becomes ready — readiness means the load settled,
 * not that it succeeded.
 */
class AssetElement extends AsyncElement {
    private _addressU: AddressMode | null = null;

    private _addressV: AddressMode | null = null;

    private _anisotropy: number | null = null;

    private _flipY: boolean | null = null;

    private _lazy = false;

    private _magFilter: MagFilterMode | null = null;

    private _minFilter: MinFilterMode | null = null;

    private _mipmaps: boolean | null = null;

    private _srgb: boolean | null = null;

    /**
     * The asset that is loaded. Available once the element is ready — await
     * {@link whenReady} or the element's `ready()` promise before accessing it.
     */
    asset: Asset | null = null;

    async connectedCallback() {
        const appElement = this.closestApp;
        if (!appElement) return;

        // Assets must be direct children of pc-app (matches the boot query ':scope > pc-asset')
        if (this.parentElement !== appElement) {
            console.warn(
                `pc-asset '${this.getAttribute('id') ?? this.getAttribute('src')}' must be a direct child of pc-app - asset not created`
            );
            return;
        }

        await appElement.ready();

        // The element may have been removed or re-parented while waiting for the app
        if (!this.isConnected || this.parentElement !== appElement) return;

        // Assets present at startup are created by AppElement's boot; this branch handles
        // elements inserted (or re-inserted) after the app is already running
        if (!this.asset) {
            const app = appElement.app;
            if (!app) return; // pc-app is re-connecting; its own boot will create this asset

            this._createAsset();
            if (this.asset) {
                app.assets.add(this.asset); // add() auto-loads when preload is true
                if (!this.lazy) {
                    app.assets.load(this.asset);
                }
            }
        }

        // Never ready if _createAsset failed (unsupported asset type)
        if (this.asset) {
            this._onReady();
        }
    }

    disconnectedCallback() {
        this._destroyAsset();
        // Re-arm readiness so a re-inserted element announces the asset it creates then
        this._resetReady();
    }

    private _onAssetLoad() {
        this.dispatchEvent(new Event('load'));
    }

    private _onAssetError(err: string | Error) {
        this.dispatchEvent(
            new ErrorEvent('error', {
                message: err instanceof Error ? err.message : String(err)
            })
        );
    }

    /**
     * Creates the asset from the element's attributes. Called by the containing `<pc-app>`
     * element during its boot sweep, and on connection for elements inserted while the
     * application is already running.
     *
     * @internal
     */
    _createAsset() {
        const id = this.getAttribute('id') || '';
        const src = this.getAttribute('src') || '';
        let type = this.getAttribute('type');

        // If no type is specified, try to infer it from the file extension.
        if (!type) {
            const ext = src.split('.').pop();
            type = extToType.get(ext || '') ?? null;
        }

        if (!type) {
            console.warn(`Unsupported asset type: ${src}`);
            return;
        }

        // Attributes scoped to other asset types have no effect here - say so rather than
        // failing silently.
        const inapplicable = typeScopedAttributes
            .filter(([, types]) => !types.includes(type))
            .flatMap(([attributes]) => attributes)
            .filter((attribute) => this.hasAttribute(attribute));
        if (inapplicable.length > 0) {
            console.warn(
                `pc-asset '${id || src}' has attributes that do not apply to asset type '${type}' and are ignored: ${inapplicable.join(', ')}`
            );
        }

        // Optional inline asset data, used by data-driven assets such as texture atlases (frame
        // definitions) and sprites (atlas reference, frame keys, etc.).
        const data = this._buildData(type);

        if (type === 'container') {
            this.asset = new Asset(id, type, { url: src }, undefined, {
                // @ts-ignore TODO no definition in pc
                bufferView: {
                    processAsync: processBufferView.bind(this)
                }
            });
        } else if (type === 'sprite') {
            // Sprite assets have no file of their own; their data references a texture atlas asset.
            // @ts-ignore
            this.asset = new Asset(id, type, null, data);
        } else {
            // @ts-ignore
            this.asset = new Asset(id, type, src ? { url: src } : null, data);
        }

        this.asset.preload = !this._lazy;

        // Forward the engine asset's load outcome as DOM events on this element, like <img>.
        // Attached before the asset joins the registry, which is what starts a preloaded load.
        this.asset.on('load', this._onAssetLoad, this);
        this.asset.on('error', this._onAssetError, this);
    }

    /**
     * Builds the `data` object for the asset from an optional inline `data` attribute (JSON), the
     * texture option attributes (for `texture` and `textureatlas` assets), and the sprite
     * convenience attributes (`atlas`, `frame-keys`, `pixels-per-unit`, `render-mode`). An
     * attribute overrides the matching `data` JSON key. Returns `undefined` when there is no data
     * to apply.
     * @param type - The resolved asset type.
     * @returns The asset data, or `undefined`.
     */
    private _buildData(type: string): Record<string, any> | undefined {
        let data: Record<string, any> | undefined;

        const dataAttr = this.getAttribute('data');
        if (dataAttr) {
            try {
                data = JSON.parse(dataAttr);
            } catch (e) {
                console.warn(`Invalid 'data' JSON on pc-asset: ${dataAttr}`);
            }
        }

        if (type === 'texture' || type === 'textureatlas') {
            data = data ?? {};

            // Only options the user actually set are written: the engine reads these keys with
            // hasOwnProperty semantics, and an absent key leaves its per-format default (an HDR's
            // 'rgbe' type, a KTX2's transcoded format) in force.
            if (this._addressU !== null) {
                data.addressu = this._addressU;
            }
            if (this._addressV !== null) {
                data.addressv = this._addressV;
            }
            if (this._anisotropy !== null) {
                data.anisotropy = this._anisotropy;
            }
            if (this._flipY !== null) {
                // 'flipY' is the one camelCase key in the engine's texture JSON
                data.flipY = this._flipY;
            }
            if (this._magFilter !== null) {
                data.magfilter = toTextureJson(this._magFilter);
            }
            if (this._minFilter !== null) {
                data.minfilter = toTextureJson(this._minFilter);
            }
            if (this._mipmaps !== null) {
                data.mipmaps = this._mipmaps;
            }
            if (this._srgb !== null) {
                data.srgb = this._srgb;
            }
        }

        if (type === 'sprite') {
            data = data ?? {};

            // Resolve the referenced texture atlas to its (numeric) asset id. The atlas must be
            // declared before the sprite so its asset already exists in the registry. The
            // passive lookup is deliberate: creation-time wiring is not a use, and the engine's
            // sprite handler loads the atlas when the sprite itself loads.
            const atlas = this.getAttribute('atlas') ?? data.textureAtlasAsset;
            if (typeof atlas === 'string') {
                const atlasAsset = AssetElement.get(atlas);
                if (atlasAsset) {
                    data.textureAtlasAsset = atlasAsset.id;
                } else {
                    console.warn(`pc-asset sprite '${this.getAttribute('id')}' could not find atlas '${atlas}'`);
                }
            }

            const frameKeys = this.getAttribute('frame-keys');
            if (frameKeys !== null) {
                data.frameKeys = frameKeys.split(/[\s,]+/).filter(Boolean);
            }

            const pixelsPerUnit = this.getAttribute('pixels-per-unit');
            if (pixelsPerUnit !== null) {
                data.pixelsPerUnit = parseNumber(pixelsPerUnit, 1, 'pixels-per-unit');
            }

            const renderMode = this.getAttribute('render-mode');
            if (renderMode !== null) {
                data.renderMode = renderModes.get(parseEnum(renderMode, renderModes, 'simple', 'render-mode'));
            }

            // Apply engine defaults for any values not supplied.
            data.renderMode = data.renderMode ?? SPRITE_RENDERMODE_SIMPLE;
            data.pixelsPerUnit = data.pixelsPerUnit ?? 1;
            data.frameKeys = data.frameKeys ?? [];
        }

        return data;
    }

    /**
     * Returns the engine texture behind this asset, when there is one: the resource itself for a
     * `texture` asset, the atlas's texture for a `textureatlas` asset, `null` otherwise
     * (including before the asset has loaded).
     * @returns The texture, or `null`.
     */
    private _texture(): Texture | null {
        const asset = this.asset;
        if (!asset?.resource) return null;
        if (asset.type === 'texture') return asset.resource as Texture;
        if (asset.type === 'textureatlas') return (asset.resource as TextureAtlas).texture ?? null;
        return null;
    }

    /**
     * Writes one texture option through to the created asset, if any. The engine-JSON key is
     * written into `asset.data`, mutated in place - replacing the whole object would make the
     * registry re-patch every key, and a re-patched `srgb` or `mipmaps` recreates the texture
     * even when unchanged. The in-place key is what a not-yet-started load reads at texture
     * construction, and what any later reload reads. When the texture already exists, the
     * corresponding property is assigned directly; `null` (attribute removed) deletes the key
     * and restores the engine default. Assets of any other type are left untouched.
     *
     * @param key - The engine texture JSON key in `asset.data`.
     * @param property - The Texture property to assign.
     * @param dataValue - The engine-JSON value for `asset.data`, or `null` to delete the key.
     * @param textureValue - The value for the Texture property, or `null` for the engine default.
     */
    private _applyTextureOption(
        key: string,
        property: TextureOptionProperty,
        dataValue: string | number | boolean | null,
        textureValue: number | boolean | null
    ) {
        const asset = this.asset;
        if (!asset || (asset.type !== 'texture' && asset.type !== 'textureatlas')) return;

        const data = asset.data as Record<string, any>;
        if (dataValue === null) {
            delete data[key];
        } else {
            data[key] = dataValue;
        }

        const texture = this._texture();
        if (texture) {
            // Every option here is a number- or boolean-valued Texture property; the
            // value/property pairing is fixed by the callers, which TypeScript cannot see
            // through the union.
            (texture as unknown as Record<TextureOptionProperty, number | boolean>)[property] =
                textureValue ?? textureOptionDefaults[property];
        }
    }

    private _destroyAsset() {
        if (this.asset) {
            // A caller that keeps the Asset alive must not dispatch on a removed element
            this.asset.off('load', this._onAssetLoad, this);
            this.asset.off('error', this._onAssetError, this);
            // Deregister first so unload() can still notify the registry
            this.asset.registry?.remove(this.asset);
            this.asset.unload();
            this.asset = null;
        }
    }

    /**
     * Sets the texture's horizontal (U) address mode: how texture coordinates outside the 0 to 1
     * range sample the texture. Applies to `texture` and `textureatlas` assets, both when the
     * texture is created and after it has loaded.
     * @param value - The address mode, or `null` to use the engine default of 'repeat'.
     */
    set addressU(value: AddressMode | null) {
        this._addressU = value;
        const constant = value === null ? null : (addressModes.get(value) ?? ADDRESS_REPEAT);
        this._applyTextureOption('addressu', 'addressU', value, constant);
    }

    /**
     * Gets the texture's horizontal (U) address mode.
     * @returns The address mode, or `null` when unset.
     */
    get addressU(): AddressMode | null {
        return this._addressU;
    }

    /**
     * Sets the texture's vertical (V) address mode: how texture coordinates outside the 0 to 1
     * range sample the texture. Applies to `texture` and `textureatlas` assets, both when the
     * texture is created and after it has loaded.
     * @param value - The address mode, or `null` to use the engine default of 'repeat'.
     */
    set addressV(value: AddressMode | null) {
        this._addressV = value;
        const constant = value === null ? null : (addressModes.get(value) ?? ADDRESS_REPEAT);
        this._applyTextureOption('addressv', 'addressV', value, constant);
    }

    /**
     * Gets the texture's vertical (V) address mode.
     * @returns The address mode, or `null` when unset.
     */
    get addressV(): AddressMode | null {
        return this._addressV;
    }

    /**
     * Sets the texture's maximum anisotropic filtering level, which improves quality at oblique
     * viewing angles. Applies to `texture` and `textureatlas` assets, both when the texture is
     * created and after it has loaded.
     * @param value - The anisotropy level, or `null` to use the engine default of 1.
     */
    set anisotropy(value: number | null) {
        this._anisotropy = value;
        this._applyTextureOption('anisotropy', 'anisotropy', value, value);
    }

    /**
     * Gets the texture's maximum anisotropic filtering level.
     * @returns The anisotropy level, or `null` when unset.
     */
    get anisotropy(): number | null {
        return this._anisotropy;
    }

    /**
     * Sets whether the texture's image data is flipped vertically at upload. Applies to `texture`
     * and `textureatlas` assets, both when the texture is created and after it has loaded.
     * @param value - The flip flag, or `null` to use the engine default of `false`.
     */
    set flipY(value: boolean | null) {
        this._flipY = value;
        this._applyTextureOption('flipY', 'flipY', value, value);
    }

    /**
     * Gets whether the texture's image data is flipped vertically at upload.
     * @returns The flip flag, or `null` when unset.
     */
    get flipY(): boolean | null {
        return this._flipY;
    }

    /**
     * Sets whether the asset should be loaded lazily. A lazy asset is registered without being
     * loaded; it loads on first use - the first time any element resolves it by `id` - or when
     * this flag is cleared on a registered asset, whichever comes first.
     * @param value - The lazy loading flag.
     */
    set lazy(value: boolean) {
        this._lazy = value;
        if (this.asset) {
            this.asset.preload = !value;
            // Clearing lazy on a registered asset is the declarative way to start its load
            if (!value) {
                this.asset.registry?.load(this.asset);
            }
        }
    }

    /**
     * Gets whether the asset should be loaded lazily.
     * @returns The lazy loading flag.
     */
    get lazy() {
        return this._lazy;
    }

    /**
     * Sets the texture's magnification filter, used when the texture is displayed larger than its
     * source size. Applies to `texture` and `textureatlas` assets, both when the texture is
     * created and after it has loaded.
     * @param value - The filter, or `null` to use the engine default of 'linear'.
     */
    set magFilter(value: MagFilterMode | null) {
        this._magFilter = value;
        const json = value === null ? null : toTextureJson(value);
        const constant = value === null ? null : (magFilterModes.get(value) ?? FILTER_LINEAR);
        this._applyTextureOption('magfilter', 'magFilter', json, constant);
    }

    /**
     * Gets the texture's magnification filter.
     * @returns The filter, or `null` when unset.
     */
    get magFilter(): MagFilterMode | null {
        return this._magFilter;
    }

    /**
     * Sets the texture's minification filter, used when the texture is displayed smaller than its
     * source size. The mip variants blend within (and, for the second `linear`, between) mipmap
     * levels. Applies to `texture` and `textureatlas` assets, both when the texture is created
     * and after it has loaded.
     * @param value - The filter, or `null` to use the engine default of 'linear-mip-linear'.
     */
    set minFilter(value: MinFilterMode | null) {
        this._minFilter = value;
        const json = value === null ? null : toTextureJson(value);
        const constant = value === null ? null : (minFilterModes.get(value) ?? FILTER_LINEAR_MIPMAP_LINEAR);
        this._applyTextureOption('minfilter', 'minFilter', json, constant);
    }

    /**
     * Gets the texture's minification filter.
     * @returns The filter, or `null` when unset.
     */
    get minFilter(): MinFilterMode | null {
        return this._minFilter;
    }

    /**
     * Sets whether the texture generates and uses mipmaps. Changing this on a loaded texture
     * recreates the underlying GPU resource, so prefer declaring it up front. Applies to
     * `texture` and `textureatlas` assets.
     * @param value - The mipmaps flag, or `null` to use the engine default of `true`.
     */
    set mipmaps(value: boolean | null) {
        this._mipmaps = value;
        this._applyTextureOption('mipmaps', 'mipmaps', value, value);
    }

    /**
     * Gets whether the texture generates and uses mipmaps.
     * @returns The mipmaps flag, or `null` when unset.
     */
    get mipmaps(): boolean | null {
        return this._mipmaps;
    }

    /**
     * Sets whether the texture holds sRGB (gamma-encoded) color data, enabling hardware gamma
     * decode. Free when set before the texture loads; changing it on a loaded texture recreates
     * the underlying GPU resource. Applies to `texture` and `textureatlas` assets.
     * @param value - The sRGB flag, or `null` to use the engine default of `false`.
     */
    set srgb(value: boolean | null) {
        this._srgb = value;
        this._applyTextureOption('srgb', 'srgb', value, value);
    }

    /**
     * Gets whether the texture holds sRGB (gamma-encoded) color data.
     * @returns The sRGB flag, or `null` when unset.
     */
    get srgb(): boolean | null {
        return this._srgb;
    }

    /**
     * Returns the {@link Asset} created by the `<pc-asset>` element with the given `id`, or
     * `undefined` if there is no such element or its asset has not been created yet.
     *
     * The lookup is passive - it never starts a load. A `lazy` asset loads when an element that
     * references it uses it, or when its `lazy` attribute is removed; to load one imperatively,
     * pass it to the registry's own `app.assets.load()`.
     *
     * @param id - The `id` of the `<pc-asset>` element.
     * @returns The asset, or `undefined`.
     */
    static get(id: string) {
        const assetElement = document.querySelector<AssetElement>(`pc-asset[id="${id}"]`);
        return assetElement?.asset;
    }

    static get observedAttributes() {
        return [
            'address-u',
            'address-v',
            'anisotropy',
            'flip-y',
            'lazy',
            'mag-filter',
            'min-filter',
            'mipmaps',
            'srgb'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        // Each texture option keeps its parse* call as the branch's first assignment (the CEM
        // manifest derives the attribute's type and default from it - a ternary would degrade
        // both to plain string) and treats a removed attribute (null) as a reset to unset,
        // which restores the engine default on a loaded texture.
        switch (name) {
            case 'address-u':
                if (newValue !== null) {
                    this.addressU = parseEnum(newValue, addressModes, 'repeat', name);
                } else {
                    this.addressU = null;
                }
                break;
            case 'address-v':
                if (newValue !== null) {
                    this.addressV = parseEnum(newValue, addressModes, 'repeat', name);
                } else {
                    this.addressV = null;
                }
                break;
            case 'anisotropy':
                if (newValue !== null) {
                    this.anisotropy = parseNumber(newValue, 1, name);
                } else {
                    this.anisotropy = null;
                }
                break;
            case 'flip-y':
                if (newValue !== null) {
                    this.flipY = parseBool(newValue, false);
                } else {
                    this.flipY = null;
                }
                break;
            case 'lazy':
                this.lazy = parseBool(newValue, false);
                break;
            case 'mag-filter':
                if (newValue !== null) {
                    this.magFilter = parseEnum(newValue, magFilterModes, 'linear', name);
                } else {
                    this.magFilter = null;
                }
                break;
            case 'min-filter':
                if (newValue !== null) {
                    this.minFilter = parseEnum(newValue, minFilterModes, 'linear-mip-linear', name);
                } else {
                    this.minFilter = null;
                }
                break;
            case 'mipmaps':
                if (newValue !== null) {
                    this.mipmaps = parseBool(newValue, true);
                } else {
                    this.mipmaps = null;
                }
                break;
            case 'srgb':
                if (newValue !== null) {
                    this.srgb = parseBool(newValue, false);
                } else {
                    this.srgb = null;
                }
                break;
        }
    }
}

customElements.define('pc-asset', AssetElement);

/**
 * Resolves an asset reference for use: {@link AssetElement.get}, plus starting the load of a
 * registered asset that has not begun one - a `lazy` asset. Every element that consumes assets
 * resolves its references here rather than through the passive `get`, which is what makes
 * `lazy` mean load on first use without any consumer having to remember the load. The load is
 * asynchronous - callers observe the asset's `load` event for the resource.
 *
 * Exported for the element implementations, not from the package entry point - internal API,
 * like the parse helpers.
 *
 * @param id - The `id` of the `<pc-asset>` element.
 * @returns The asset, or `undefined`.
 */
const useAsset = (id: string) => {
    const asset = AssetElement.get(id);
    // load() ignores an asset that is already loaded or loading, so repeated resolution
    // costs nothing.
    if (asset) {
        asset.registry?.load(asset);
    }
    return asset;
};

export { AssetElement, useAsset };
