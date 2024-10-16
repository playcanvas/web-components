import { Color, Scene } from 'playcanvas';

import { AppElement } from './app';
import { parseColor } from './utils';

/**
 * Represents a scene in the PlayCanvas engine.
 */
class SceneElement extends HTMLElement {
    /**
     * The fog type of the scene.
     */
    private _fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'

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
     * The PlayCanvas scene instance.
     */
    scene: Scene | null = null;

    connectedCallback() {
        const appElement = this.closest('pc-app') as AppElement | null;
        if (!appElement) {
            console.warn('pc-scene element must be a descendant of a pc-app element');
            return;
        }
        if (!appElement.app) {
            appElement.addEventListener('appInitialized', () => {
                this.scene = appElement.app!.scene;
                this.updateSceneSettings();
            });
        } else {
            this.scene = appElement.app.scene;
            this.updateSceneSettings();
        }
    }

    updateSceneSettings() {
        if (this.scene) {
            this.scene.rendering.fog = this._fog;
            this.scene.rendering.fogColor = this._fogColor;
            this.scene.rendering.fogDensity = this._fogDensity;
            this.scene.rendering.fogStart = this._fogStart;
            this.scene.rendering.fogEnd = this._fogEnd;
            // ... set other properties on the scene as well
        }
    }

    /**
     * Sets the fog type of the scene.
     * @param value - The fog type.
     */
    set fog(value) {
        this._fog = value;
        this.scene!.rendering.fog = value;
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
        this.scene!.rendering.fogColor = value;
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
        this.scene!.rendering.fogDensity = value;
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
        this.scene!.rendering.fogStart = value;
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
        this.scene!.rendering.fogEnd = value;
    }

    /**
     * Gets the fog end distance of the scene.
     * @returns The fog end distance.
     */
    get fogEnd() {
        return this._fogEnd;
    }

    static get observedAttributes() {
        return ['fog', 'fog-color', 'fog-density', 'fog-start', 'fog-end'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'fog':
                this.fog = newValue;
                break;
            case 'fog-color':
                this.fogColor = parseColor(newValue);
                break;
            case 'fog-density':
                this.fogDensity = parseFloat(newValue);
                break;
            case 'fog-start':
                this.fogStart = parseFloat(newValue);
                break;
            case 'fog-end':
                this.fogEnd = parseFloat(newValue);
                break;
            // ... handle other attributes as well
        }
    }
}

customElements.define('pc-scene', SceneElement);

export { SceneElement };
