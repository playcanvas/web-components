import { Asset } from 'playcanvas';

const extToType = new Map([
    ['bin', 'binary'],
    ['frag', 'shader'],
    ['glb', 'container'],
    ['glsl', 'shader'],
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
 * Loads an asset into the PlayCanvas engine.
 */
class AssetElement extends HTMLElement {
    private _preload: boolean = false;

    /**
     * The asset that is loaded.
     */
    asset: Asset | null = null;

    async connectedCallback() {
    }

    disconnectedCallback() {
        this.destroyAsset();
    }

    createAsset() {
        const id = this.getAttribute('id') || '';
        const src = this.getAttribute('src') || '';

        const ext = src.split('.').pop();
        const type = extToType.get(ext || '');

        if (!type) {
            console.warn(`Unsupported asset type: ${ext}`);
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
