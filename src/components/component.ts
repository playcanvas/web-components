import { Component } from 'playcanvas';

import { EntityElement } from '../entity';

/**
 * Represents a component in the PlayCanvas engine.
 *
 * @category Components
 */
class ComponentElement extends HTMLElement {
    private _componentName: string;

    private _enabled = true;

    private _component: Component | null = null;

    constructor(componentName: string) {
        super();

        this._componentName = componentName;
    }

    connectedCallback() {
        // Access the parent pc-entity's 'entity' property
        const entityElement = this.closest('pc-entity') as EntityElement | null;

        if (entityElement && entityElement.entity) {
            // Add the component to the entity
            this._component = entityElement.entity.addComponent(
                this._componentName,
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
            this._component!.entity.removeComponent(this._componentName);
            this._component = null;
        }
    }

    // Method to be overridden by subclasses to provide initial component data
    getInitialComponentData() {
        return {};
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
        }
    }

    static get observedAttributes() {
        return ['enabled'];
    }

    get component(): Component | null {
        return this._component;
    }

    set enabled(value: boolean) {
        this._enabled = value;
        if (this.component) {
            this.component.enabled = value;
        }
    }

    get enabled() {
        return this._enabled;
    }
}

export { ComponentElement };
