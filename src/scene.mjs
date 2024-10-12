import { Color } from 'playcanvas';

class SceneElement extends HTMLElement {
    _fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'
    _fogColor = [1, 1, 1];
    _fogDensity = 0;
    _fogStart = 0;
    _fogEnd = 1000;

    connectedCallback() {
        const appElement = this.closest('pc-app');
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
    set fog(value) {
        this._fog = value;
        this.updateSceneSettings();
    }

    get fog() {
        return this._fog;
    }

    // Fog Color
    set fogColor(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._fogColor = value;
            this.updateSceneSettings();
        }
    }

    get fogColor() {
        return this._fogColor;
    }

    // Fog Density
    set fogDensity(value) {
        this._fogDensity = parseFloat(value);
        this.updateSceneSettings();
    }

    get fogDensity() {
        return this._fogDensity;
    }

    // Fog Start
    set fogStart(value) {
        this._fogStart = parseFloat(value);
        this.updateSceneSettings();
    }

    get fogStart() {
        return this._fogStart;
    }

    // Fog End
    set fogEnd(value) {
        this._fogEnd = parseFloat(value);
        this.updateSceneSettings();
    }

    get fogEnd() {
        return this._fogEnd;
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

export { SceneElement };
