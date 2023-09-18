import { Color } from 'playcanvas';

class RenderComponentElement extends HTMLElement {
    constructor() {
        super();

        this._type = 'asset';
        this._castShadows = false;
        this._receiveShadows = false;
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the camera component to the entity
            this.renderComponent = entityElement.entity.addComponent('render');

            // Notify the outer world (or parent elements) that the camera component is ready
            this.dispatchEvent(new CustomEvent('componentReady', {
                bubbles: true,
                composed: true
            }));
        } else {
            console.error('pc-render-component should be a child of pc-entity');
        }

        // Check if the clear-color attribute is set on the element
        const typeAttr = this.getAttribute('type');
        if (typeAttr && this.renderComponent) {
            this.renderComponent.type = typeAttr;
        }

        // Initialize the cast-shadows and receive-shadows properties
        if (this.renderComponent) {
            const castShadowsAttr = this.hasAttribute('cast-shadows');
            const receiveShadowsAttr = this.hasAttribute('receive-shadows');

            if (castShadowsAttr) this.castShadows = true;
            if (receiveShadowsAttr) this.receiveShadows = true;
        }
    }

    // Type
    get type() {
        return this._type;
    }

    set type(value) {
        this._type = value;
        if (this.renderComponent) {
            this.renderComponent.type = value;
        }
    }

    // Cast Shadows
    get castShadows() {
        return this._castShadows;
    }

    set castShadows(value) {
        this._castShadows = Boolean(value);
        if (this.renderComponent) {
            this.renderComponent.castShadows = this._castShadows;
        }
    }

    // Receive Shadows
    get receiveShadows() {
        return this._receiveShadows;
    }

    set receiveShadows(value) {
        this._receiveShadows = Boolean(value);
        if (this.renderComponent) {
            this.renderComponent.receiveShadows = this._receiveShadows;
        }
    }

    static get observedAttributes() {
        return ['type', 'cast-shadows', 'receive-shadows'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch(name) {
            case 'type':
                this.type = newValue;
                break;
            case 'cast-shadows':
                this.castShadows = newValue !== null;  // Existence implies true
                break;
            case 'receive-shadows':
                this.receiveShadows = newValue !== null;  // Existence implies true
                break;
        }
    }
}

export { RenderComponentElement };