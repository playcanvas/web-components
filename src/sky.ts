import { Quat } from 'playcanvas';

import { AppElement } from './app';
import { AssetElement } from './asset';

/**
 * Represents a sky in the PlayCanvas engine.
 */
class SkyElement extends HTMLElement {
    private _asset = '';

    private _intensity = 1;

    private _rotation = [0, 0, 0];

    private _level = 0;

    connectedCallback() {
    }

    getAsset() {
        const assetElement = document.querySelector(`pc-asset[id="${this._asset}"]`) as AssetElement;
        return assetElement!.asset;
    }

    getScene() {
        const el = this.closest('pc-app') as AppElement | null;
        if (!el) {
            return;
        }
        return el.app!.scene;
    }

    static get observedAttributes() {
        return ['asset', 'intensity', 'level', 'rotation'];
    }

    set asset(value: string) {
        this._asset = value;
        const scene = this.getScene();
        if (scene) {
            const asset = this.getAsset();
            if (asset) {
                if (asset.resource) {
                    scene.envAtlas = asset.resource;
                } else {
                    asset.once('load', () => {
                        scene.envAtlas = asset.resource;
                    });
                }
            }
        }
    }

    get asset() {
        return this._asset;
    }

    set intensity(value: number) {
        this._intensity = value;
        const scene = this.getScene();
        if (scene) {
            scene.skyboxIntensity = this._intensity;
        }
    }

    get intensity() {
        return this._intensity;
    }

    set rotation(value: number[]) {
        this._rotation = value;
        const scene = this.getScene();
        if (scene) {
            scene.skyboxRotation = new Quat().setFromEulerAngles(this._rotation[0], this._rotation[1], this._rotation[2]);
        }
    }

    get rotation() {
        return this._rotation;
    }

    set level(value: number) {
        this._level = value;
        const scene = this.getScene();
        if (scene) {
            scene.skyboxMip = this._level;
        }
    }

    get level() {
        return this._level;
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'intensity':
                this.intensity = parseFloat(newValue);
                break;
            case 'rotation':
                this.rotation = newValue.split(',').map(Number);
                break;
            case 'level':
                this.level = parseInt(newValue, 10);
                break;
        }
    }
}

customElements.define('pc-sky', SkyElement);

export { SkyElement };
