import { Asset, SPRITE_RENDERMODE_SIMPLE, SPRITE_RENDERMODE_SLICED, SPRITE_RENDERMODE_TILED } from 'playcanvas';

import { AsyncElement } from './async-element';
import { parseEnum } from './utils';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';

const renderModes = new Map<string, number>([
    ['simple', SPRITE_RENDERMODE_SIMPLE],
    ['sliced', SPRITE_RENDERMODE_SLICED],
    ['tiled', SPRITE_RENDERMODE_TILED]
]);

const extToType = new Map([
    ['bin', 'binary'],
    ['css', 'css'],
    ['frag', 'shader'],
    ['glb', 'container'],
    ['glsl', 'shader'],
    ['hdr', 'texture'],
    ['html', 'html'],
    ['jpg', 'texture'],
    ['js', 'script'],
    ['json', 'json'],
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
    buffers: Array<any>,
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

            MeshoptDecoder.decodeGltfBuffer(
                result,
                count,
                stride,
                source,
                extensionDef.mode,
                extensionDef.filter
            );

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
 */
class AssetElement extends AsyncElement {
    private _lazy: boolean = false;

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
            console.warn(`pc-asset '${this.getAttribute('id') ?? this.getAttribute('src')}' must be a direct child of pc-app - asset not created`);
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

            this.createAsset();
            if (this.asset) {
                app.assets.add(this.asset); // add() auto-loads when preload is true
                if (!this.lazy) {
                    app.assets.load(this.asset);
                }
            }
        }

        // Never ready if createAsset failed (unsupported asset type)
        if (this.asset) {
            this._onReady();
        }
    }

    disconnectedCallback() {
        this.destroyAsset();
    }

    createAsset() {
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
    }

    /**
     * Builds the `data` object for the asset from an optional inline `data` attribute (JSON) and,
     * for sprites, from the convenience attributes (`atlas`, `frame-keys`, `pixels-per-unit`,
     * `render-mode`). Returns `undefined` when there is no data to apply.
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

        if (type === 'sprite') {
            data = data ?? {};

            // Resolve the referenced texture atlas to its (numeric) asset id. The atlas must be
            // declared before the sprite so its asset already exists in the registry.
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
                data.pixelsPerUnit = Number(pixelsPerUnit);
            }

            const renderMode = this.getAttribute('render-mode');
            if (renderMode !== null) {
                data.renderMode = parseEnum(renderMode, renderModes, SPRITE_RENDERMODE_SIMPLE);
            }

            // Apply engine defaults for any values not supplied.
            data.renderMode = data.renderMode ?? SPRITE_RENDERMODE_SIMPLE;
            data.pixelsPerUnit = data.pixelsPerUnit ?? 1;
            data.frameKeys = data.frameKeys ?? [];
        }

        return data;
    }


    destroyAsset() {
        if (this.asset) {
            // Deregister first so unload() can still notify the registry
            this.asset.registry?.remove(this.asset);
            this.asset.unload();
            this.asset = null;
        }
    }

    /**
     * Sets whether the asset should be loaded lazily.
     * @param value - The lazy loading flag.
     */
    set lazy(value: boolean) {
        this._lazy = value;
        if (this.asset) {
            this.asset.preload = !value;
        }
    }

    /**
     * Gets whether the asset should be loaded lazily.
     * @returns The lazy loading flag.
     */
    get lazy() {
        return this._lazy;
    }

    static get(id: string) {
        const assetElement = document.querySelector<AssetElement>(`pc-asset[id="${id}"]`);
        return assetElement?.asset;
    }

    static get observedAttributes() {
        return ['lazy'];
    }

    attributeChangedCallback(name: string, _oldValue: string, _newValue: string) {
        if (name === 'lazy') {
            this.lazy = this.hasAttribute('lazy');
        }
    }
}

customElements.define('pc-asset', AssetElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-asset': AssetElement;
    }
}

export { AssetElement };
