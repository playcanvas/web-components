import { Asset } from 'playcanvas';

import { AppElement } from './app';
import { EntityElement } from './entity';

/**
 * Represents a model in the PlayCanvas engine.
 */
class ModelElement extends HTMLElement {
    static observedAttributes = ['src'];

    private _src = '';

    connectedCallback() {
        this._src = this.getAttribute('src') || '';
        this._loadModel();
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        if (name === 'src' && this._src !== newValue) {
            this._src = newValue;
            this._loadModel();
        }
    }

    _loadModel() {
        const el = this.closest('pc-app') as AppElement | null;
        if (!el) {
            console.warn('Model element must be a descendant of a pc-app element');
            return;
        }

        const asset = new Asset(this._src, 'container', {
            url: this._src
        });
        asset.once('load', (asset) => {
            const entity = asset.resource.instantiateRenderEntity();

            const parentEntityElement = this.closest('pc-entity') as EntityElement | null;
            if (!parentEntityElement) {
                el.app!.root.addChild(entity);
            } else {
                parentEntityElement.entity!.addChild(entity);
            }
        });
        asset.once('error', (err) => {
            console.error(err);
        });

        el.app!.assets.add(asset);
        el.app!.assets.load(asset);
    }

    /**
     * Gets the source URL of the model.
     * @returns The source URL of the model.
     */
    get src() {
        return this._src;
    }
}

customElements.define('pc-model', ModelElement);

export { ModelElement };
