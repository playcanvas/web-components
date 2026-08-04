import { Asset, EnvLighting, LAYERID_SKYBOX, Quat, Scene, Texture, Vec3 } from 'playcanvas';

import { AppElement } from './app';
import { AssetElement } from './asset';
import { AsyncElement } from './async-element';
import { parseBool, parseEnum, parseNumber, parseVec3 } from './parse';

/**
 * The SkyElement interface provides properties and methods for manipulating
 * `<pc-sky>` elements. The SkyElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class SkyElement extends AsyncElement {
    private _asset = '';

    private _center = new Vec3(0, 0.01, 0);

    private _intensity = 1;

    private _rotation = new Vec3();

    private _mipLevel = 0;

    private _lighting = false;

    private _scale = new Vec3(100, 100, 100);

    private _type: 'box' | 'dome' | 'infinite' | 'none' = 'infinite';

    private _scene: Scene | null = null;

    private _appElement: AppElement | null = null;

    connectedCallback() {
        this._loadSkybox();
        this._onReady();
    }

    disconnectedCallback() {
        this._unloadSkybox();
        this._appElement = null;
    }

    private _generateSkybox(asset: Asset) {
        if (!this._scene) return;

        const source = asset.resource as Texture;

        const skybox = EnvLighting.generateSkyboxCubemap(source);
        skybox.anisotropy = 4;
        this._scene.skybox = skybox;

        if (this._lighting) {
            const lighting = EnvLighting.generateLightingSource(source);
            const envAtlas = EnvLighting.generateAtlas(lighting);
            this._scene.envAtlas = envAtlas;
        }

        const layer = this._scene.layers.getLayerById(LAYERID_SKYBOX);
        if (layer) {
            layer.enabled = this._type !== 'none';
        }

        this._scene.sky.type = this._type;
        this._scene.sky.node.setLocalScale(this._scale);
        this._scene.sky.center = this._center;
        this._scene.skyboxIntensity = this._intensity;
        this._scene.skyboxMip = this._mipLevel;
    }

    private async _loadSkybox() {
        const appElement = await this.closestApp?.ready();
        const app = appElement?.app;
        if (!appElement || !app) {
            return;
        }

        this._appElement = appElement;

        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        this._scene = app.scene;

        if (asset.loaded) {
            this._generateSkybox(asset);
        } else {
            asset.once('load', () => {
                this._generateSkybox(asset);
            });
            app.assets.load(asset);
        }
    }

    private _unloadSkybox() {
        const scene = this._scene;
        if (!scene) return;

        this._scene = null;

        // If the owning application has already been destroyed (removing a <pc-app>
        // disconnects it before its children), the scene, graphics device and skybox
        // textures have all been destroyed along with it — nothing left to clean up.
        if (!this._appElement?.app) return;

        scene.skybox?.destroy();
        // @ts-ignore
        scene.skybox = null;
        scene.envAtlas?.destroy();
        // @ts-ignore
        scene.envAtlas = null;
    }

    /**
     * Sets the id of the `pc-asset` to use for the skybox.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._loadSkybox();
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the skybox.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets the center of the skybox.
     * @param value - The center.
     */
    set center(value: Vec3) {
        this._center = value;
        if (this._scene) {
            this._scene.sky.center = this._center;
        }
    }

    /**
     * Gets the center of the skybox.
     * @returns The center.
     */
    get center() {
        return this._center;
    }

    /**
     * Sets the intensity of the skybox.
     * @param value - The intensity.
     */
    set intensity(value: number) {
        this._intensity = value;
        if (this._scene) {
            this._scene.skyboxIntensity = this._intensity;
        }
    }

    /**
     * Gets the intensity of the skybox.
     * @returns The intensity.
     */
    get intensity() {
        return this._intensity;
    }

    /**
     * Sets whether the skybox is used as a light source.
     * @param value - Whether to use lighting.
     */
    set lighting(value: boolean) {
        this._lighting = value;
    }

    /**
     * Gets whether the skybox is used as a light source.
     * @returns Whether to use lighting.
     */
    get lighting() {
        return this._lighting;
    }

    /**
     * Sets the mip level of the skybox, where 0 is the sharpest. Raising it selects a blurrier mip,
     * which is how a skybox is softened without blurring the texture itself.
     * @param value - The mip level.
     */
    set mipLevel(value: number) {
        this._mipLevel = value;
        if (this._scene) {
            this._scene.skyboxMip = this._mipLevel;
        }
    }

    /**
     * Gets the mip level of the skybox.
     * @returns The mip level.
     */
    get mipLevel() {
        return this._mipLevel;
    }

    /**
     * Sets the Euler rotation of the skybox.
     * @param value - The rotation.
     */
    set rotation(value: Vec3) {
        this._rotation = value;
        if (this._scene) {
            this._scene.skyboxRotation = new Quat().setFromEulerAngles(value);
        }
    }

    /**
     * Gets the Euler rotation of the skybox.
     * @returns The rotation.
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * Sets the scale of the skybox.
     * @param value - The scale.
     */
    set scale(value: Vec3) {
        this._scale = value;
        if (this._scene) {
            this._scene.sky.node.setLocalScale(this._scale);
        }
    }

    /**
     * Gets the scale of the skybox.
     * @returns The scale.
     */
    get scale() {
        return this._scale;
    }

    /**
     * Sets the type of the skybox.
     * @param value - The type.
     */
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

    /**
     * Gets the type of the skybox.
     * @returns The type.
     */
    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return ['asset', 'center', 'intensity', 'lighting', 'mip-level', 'rotation', 'scale', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'center':
                this.center = parseVec3(newValue, new Vec3(0, 0.01, 0), name);
                break;
            case 'intensity':
                this.intensity = parseNumber(newValue, 1, name);
                break;
            case 'lighting':
                this.lighting = parseBool(newValue, false);
                break;
            case 'mip-level':
                this.mipLevel = parseNumber(newValue, 0, name);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'scale':
                this.scale = parseVec3(newValue, new Vec3(100, 100, 100), name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['box', 'dome', 'infinite', 'none'], 'infinite', name);
                break;
        }
    }
}

customElements.define('pc-sky', SkyElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-sky': SkyElement;
    }
}

export { SkyElement };
