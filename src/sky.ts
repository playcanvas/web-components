import { AppBase, Asset, EnvLighting, LAYERID_SKYBOX, Quat, Scene, Texture, Vec3 } from 'playcanvas';

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

    private _lighting = false;

    private _scale = new Vec3(100, 100, 100);

    private _type: 'box' | 'dome' | 'infinite' | 'none' = 'infinite';

    private _scene: Scene | null = null;

    connectedCallback() {
        this._loadSkybox();
        this._onReady();
    }

    disconnectedCallback() {
        this._unloadSkybox();
    }

    private _generateSkybox(app: AppBase, asset: Asset) {
        const source = asset.resource as Texture;
        source.anisotropy = 4;

        const skybox = EnvLighting.generateSkyboxCubemap(source);
        app.scene.skybox = skybox;

        if (this._lighting) {
            const lighting = EnvLighting.generateLightingSource(source);
            const envAtlas = EnvLighting.generateAtlas(lighting);
            app.scene.envAtlas = envAtlas;
        }

        const layer = app.scene.layers.getLayerById(LAYERID_SKYBOX);
        if (layer) {
            layer.enabled = this._type !== 'none';
        }

        app.scene.sky.type = this._type;
        app.scene.sky.node.setLocalScale(this._scale);
        app.scene.sky.center = this._center;
    }

    private async _loadSkybox() {
        const appElement = await this.closestApp?.ready();
        const app = appElement?.app;
        if (!app) {
            return;
        }

        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        this._scene = app.scene;

        if (asset.loaded) {
            this._generateSkybox(app, asset);
        } else {
            asset.once('load', () => {
                this._generateSkybox(app, asset);
            });
            app.assets.load(asset);
        }
    }

    private _unloadSkybox() {
        const app = this.closestApp!.app;
        if (!app) {
            return;
        }

        app.scene.skybox?.destroy();
        // @ts-ignore
        app.scene.skybox = null;
        app.scene.envAtlas?.destroy();
        // @ts-ignore
        app.scene.envAtlas = null;
    }

    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._loadSkybox();
        }
    }

    get asset() {
        return this._asset;
    }

    set center(value: Vec3) {
        this._center = value;
        if (this._scene) {
            this._scene.sky.center = this._center;
        }
    }

    get center() {
        return this._center;
    }

    set intensity(value: number) {
        this._intensity = value;
        if (this._scene) {
            this._scene.skyboxIntensity = this._intensity;
        }
    }

    get intensity() {
        return this._intensity;
    }

    set level(value: number) {
        this._level = value;
        if (this._scene) {
            this._scene.skyboxMip = this._level;
        }
    }

    get level() {
        return this._level;
    }

    set lighting(value: boolean) {
        this._lighting = value;
    }

    get lighting() {
        return this._lighting;
    }

    set rotation(value: Vec3) {
        this._rotation = value;
        if (this._scene) {
            this._scene.skyboxRotation = new Quat().setFromEulerAngles(value);
        }
    }

    get rotation() {
        return this._rotation;
    }

    set scale(value: Vec3) {
        this._scale = value;
        if (this._scene) {
            this._scene.sky.node.setLocalScale(this._scale);
        }
    }

    get scale() {
        return this._scale;
    }

    set type(value: 'box' | 'dome' | 'infinite' | 'none') {
        this._type = value;
        if (this._scene) {
            this._scene.sky.type = this._type;
            const layer = this._scene.layers.getLayerById(LAYERID_SKYBOX);
            if (layer) {
                layer.enabled = this._type !== 'none';
            }
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return ['asset', 'center', 'intensity', 'level', 'lighting', 'rotation', 'scale', 'type'];
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
            case 'level':
                this.level = parseInt(newValue, 10);
                break;
            case 'lighting':
                this.lighting = this.hasAttribute(name);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
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
