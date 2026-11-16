import type { Asset, Scene, Texture } from 'playcanvas';
import { EnvLighting, Quat, Vec3 } from 'playcanvas';

import type { AppElement } from './app';
import { AssetBinding, useAsset } from './asset-binding';
import { AsyncElement } from './async-element';
import { applyAttribute, attr, attributeNames, defineAttributes } from './attributes';
import { parseBool, parseEnum, parseVec3 } from './parse';

/**
 * The SkyElement interface provides properties and methods for manipulating
 * `<pc-sky>` elements. The SkyElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 *
 * @elementSummary The `<pc-sky>` element renders a skybox from a texture asset, projected as an
 * infinite background, a box or a dome, and optionally lights the scene from it. Must be a direct
 * child of `<pc-scene>`.
 *
 * @category Application
 */
class SkyElement extends AsyncElement {
    /**
     * The intensity of the skybox.
     */
    declare intensity: number;

    /**
     * The mip level of the skybox. 0 is the sharpest: raising it selects a blurrier mip, which is
     * how a skybox is softened without blurring the texture itself.
     */
    declare mipLevel: number;

    /**
     * The Euler rotation of the skybox.
     */
    declare rotation: Vec3;

    private _asset = '';

    private _center = new Vec3(0, 0.01, 0);

    private _enabled = true;

    private _lighting = false;

    private _scale = new Vec3(100, 100, 100);

    private _type: 'box' | 'dome' | 'infinite' = 'infinite';

    /**
     * The scene the sky belongs to, while the element is attached to one. Not private, because
     * the schema names it as what the skybox attributes write through to.
     * @internal
     */
    _scene: Scene | null = null;

    private _appElement: AppElement | null = null;

    /**
     * Incremented on every new load and on disconnect, and captured by a load when it starts. A
     * load that resumes from an await abandons itself if the value has moved on, so a superseded
     * load cannot generate a skybox for a scene it no longer configures. The asset subscription
     * itself is guarded by the binding below.
     */
    private _loadGeneration = 0;

    /**
     * Watches the current texture asset while it loads. Starting a new load or disconnecting
     * cancels it, so a superseded texture can never generate the skybox.
     */
    private _binding = new AssetBinding(this);

    connectedCallback() {
        this._loadSkybox();
        this._onReady();
    }

    disconnectedCallback() {
        this._loadGeneration++;
        this._binding.cancel();
        this._unloadSkybox();
        this._appElement = null;
        this._resetReady();
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

        // Whether it shows first: a hidden sky then takes its type without building a mesh
        this._scene.sky.enabled = this._enabled;
        this._scene.sky.type = this._type;
        this._scene.sky.node.setLocalScale(this._scale);
        this._scene.sky.center = this._center;
        this._scene.skyboxIntensity = this.intensity;
        this._scene.skyboxMip = this.mipLevel;
        this._scene.skyboxRotation = new Quat().setFromEulerAngles(this.rotation);
    }

    private async _loadSkybox() {
        // Supersede any load already in flight - only the newest load may generate the skybox
        const generation = ++this._loadGeneration;
        this._binding.cancel();

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

        // The scene is only adopted once the reference resolves: an unresolved id must leave the
        // scene untouched, or this element's teardown would destroy a skybox it never created.
        // The bind below repeats the resolution, which useAsset documents as free - it cannot
        // happen after the bind, because a loaded asset delivers before bind returns and
        // _generateSkybox needs the scene by then.
        if (!useAsset(this._asset, this)) {
            return;
        }

        this._scene = app.scene;

        this._binding.bind(this._asset, {
            load: (asset) => this._generateSkybox(asset)
        });
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
        scene.skybox = null;
        scene.envAtlas?.destroy();
        scene.envAtlas = null;

        // A hidden sky is this element's doing too: without the element the scene's sky is the
        // engine's again, there for a skybox assigned by other means
        scene.sky.enabled = true;
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
     * Sets whether the skybox is rendered. A skybox that is not rendered still lights the scene
     * when `lighting` is set, which is how a scene is lit by an environment it does not show.
     * Defaults to true.
     * @param value - Whether the skybox is rendered.
     */
    set enabled(value: boolean) {
        this._enabled = value;
        if (this._scene) {
            this._scene.sky.enabled = value;
        }
    }

    /**
     * Gets whether the skybox is rendered, which does not affect the lighting it gives the scene.
     * @returns Whether the skybox is rendered.
     */
    get enabled() {
        return this._enabled;
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
     * Sets the type of the skybox: `infinite` for a background at infinity, or `box` or `dome`
     * to project it onto a mesh the scene sits in. Defaults to `infinite`.
     * @param value - The type.
     */
    set type(value: 'box' | 'dome' | 'infinite') {
        this._type = value;
        if (this._scene) {
            this._scene.sky.type = value;
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
        return [...attributeNames(this), 'asset', 'center', 'enabled', 'lighting', 'scale', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        applyAttribute(this, name, newValue);

        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
            case 'center':
                this.center = parseVec3(newValue, new Vec3(0, 0.01, 0), name);
                break;
            case 'enabled':
                this.enabled = parseBool(newValue, true);
                break;
            case 'lighting':
                this.lighting = parseBool(newValue, false);
                break;
            case 'scale':
                this.scale = parseVec3(newValue, new Vec3(100, 100, 100), name);
                break;
            case 'type':
                this.type = parseEnum(newValue, ['box', 'dome', 'infinite'], 'infinite', name);
                break;
        }
    }
}

defineAttributes(SkyElement, '_scene', {
    intensity: attr.number(1).as('skyboxIntensity'),
    mipLevel: attr.number(0).as('skyboxMip'),
    rotation: attr
        .vec3(Vec3.ZERO)
        .to((value) => new Quat().setFromEulerAngles(value))
        .as('skyboxRotation')
});

globalThis.customElements?.define('pc-sky', SkyElement);

export { SkyElement };
