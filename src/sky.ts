import type { Asset, EventHandle, Scene, Texture } from 'playcanvas';
import { EnvLighting, LAYERID_SKYBOX, Quat, Vec3 } from 'playcanvas';

import type { AppElement } from './app';
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

    /**
     * Incremented on every new load and on disconnect, and captured by a load when it starts. A
     * load that resumes from an await or a load callback abandons itself if the value has moved
     * on, so a superseded load cannot generate a skybox for a scene it no longer configures.
     */
    private _loadGeneration = 0;

    /**
     * The pending asset-load subscription of the current load, if it is waiting for its asset.
     * Held so that whatever supersedes the load can detach the handler from the asset, rather
     * than leave it registered until the asset loads (or forever, if it never does).
     */
    private _loadHandle: EventHandle | null = null;

    connectedCallback() {
        this._loadSkybox();
        this._onReady();
    }

    disconnectedCallback() {
        this._loadGeneration++;
        this._detachLoadHandler();
        this._unloadSkybox();
        this._appElement = null;
        this._resetReady();
    }

    private _detachLoadHandler() {
        this._loadHandle?.off();
        this._loadHandle = null;
    }

    private _generateSkybox(asset: Asset) {
        if (!this._scene) return;

        const source = asset.resource as Texture;

        const skybox = EnvLighting.generateSkyboxCubemap(source);
        // This element owns what it generated (see _unloadSkybox) - replacing a skybox from an
        // earlier load must release it, not orphan it on the GPU
        this._scene.skybox?.destroy();
        this._scene.skybox = skybox;

        if (this._lighting) {
            const lighting = EnvLighting.generateLightingSource(source);
            const envAtlas = EnvLighting.generateAtlas(lighting);
            // The lighting source is an intermediate: the atlas is rendered from it and it is
            // not needed afterwards
            lighting.destroy();
            this._scene.envAtlas?.destroy();
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
        // Supersede any load already in flight - only the newest load may generate the skybox
        const generation = ++this._loadGeneration;
        this._detachLoadHandler();

        const appElement = await this.closestApp?.ready();

        // The element may have been removed, or another load started, while we waited
        if (generation !== this._loadGeneration) {
            return;
        }

        const app = appElement?.app;
        if (!appElement || !app) {
            return;
        }

        this._appElement = appElement;

        // Resolving the asset also starts its load when it is lazy and not yet loading
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        this._scene = app.scene;

        if (asset.loaded) {
            this._generateSkybox(asset);
        } else {
            // The generation is re-checked even though a superseded handler is detached: the
            // detach relies on how the engine's event emitter treats removal, while the check
            // holds on its own.
            this._loadHandle = asset.once('load', () => {
                this._loadHandle = null;
                if (generation !== this._loadGeneration) {
                    return;
                }
                this._generateSkybox(asset);
            });
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

export { SkyElement };
