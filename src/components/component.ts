import { Component } from 'playcanvas';

class ComponentElement extends HTMLElement {
    componentName: string;

    _component: Component | null = null;

    constructor(componentName: string) {
        super();

        this.componentName = componentName;
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity');

        if (entityElement && entityElement.entity) {
            // Add the component to the entity
            this._component = entityElement.entity.addComponent(
                this.componentName,
                this.getInitialComponentData()
            );

            // Dispatch an event indicating the component is ready
            this.dispatchEvent(
                new CustomEvent('componentReady', {
                    bubbles: true,
                    composed: true
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
            this._component!.entity.removeComponent(this.componentName);
            this._component = null;
        }
    }

    // Method to be overridden by subclasses to provide initial component data
    getInitialComponentData() {
        return {};
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    }

    get component(): Component | null {
        return this._component;
    }
}

export { ComponentElement };
