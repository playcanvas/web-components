import { Asset, Quat } from 'playcanvas';

import { AppElement } from './app';

/**
 * Represents a sky in the PlayCanvas engine.
 */
class SkyElement extends HTMLElement {
    static observedAttributes = ['src', 'intensity', 'rotation', 'level'];

    _src = '';

    _intensity = 1;

    _rotation = [0, 0, 0];

    _level = 0;

    connectedCallback() {
        this._updateSkybox();
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'src':
                this._src = newValue;
                break;
            case 'intensity':
                this._intensity = parseFloat(newValue);
                break;
            case 'rotation':
                this._rotation = newValue.split(',').map(Number);
                break;
            case 'level':
                this._level = parseInt(newValue, 10);
                break;
        }
        this._updateSkybox();
    }

    _updateSkybox() {
        const el = this.closest('pc-app') as AppElement | null;
        if (!el) {
            return;
        }
        const scene = el.app!.scene;
        this._loadTexture();
        scene.skyboxIntensity = this._intensity;
        scene.skyboxRotation = new Quat().setFromEulerAngles(this._rotation[0], this._rotation[1], this._rotation[2]);
        scene.skyboxMip = this._level;
    }

    _loadTexture() {
        const el = this.closest('pc-app') as AppElement | null;
        if (!el) {
            return;
        }
        const asset = new Asset(this._src, 'texture', {
            url: this._src
        });
        asset.once('load', (asset) => {
            el.app!.scene.envAtlas = asset.resource;
        });
        asset.once('error', (err) => {
            console.error(err);
        });

        el.app!.assets.add(asset);
        el.app!.assets.load(asset);
    }
}

customElements.define('pc-sky', SkyElement);

export { SkyElement };
