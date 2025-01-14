import { Asset } from 'playcanvas';

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

/**
 * The AssetElement interface provides properties and methods for manipulating
 * `<pc-asset>` elements. The AssetElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class AssetElement extends HTMLElement {
    private _preload: boolean = false;

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

        this.asset = new Asset(id, type, { url: src });
        this.asset.preload = this.preload;
    }

    destroyAsset() {
        if (this.asset) {
            this.asset.unload();
            this.asset = null;
        }
    }

    /**
     * Sets the preload flag of the asset.
     * @param value - The preload flag.
     */
    set preload(value: boolean) {
        this._preload = value;
        if (this.asset) {
            this.asset.preload = value;
        }
    }

    /**
     * Gets the preload flag of the asset.
     * @returns The preload flag.
     */
    get preload() {
        return this._preload;
    }

    static get(id: string) {
        const assetElement = document.querySelector<AssetElement>(`pc-asset[id="${id}"]`);
        return assetElement?.asset;
    }

    static get observedAttributes() {
        return ['preload'];
    }

    attributeChangedCallback(name: string, _oldValue: string, _newValue: string) {
        if (name === 'preload') {
            this.preload = this.hasAttribute('preload');
        }
    }
}

customElements.define('pc-asset', AssetElement);

export { AssetElement };
