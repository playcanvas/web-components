import { Color } from 'playcanvas';

class SceneElement extends HTMLElement {
    constructor() {
        super();

        // Default settings for fog and other attributes
        this._fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'
        this._fogColor = [1, 1, 1];
        this._fogDensity = 0;
        this._fogStart = 0;
        this._fogEnd = 1000;
    }

    connectedCallback() {
        const appElement = this.closest('pc-application');
        if (!appElement.app) {
            appElement.addEventListener('appInitialized', () => {
                this.scene = appElement.app.scene;
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

    // Fog
    get fog() {
        return this._fog;
    }

    set fog(value) {
        this._fog = value;
        this.updateSceneSettings();
    }

    // Fog Color
    get fogColor() {
        return this._fogColor;
    }

    set fogColor(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._fogColor = value;
            this.updateSceneSettings();
        }
    }
    // Fog Density
    get fogDensity() {
        return this._fogDensity;
    }

    set fogDensity(value) {
        this._fogDensity = parseFloat(value);
        this.updateSceneSettings();
    }

    // Fog Start
    get fogStart() {
        return this._fogStart;
    }

    set fogStart(value) {
        this._fogStart = parseFloat(value);
        this.updateSceneSettings();
    }

    // Fog End
    get fogEnd() {
        return this._fogEnd;
    }

    set fogEnd(value) {
        this._fogEnd = parseFloat(value);
        this.updateSceneSettings();
    }

    static get observedAttributes() {
        return ['fog', 'fog-color', 'fog-density', 'fog-start', 'fog-end'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'fog':
                this.fog = newValue;
                break;
            case 'fog-color':
                this.fogColor = newValue.split(',').map(Number);
                break;
            case 'fog-density':
                this.fogDensity = newValue;
                break;
            case 'fog-start':
                this.fogStart = newValue;
                break;
            case 'fog-end':
                this.fogEnd = newValue;
                break;
            // ... handle other attributes as well
        }
    }
}

export { SceneElement }