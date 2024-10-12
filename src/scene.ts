import { Color, Scene } from 'playcanvas';
import { AppElement } from './app';
import { parseColor } from './utils';

class SceneElement extends HTMLElement {
    _fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'

    _fogColor = new Color(1, 1, 1);

    _fogDensity = 0;

    _fogStart = 0;

    _fogEnd = 1000;

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
            this.scene.fog = this._fog;
            this.scene.fogColor = new Color(...this._fogColor);
            this.scene.fogDensity = this._fogDensity;
            this.scene.fogStart = this._fogStart;
            this.scene.fogEnd = this._fogEnd;
            // ... set other properties on the scene as well
        }
    }

    set fog(value) {
        this._fog = value;
        this.updateSceneSettings();
    }

    get fog() {
        return this._fog;
    }

    set fogColor(value: Color) {
        this._fogColor = value;
        this.scene!.fogColor = this._fogColor;
    }

    get fogColor() {
        return this._fogColor;
    }

    set fogDensity(value: number) {
        this._fogDensity = value;
        this.scene!.fogDensity = this._fogDensity;
    }

    get fogDensity() {
        return this._fogDensity;
    }

    set fogStart(value: number) {
        this._fogStart = value;
        this.scene!.fogStart = this._fogStart;
    }

    get fogStart() {
        return this._fogStart;
    }

    set fogEnd(value: number) {
        this._fogEnd = value;
        this.scene!.fogEnd = this._fogEnd;
    }

    get fogEnd() {
        return this._fogEnd;
    }

    static get observedAttributes() {
        return ['fog', 'fog-color', 'fog-density', 'fog-start', 'fog-end'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
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
