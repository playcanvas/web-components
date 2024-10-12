import { Asset } from 'playcanvas';

class ModelElement extends HTMLElement {
    static observedAttributes = ['src'];

    _src = '';

    connectedCallback() {
        this._src = this.getAttribute('src') || '';
        this._loadModel();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'src' && this._src !== newValue) {
            this._src = newValue;
            this._loadModel();
        }
    }

    _loadModel() {
        const el = this.closest('pc-app');

        const asset = new Asset(this._src, 'container', {
            url: this._src
        });
        asset.once('load', (asset) => {
            const entity = asset.resource.instantiateRenderEntity();
            el.app.root.addChild(entity);
        });
        asset.once('error', (err) => {
            console.error(err);
        });

        el.app.assets.add(asset);
        el.app.assets.load(asset);
    }

    get src() {
        return this._src;
    }
}

export { ModelElement };
