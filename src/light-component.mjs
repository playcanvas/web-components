import { Color } from 'playcanvas';

class LightComponentElement extends HTMLElement {
    constructor() {
        super();

        // Set default values (optional)
        this._color = [1, 1, 1]; // Default to white, for instance
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the camera component to the entity
            this.lightComponent = entityElement.entity.addComponent('light');

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
    }

    get color() {
        return this._color;
    }

    set color(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._color = value;
            if (this.lightComponent) {
                this.lightComponent.color = new Color(value);
            }
        }
    }

    static get observedAttributes() {
        return ['color'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'color') {
            this.color = newValue.split(',').map(Number);
        }
    }
}

export { LightComponentElement };
