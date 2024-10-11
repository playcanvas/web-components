class AssetElement extends HTMLElement {
    static observedAttributes = ['src', 'id'];

    constructor() {
        super();
        this._src = '';
        this._id = '';
        this._type = '';
    }

    connectedCallback() {
        this._src = this.getAttribute('src') || '';
        this._id = this.getAttribute('id') || '';
        this._determineType();
        this._loadAsset();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'src' && this._src !== newValue) {
            this._src = newValue;
            this._determineType();
            this._loadAsset();
        }
        if (name === 'id' && this._id !== newValue) {
            this._id = newValue;
        }
    }

    _determineType() {
        if (this._src.endsWith('.glb')) {
            this._type = 'model';
        } else if (
            this._src.endsWith('.png') ||
        this._src.endsWith('.jpg') ||
        this._src.endsWith('.jpeg') ||
        this._src.endsWith('.gif')
        ) {
            this._type = 'texture';
        } else {
            this._type = '';
            console.error('Unsupported asset type for src:', this._src);
        }
    }

    _loadAsset() {
        // Implement asset loading logic here.
        // This might involve adding the asset to a global asset registry,
        // triggering the asset loading in your PlayCanvas app, etc.
        // e.g.,
        // if (this._type === 'texture') {
        //   loadTexture(this._src, this._id);
        // } else if (this._type === 'model') {
        //   loadModel(this._src, this._id);
        // }
    }

    get src() {
        return this._src;
    }

    get id() {
        return this._id;
    }

    get type() {
        return this._type;
    }
}

export { AssetElement };
