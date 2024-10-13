import { Asset } from 'playcanvas';

import { AppElement } from './app';

class AssetElement extends HTMLElement {
    asset: Asset | null = null;

    constructor() {
        super();
    }

    connectedCallback() {
        const id = this.getAttribute('id');
        const src = this.getAttribute('src') || '';
        const type = this.getAttribute('type') || '';

        if (!id) {
            console.error('Asset element must have an id attribute');
            return;
        }

        this.asset = new Asset(id, type, { url: src });

        const appElement = this.closest('pc-app') as AppElement | null;
        if (appElement && appElement.app) {
            appElement.app.assets.add(this.asset);
            appElement.app.assets.load(this.asset);
        } else {
            console.warn('Asset element must be a descendant of a pc-app element');
        }
    }

    disconnectedCallback() {
        if (this.asset) {
            const appElement = this.closest('pc-app') as AppElement | null;
            if (appElement && appElement.app) {
                appElement.app.assets.remove(this.asset);
            }
            this.asset = null;
        }
    }
}

customElements.define('pc-asset', AssetElement);

export { AssetElement };
