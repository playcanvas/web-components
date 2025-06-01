import { Asset } from 'playcanvas';

import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';

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
 */
class AssetElement extends HTMLElement {
    private _lazy: boolean = false;

    /**
     * The asset that is loaded.
     */
    asset: Asset | null = null;

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

        if (type === 'container') {
            this.asset = new Asset(id, type, { url: src }, undefined, {
                // @ts-ignore TODO no definition in pc
                bufferView: {
                    processAsync: processBufferView.bind(this)
                }
            });
        } else {
            // @ts-ignore
            this.asset = new Asset(id, type, { url: src });
        }

        this.asset.preload = !this._lazy;
    }


    destroyAsset() {
        if (this.asset) {
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

export { AssetElement };
