import { Color } from 'playcanvas';

class RenderComponentElement extends HTMLElement {
    constructor() {
        super();

        this._type = 'asset';
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
    }

    get type() {
        return this._type;
    }

    set type(value) {
        this._type = value;
        if (this.renderComponent) {
            this.renderComponent.type = value;
        }
    }

    static get observedAttributes() {
        return ['type'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'type') {
            this.type = newValue;
        }
    }
}

export { RenderComponentElement };
