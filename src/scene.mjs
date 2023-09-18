import { Color } from 'playcanvas';

class SceneElement extends HTMLElement {
    constructor() {
        super();

        // Default settings for fog and other attributes
        this._fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'
        this._fogColor = [1, 1, 1]; // default to white
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

    static get observedAttributes() {
        return ['fog', 'fog-color'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'fog':
                this.fog = newValue;
                break;
            case 'fog-color':
                this.fogColor = newValue.split(',').map(Number);
                break;
            // ... handle other attributes as well
        }
    }
}

export { SceneElement }
