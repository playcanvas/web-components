import type { AppBase, Scene } from 'playcanvas';
import { Color, Vec3 } from 'playcanvas';

import { AsyncElement } from './async-element';
import { parseBool, parseColor, parseEnum, parseNumber, parseVec3 } from './parse';
import { ListenerRegistry } from './pointer-events';

/**
 * The SceneElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scene/ | `<pc-scene>`} elements.
 * The SceneElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The scene element is the ancestor of every entity element, so the pointer events `<pc-app>`
 * dispatches on entities bubble through it, and it receives its own `pointerenter` and
 * `pointerleave` as the pointer moves onto and off its entities as a whole. A listener here is a
 * delegated listener for the whole scene: read `event.target` to find the entity element hit.
 *
 * @elementSummary The `<pc-scene>` element holds the entity hierarchy the application renders,
 * along with scene-wide fog, exposure, Gaussian splat, clustered lighting and gravity settings.
 * Must be a direct child of `<pc-app>`.
 *
 * @category Application
 */
class SceneElement extends AsyncElement {
    /**
     * The exposure of the scene.
     */
    private _exposure = 1;

    /**
     * The fog type of the scene.
     */
    private _fog: 'none' | 'linear' | 'exp' | 'exp2' = 'none';

    /**
     * The color of the fog.
     */
    private _fogColor = new Color(0, 0, 0);

    /**
     * The density of the fog.
     */
    private _fogDensity = 0;

    /**
     * The start distance of the fog.
     */
    private _fogStart = 1;

    /**
     * The end distance of the fog.
     */
    private _fogEnd = 1000;

    /**
     * The number of Gaussian splats rendered across the scene.
     */
    private _gsplatSplatBudget = 1_000_000;

    /**
     * How the Gaussian splat budget is used.
     */
    private _gsplatSplatBudgetMode: 'target' | 'limit' = 'target';

    /**
     * Whether Gaussian splats are fogged.
     */
    private _gsplatUseFog = true;

    /**
     * Whether Gaussian splats are tonemapped and exposed.
     */
    private _gsplatUseTonemap = true;

    /**
     * The gravity of the scene.
     */
    private _gravity = new Vec3(0, -9.81, 0);

    /**
     * The maximum number of lights clustered lighting uses in a frame.
     */
    private _lightingMaxLights = 255;

    private _scene: Scene | null = null;

    /**
     * The pointer listeners registered on the element. The scene is the ancestor of every
     * entity element, so a listener here is a delegated listener for all of them, and the
     * containing `<pc-app>` reads these to decide when to pick.
     * @internal
     */
    readonly _pointerListeners = new ListenerRegistry(this);

    /**
     * The PlayCanvas scene instance. `null` until the containing application has been created —
     * await {@link whenReady} or the element's `ready()` promise before accessing it.
     * @returns The scene instance, or `null`.
     */
    get scene(): Scene | null {
        return this._scene;
    }

    /**
     * Registers a listener exactly as {@link EventTarget.addEventListener} does, through the
     * pointer bookkeeping that records it. Internal so that the published typings keep the DOM's
     * own typed signatures.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The listener options.
     * @internal
     */
    addEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | AddEventListenerOptions
    ): void;
    /** @internal */
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void;
    /** @internal */
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ) {
        this._pointerListeners.add(type, listener, options, () => super.addEventListener(type, listener, options));
    }

    /**
     * Removes a listener exactly as {@link EventTarget.removeEventListener} does, and forgets it
     * for the pointer bookkeeping.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The listener options.
     * @internal
     */
    removeEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | EventListenerOptions
    ): void;
    /** @internal */
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
    ): void;
    /** @internal */
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
    ) {
        super.removeEventListener(type, listener, options);
        this._pointerListeners.remove(type, listener, options);
    }

    async connectedCallback() {
        const appElement = this.closestApp;
        if (!appElement) {
            console.warn('pc-scene must be a descendant of pc-app - scene settings not applied');
            return;
        }

        // A scene present when the application boots is attached by the boot sweep, before
        // app.start() runs every script's initialize(). One connected once the application exists -
        // inserted at runtime - attaches here, synchronously: the entity elements below it connect
        // after it, in tree order, so its settings are in place before their scripts initialize.
        const app = appElement.app;
        if (app) {
            this._attach(app);
        }

        await appElement.ready();

        // The element may have been removed or re-parented while waiting for the app. Matches the
        // guard in AssetElement and MaterialElement, but compares closestApp rather than
        // parentElement because pc-scene resolves its app by ancestor rather than direct child.
        // Readiness belongs to the app the element is attached to now, and a re-insertion runs a
        // connectedCallback of its own that announces it.
        if (!this.isConnected || this.closestApp !== appElement) {
            return;
        }

        // The scene is gone if the tree was torn down while we awaited readiness - the application
        // a re-inserted tree boots attaches it afresh. There is nothing the author can act on, so
        // this stays silent.
        if (!this._scene) {
            return;
        }

        this._onReady();
    }

    disconnectedCallback() {
        // The scene belongs to the application, and removing this element - or the <pc-app>
        // above it, which disconnects first - parts the two. Re-arm readiness so a re-inserted
        // element announces the scene it acquires then, not the one it lost here.
        this._scene = null;
        this._resetReady();
    }

    /**
     * Attaches the element to the application's scene and applies every setting it holds. Called
     * by the containing `<pc-app>` element during its boot sweep, before the application starts,
     * and on connection for elements inserted once the application exists.
     *
     * @param app - The application whose scene the element configures.
     * @internal
     */
    _attach(app: AppBase) {
        this._scene = app.scene;
        this._updateSceneSettings();
    }

    private _updateSceneSettings() {
        if (this._scene) {
            this._scene.exposure = this._exposure;

            this._scene.fog.type = this._fog;
            this._scene.fog.color = this._fogColor;
            this._scene.fog.density = this._fogDensity;
            this._scene.fog.start = this._fogStart;
            this._scene.fog.end = this._fogEnd;

            this._scene.gsplat.splatBudget = this._gsplatSplatBudget;
            this._scene.gsplat.splatBudgetMode = this._gsplatSplatBudgetMode;
            this._scene.gsplat.useFog = this._gsplatUseFog;
            this._scene.gsplat.useTonemap = this._gsplatUseTonemap;

            this._scene.lighting.maxLights = this._lightingMaxLights;

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
     * Sets the exposure of the scene, which tweaks the overall brightness of the rendered image.
     * Ignored if the scene is using physical units. Defaults to 1.
     * @param value - The exposure.
     */
    set exposure(value: number) {
        this._exposure = value;
        if (this.scene) {
            this.scene.exposure = value;
        }
    }

    /**
     * Gets the exposure of the scene.
     * @returns The exposure.
     */
    get exposure() {
        return this._exposure;
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
     * Sets the fog color of the scene. Defaults to black (`0 0 0`).
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
     * Sets the fog density of the scene. Defaults to 0.
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
     * Sets the fog start distance of the scene. Defaults to 1.
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
     * Sets the fog end distance of the scene. Defaults to 1000.
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
     * Sets the number of splats rendered across all Gaussian splats in the scene, used as
     * {@link gsplatSplatBudgetMode} directs. The Engine distributes this budget globally between
     * streamed splat assets. 0 means no budget. Defaults to 1,000,000.
     * @param value - The scene-wide splat budget.
     */
    set gsplatSplatBudget(value: number) {
        this._gsplatSplatBudget = value;
        if (this.scene) {
            this.scene.gsplat.splatBudget = value;
        }
    }

    /**
     * Gets the number of splats rendered across the scene.
     * @returns The scene-wide splat budget.
     */
    get gsplatSplatBudget() {
        return this._gsplatSplatBudget;
    }

    /**
     * Sets how the splat budget is used for streamed Gaussian splats. `target` raises detail
     * until the budget is used up, wherever the camera is; the LOD distances of each `<pc-gsplat>`
     * only shape how detail falls off and divides between splats. `limit` lets those distances
     * decide the detail and only lowers it when they would exceed the budget, so a distant splat
     * uses just the few splats its distance calls for. Defaults to `target`.
     * @param value - The Gaussian splat budget mode.
     */
    set gsplatSplatBudgetMode(value: 'target' | 'limit') {
        this._gsplatSplatBudgetMode = value;
        if (this.scene) {
            this.scene.gsplat.splatBudgetMode = value;
        }
    }

    /**
     * Gets how the splat budget is used for streamed Gaussian splats.
     * @returns The Gaussian splat budget mode.
     */
    get gsplatSplatBudgetMode() {
        return this._gsplatSplatBudgetMode;
    }

    /**
     * Sets whether the scene fog applies to Gaussian splats. Defaults to `true`.
     * @param value - Whether Gaussian splats are fogged.
     */
    set gsplatUseFog(value: boolean) {
        this._gsplatUseFog = value;
        if (this.scene) {
            this.scene.gsplat.useFog = value;
        }
    }

    /**
     * Gets whether the scene fog applies to Gaussian splats.
     * @returns Whether Gaussian splats are fogged.
     */
    get gsplatUseFog() {
        return this._gsplatUseFog;
    }

    /**
     * Sets whether the camera's tonemapping and the scene's exposure apply to Gaussian splats.
     * When `false`, splats render with their stored colors, which suits captured scenes that are
     * already display-ready. Fog still applies. Defaults to `true`.
     * @param value - Whether Gaussian splats are tonemapped.
     */
    set gsplatUseTonemap(value: boolean) {
        this._gsplatUseTonemap = value;
        if (this.scene) {
            this.scene.gsplat.useTonemap = value;
        }
    }

    /**
     * Gets whether the camera's tonemapping and the scene's exposure apply to Gaussian splats.
     * @returns Whether Gaussian splats are tonemapped.
     */
    get gsplatUseTonemap() {
        return this._gsplatUseTonemap;
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

    /**
     * Sets the maximum number of lights clustered lighting uses in a frame, from 1 to 65535;
     * lights over the limit are ignored with a warning. Values above 255 double the memory of
     * the light grid. Defaults to 255.
     * @param value - The maximum number of lights.
     */
    set lightingMaxLights(value: number) {
        this._lightingMaxLights = value;
        if (this.scene) {
            this.scene.lighting.maxLights = value;
        }
    }

    /**
     * Gets the maximum number of lights clustered lighting uses in a frame.
     * @returns The maximum number of lights.
     */
    get lightingMaxLights() {
        return this._lightingMaxLights;
    }

    static get observedAttributes() {
        return [
            'exposure',
            'fog',
            'fog-color',
            'fog-density',
            'fog-start',
            'fog-end',
            'gsplat-splat-budget',
            'gsplat-splat-budget-mode',
            'gsplat-use-fog',
            'gsplat-use-tonemap',
            'gravity',
            'lighting-max-lights'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'exposure':
                this.exposure = parseNumber(newValue, 1, name);
                break;
            case 'fog':
                this.fog = parseEnum(newValue, ['none', 'linear', 'exp', 'exp2'], 'none', name);
                break;
            case 'fog-color':
                this.fogColor = parseColor(newValue, Color.BLACK, name);
                break;
            case 'fog-density':
                this.fogDensity = parseNumber(newValue, 0, name);
                break;
            case 'fog-start':
                this.fogStart = parseNumber(newValue, 1, name);
                break;
            case 'fog-end':
                this.fogEnd = parseNumber(newValue, 1000, name);
                break;
            case 'gsplat-splat-budget':
                this.gsplatSplatBudget = parseNumber(newValue, 1_000_000, name);
                break;
            case 'gsplat-splat-budget-mode':
                this.gsplatSplatBudgetMode = parseEnum(newValue, ['target', 'limit'], 'target', name);
                break;
            case 'gsplat-use-fog':
                this.gsplatUseFog = parseBool(newValue, true);
                break;
            case 'gsplat-use-tonemap':
                this.gsplatUseTonemap = parseBool(newValue, true);
                break;
            case 'gravity':
                this.gravity = parseVec3(newValue, new Vec3(0, -9.81, 0), name);
                break;
            case 'lighting-max-lights':
                this.lightingMaxLights = parseNumber(newValue, 255, name);
                break;
            // ... handle other attributes as well
        }
    }
}

customElements.define('pc-scene', SceneElement);

export { SceneElement };
