import { Asset } from 'playcanvas';

class AssetElement extends HTMLElement {
    constructor() {
        super();
        this.asset = null;
    }

    connectedCallback() {
        const id = this.getAttribute('id');
        const src = this.getAttribute('src');
        const type = this.getAttribute('type');

        if (!id) {
            console.error('Asset element must have an id attribute');
            return;
        }

        this.asset = new Asset(id, type, { url: src });

        const appElement = this.closest('pc-application');
        if (appElement && appElement.app) {
            appElement.app.assets.add(this.asset);
            this.asset.load();
        } else {
            console.warn('Asset element must be a descendant of a pc-application element');
        }
    }

    disconnectedCallback() {
        if (this.asset) {
            const appElement = this.closest('pc-application');
            if (appElement && appElement.app) {
                appElement.app.assets.remove(this.asset);
            }
            this.asset = null;
        }
    }
}

customElements.define('pc-asset', AssetElement);

export { AssetElement };
