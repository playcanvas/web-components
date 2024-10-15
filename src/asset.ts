import { Asset } from 'playcanvas';

const extToType = new Map([
    ['bin', 'binary'],
    ['frag', 'shader'],
    ['glb', 'container'],
    ['glsl', 'shader'],
    ['html', 'html'],
    ['jpg', 'texture'],
    ['json', 'json'],
    ['mp3', 'audio'],
    ['png', 'texture'],
    ['txt', 'text'],
    ['vert', 'shader'],
    ['webp', 'texture']
]);

class AssetElement extends HTMLElement {
    asset: Asset | null = null;

    connectedCallback() {
        const id = this.getAttribute('id') || '';
        const src = this.getAttribute('src') || '';

        const ext = src.split('.').pop();
        const type = extToType.get(ext || '');

        if (!type) {
            console.warn(`Unsupported asset type: ${ext}`);
            return;
        }

        this.asset = new Asset(id, type, { url: src });
    }

    disconnectedCallback() {
    }
}

export { AssetElement };
