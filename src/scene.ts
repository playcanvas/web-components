import type { Scene } from 'playcanvas';
import { Color, Vec3 } from 'playcanvas';

import { AsyncElement } from './async-element';
import { parseColor, parseEnum, parseNumber, parseVec3 } from './parse';

/**
 * The SceneElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scene/ | `<pc-scene>`} elements.
 * The SceneElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class SceneElement extends AsyncElement {
    /**
     * The fog type of the scene.
     */
    private _fog: 'none' | 'linear' | 'exp' | 'exp2' = 'none';

    /**
     * The color of the fog.
     */
    private _fogColor = new Color(1, 1, 1);

    /**
     * The density of the fog.
     */
    private _fogDensity = 0;

    /**
     * The start distance of the fog.
     */
    private _fogStart = 0;

    /**
     * The end distance of the fog.
     */
    private _fogEnd = 1000;

    /**
     * The gravity of the scene.
     */
    private _gravity = new Vec3(0, -9.81, 0);

    private _scene: Scene | null = null;

    /**
     * The PlayCanvas scene instance. `null` until the element is ready — await
     * {@link whenReady} or the element's `ready()` promise before accessing it.
     * @returns The scene instance, or `null`.
     */
    get scene(): Scene | null {
        return this._scene;
    }

    async connectedCallback() {
        const appElement = this.closestApp;
        if (!appElement) {
            console.warn('pc-scene must be a descendant of pc-app - scene settings not applied');
            return;
        }

        await appElement.ready();

        // The element may have been removed or re-parented while waiting for the app. Matches the
        // guard in AssetElement and MaterialElement, but compares closestApp rather than
        // parentElement because pc-scene resolves its app by ancestor rather than direct child.
        // Without this, a scene re-parented mid-await would take its Scene from the app it started
        // under while _applyGravity resolved the app it ended up under, splitting the two.
        if (!this.isConnected || this.closestApp !== appElement) {
            return;
        }

        // The application is gone if the tree was torn down while we awaited readiness. There is
        // nothing to configure and nothing the author can act on, so this stays silent.
        const app = appElement.app;
        if (!app) {
            return;
        }

        this._scene = app.scene;
        this._updateSceneSettings();

        this._onReady();
    }

    disconnectedCallback() {
        // The scene belongs to the application, and removing this element - or the <pc-app>
        // above it, which disconnects first - parts the two. Re-arm readiness so a re-inserted
        // element announces the scene it acquires then, not the one it lost here.
        this._scene = null;
        this._resetReady();
    }

    private _updateSceneSettings() {
        if (this._scene) {
            this._scene.fog.type = this._fog;
            this._scene.fog.color = this._fogColor;
            this._scene.fog.density = this._fogDensity;
            this._scene.fog.start = this._fogStart;
            this._scene.fog.end = this._fogEnd;

            this._applyGravity(this._gravity);
        }
    }

    /**
     * Applies gravity to the rigid body system. Resolved through `closestApp` rather than
     * `parentElement` so that a `<pc-scene>` nested inside a wrapper element behaves the same as
     * a direct child, matching how `connectedCallback` resolves the application.
     *
     * @param value - The gravity to apply.
     */
    private _applyGravity(value: Vec3) {
        this.closestApp?.app?.systems.rigidbody?.gravity.copy(value);
    }

    /**
     * Sets the fog type of the scene. Can be `none`, `linear`, `exp` or `exp2`. Defaults to
     * `none`.
     * @param value - The fog type.
     */
    set fog(value) {
        this._fog = value;
        if (this.scene) {
            this.scene.fog.type = value;
        }
    }

    /**
     * Gets the fog type of the scene.
     * @returns The fog type.
     */
    get fog() {
        return this._fog;
    }

    /**
     * Sets the fog color of the scene.
     * @param value - The fog color.
     */
    set fogColor(value: Color) {
        this._fogColor = value;
        if (this.scene) {
            this.scene.fog.color = value;
        }
    }

    /**
     * Gets the fog color of the scene.
     * @returns The fog color.
     */
    get fogColor() {
        return this._fogColor;
    }

    /**
     * Sets the fog density of the scene.
     * @param value - The fog density.
     */
    set fogDensity(value: number) {
        this._fogDensity = value;
        if (this.scene) {
            this.scene.fog.density = value;
        }
    }

    /**
     * Gets the fog density of the scene.
     * @returns The fog density.
     */
    get fogDensity() {
        return this._fogDensity;
    }

    /**
     * Sets the fog start distance of the scene.
     * @param value - The fog start distance.
     */
    set fogStart(value: number) {
        this._fogStart = value;
        if (this.scene) {
            this.scene.fog.start = value;
        }
    }

    /**
     * Gets the fog start distance of the scene.
     * @returns The fog start distance.
     */
    get fogStart() {
        return this._fogStart;
    }

    /**
     * Sets the fog end distance of the scene.
     * @param value - The fog end distance.
     */
    set fogEnd(value: number) {
        this._fogEnd = value;
        if (this.scene) {
            this.scene.fog.end = value;
        }
    }

    /**
     * Gets the fog end distance of the scene.
     * @returns The fog end distance.
     */
    get fogEnd() {
        return this._fogEnd;
    }

    /**
     * Sets the gravity of the scene.
     * @param value - The gravity.
     */
    set gravity(value: Vec3) {
        this._gravity = value;
        if (this._scene) {
            this._applyGravity(value);
        }
    }

    /**
     * Gets the gravity of the scene.
     * @returns The gravity.
     */
    get gravity() {
        return this._gravity;
    }

    static get observedAttributes() {
        return ['fog', 'fog-color', 'fog-density', 'fog-start', 'fog-end', 'gravity'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'fog':
                this.fog = parseEnum(newValue, ['none', 'linear', 'exp', 'exp2'], 'none', name);
                break;
            case 'fog-color':
                this.fogColor = parseColor(newValue, Color.WHITE, name);
                break;
            case 'fog-density':
                this.fogDensity = parseNumber(newValue, 0, name);
                break;
            case 'fog-start':
                this.fogStart = parseNumber(newValue, 0, name);
                break;
            case 'fog-end':
                this.fogEnd = parseNumber(newValue, 1000, name);
                break;
            case 'gravity':
                this.gravity = parseVec3(newValue, new Vec3(0, -9.81, 0), name);
                break;
            // ... handle other attributes as well
        }
    }
}

customElements.define('pc-scene', SceneElement);

export { SceneElement };
