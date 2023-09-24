import { Color } from 'playcanvas';

class LightComponentElement extends HTMLElement {
    constructor() {
        super();

        // Set default values (optional)
        this._castShadows = false;
        this._color = [1, 1, 1]; // Default to white, for instance
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the camera component to the entity
            this.lightComponent = entityElement.entity.addComponent('light', {
                shadowBias: 0.5
            });

            // Notify the outer world (or parent elements) that the camera component is ready
            this.dispatchEvent(new CustomEvent('componentReady', {
                bubbles: true,
                composed: true
            }));
        } else {
            console.error('pc-light-component should be a child of pc-entity');
        }

        // Check if the clear-color attribute is set on the element
        const colorAttr = this.getAttribute('clear-color');
        if (colorAttr) {
            this.color = colorAttr.split(',').map(Number);
        }

        // If the light component is available, set its clear color
        if (this.lightComponent) {
            this.lightComponent.color = new Color(this._color);
        }

        // Initialize the cast-shadows property
        if (this.lightComponent) {
            const castShadowsAttr = this.hasAttribute('cast-shadows');
            this.castShadows = castShadowsAttr;
        }
    }

    set color(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._color = value;
            if (this.lightComponent) {
                this.lightComponent.color = new Color(value);
            }
        }
    }

    get color() {
        return this._color;
    }

    set castShadows(value) {
        this._castShadows = Boolean(value);
        if (this.lightComponent) {
            this.lightComponent.castShadows = this._castShadows;
        }
    }

    get castShadows() {
        return this._castShadows;
    }

    static get observedAttributes() {
        return ['color', 'cast-shadows'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'color':
                this.color = newValue.split(',').map(Number);
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== null;  // Existence implies true
                break;
        }
    }
}

export { LightComponentElement };
