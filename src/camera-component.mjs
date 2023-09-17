import { Color } from 'playcanvas';

class CameraComponentElement extends HTMLElement {
    constructor() {
        super();

        // Set default values (optional)
        this._clearColor = [1, 1, 1, 1]; // Default to white, for instance
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the camera component to the entity
            entityElement.entity.setPosition(0, 0, 5);
            this.cameraComponent = entityElement.entity.addComponent('camera');

            // You can also check for attributes on this element to set properties
            // of the camera component. For example:
            // const fov = this.getAttribute('fov');
            // if (fov) this.cameraComponent.fov = parseFloat(fov);

            // Notify the outer world (or parent elements) that the camera component is ready
            this.dispatchEvent(new CustomEvent('componentReady', {
                bubbles: true,
                composed: true
            }));
        } else {
            console.error('pc-camera-component should be a child of pc-entity');
        }

        // Check if the clear-color attribute is set on the element
        const clearColorAttr = this.getAttribute('clear-color');
        if (clearColorAttr) {
            this.clearColor = clearColorAttr.split(',').map(Number);
        }

        // If the camera component is available, set its clear color
        if (this.cameraComponent) {
            this.cameraComponent.clearColor = new Color(this._clearColor);
        }
    }

    get clearColor() {
        return this._clearColor;
    }

    set clearColor(value) {
        if (Array.isArray(value) && value.length === 4) {
            this._clearColor = value;
            if (this.cameraComponent) {
                this.cameraComponent.clearColor = new Color(value);
            }
        }
    }

    static get observedAttributes() {
        return ['clear-color'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'clear-color') {
            this.clearColor = newValue.split(',').map(Number);
        }
    }
}

export { CameraComponentElement };
