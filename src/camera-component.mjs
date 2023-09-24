import { Color } from 'playcanvas';

class CameraComponentElement extends HTMLElement {
    constructor() {
        super();

        // Set default values (optional)
        this._clearColor = [1, 1, 1, 1]; // Default to white, for instance
        this._nearClip = 0.1; // Default value for near clip
        this._farClip = 1000; // Default value for far clip
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the camera component to the entity
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

        // Check for near-clip and far-clip attributes
        const nearClipAttr = this.getAttribute('near-clip');
        if (nearClipAttr) {
            this.nearClip = parseFloat(nearClipAttr);
        }

        const farClipAttr = this.getAttribute('far-clip');
        if (farClipAttr) {
            this.farClip = parseFloat(farClipAttr);
        }

        // Apply near-clip and far-clip to the camera component
        if (this.cameraComponent) {
            this.cameraComponent.nearClip = this._nearClip;
            this.cameraComponent.farClip = this._farClip;
        }
    }

    set clearColor(value) {
        if (Array.isArray(value) && value.length === 4) {
            this._clearColor = value;
            if (this.cameraComponent) {
                this.cameraComponent.clearColor = new Color(value);
            }
        }
    }

    get clearColor() {
        return this._clearColor;
    }

    set nearClip(value) {
        this._nearClip = value;
        if (this.cameraComponent) {
            this.cameraComponent.nearClip = value;
        }
    }

    get nearClip() {
        return this._nearClip;
    }

    set farClip(value) {
        this._farClip = value;
        if (this.cameraComponent) {
            this.cameraComponent.farClip = value;
        }
    }

    get farClip() {
        return this._farClip;
    }

    static get observedAttributes() {
        return ['clear-color', 'near-clip', 'far-clip'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'clear-color':
                this.clearColor = newValue.split(',').map(Number);
                break;
            case 'near-clip':
                this.nearClip = parseFloat(newValue);
                break;
            case 'far-clip':
                this.farClip = parseFloat(newValue);
                break;
        }
    }
}

export { CameraComponentElement };
