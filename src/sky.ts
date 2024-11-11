import { EnvLighting, LAYERID_SKYBOX, Quat, Texture, Vec3 } from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { parseVec3 } from './utils';

/**
 * Represents a sky in the PlayCanvas engine.
 */
class SkyElement extends AsyncElement {
    private _asset = '';

    private _center = new Vec3(0, 0.01, 0);

    private _intensity = 1;

    private _rotation = new Vec3();

    private _level = 0;

    private _scale = new Vec3(100, 100, 100);

    private _type: 'box' | 'dome' | 'infinite' | 'none' = 'infinite';

    async connectedCallback() {
        await this.closestApp?.ready();

        this.asset = this.getAttribute('asset') || '';

        this._onReady();
    }

    getScene() {
        const app = this.closestApp!.app;
        if (!app) {
            return;
        }
        return app.scene;
    }

    private initSkybox(source: Texture) {
        source.anisotropy = 4;

        const skybox = EnvLighting.generateSkyboxCubemap(source);
        const lighting = EnvLighting.generateLightingSource(source);
        const envAtlas = EnvLighting.generateAtlas(lighting);
        const app = this.closestApp!.app;
        if (app) {
            app.scene.envAtlas = envAtlas;
            app.scene.skybox = skybox;

            const layer = app.scene.layers.getLayerById(LAYERID_SKYBOX);
            if (layer) {
                layer.enabled = this._type !== 'none';
            }

            app.scene.sky.type = this._type;
            app.scene.sky.node.setLocalScale(this._scale);
            app.scene.sky.center = this._center;
        }
    }

    set asset(value: string) {
        this._asset = value;
        const scene = this.getScene();
        if (scene) {
            const asset = AssetElement.get(value);
            if (asset) {
                this.initSkybox(asset.resource);
            }
        }
    }

    get asset() {
        return this._asset;
    }

    set center(value: Vec3) {
        this._center = value;
        const scene = this.getScene();
        if (scene) {
            scene.sky.center = this._center;
        }
    }

    get center() {
        return this._center;
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

    set rotation(value: Vec3) {
        this._rotation = value;
        const scene = this.getScene();
        if (scene) {
            scene.skyboxRotation = new Quat().setFromEulerAngles(value);
        }
    }

    get rotation() {
        return this._rotation;
    }

    set scale(value: Vec3) {
        this._scale = value;
        const scene = this.getScene();
        if (scene) {
            scene.sky.node.setLocalScale(this._scale);
        }
    }

    get scale() {
        return this._scale;
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

    set type(value: 'box' | 'dome' | 'infinite' | 'none') {
        this._type = value;
        const scene = this.getScene();
        if (scene) {
            scene.sky.type = this._type;
            const layer = scene.layers.getLayerById(LAYERID_SKYBOX);
            if (layer) {
                layer.enabled = this._type !== 'none';
            }
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return ['asset', 'center', 'intensity', 'level', 'rotation', 'scale', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'center':
                this.center = parseVec3(newValue);
                break;
            case 'intensity':
                this.intensity = parseFloat(newValue);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'level':
                this.level = parseInt(newValue, 10);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'type':
                this.type = newValue as 'box' | 'dome' | 'infinite' | 'none';
                break;
        }
    }
}

customElements.define('pc-sky', SkyElement);

export { SkyElement };
