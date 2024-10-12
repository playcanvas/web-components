class ComponentElement extends HTMLElement {
    constructor(componentName) {
        super();
        this.componentName = componentName;
        this.component = null;
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the component to the entity
            this.component = entityElement.entity.addComponent(
                this.componentName,
                this.getInitialComponentData()
            );

            // Dispatch an event indicating the component is ready
            this.dispatchEvent(
                new CustomEvent('componentReady', {
                    bubbles: true,
                    composed: true,
                })
            );
        } else {
            console.error(
                `${this.tagName.toLowerCase()} should be a child of pc-entity`
            );
        }
    }

    disconnectedCallback() {
        // Remove the component when the element is disconnected
        if (this.component && this.component.entity) {
            this.component.entity.removeComponent(this.componentName);
            this.component = null;
        }
    }

    // Method to be overridden by subclasses to provide initial component data
    getInitialComponentData() {
        return {};
    }

    // Common attribute handling can be placed here if needed
    attributeChangedCallback(name, oldValue, newValue) {
        // Subclasses can extend or override this method
    }
}

export { ComponentElement };
