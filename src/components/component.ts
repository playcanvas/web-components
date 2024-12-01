import { Component } from 'playcanvas';

import { AsyncElement } from '../async-element';

/**
 * Represents a component in the PlayCanvas engine.
 *
 * @category Components
 */
class ComponentElement extends AsyncElement {
    private _componentName: string;

    private _enabled = true;

    private _component: Component | null = null;

    /**
     * Creates a new ComponentElement instance.
     *
     * @param componentName - The name of the component.
     * @ignore
     */
    constructor(componentName: string) {
        super();

        this._componentName = componentName;
    }

    // Method to be overridden by subclasses to provide initial component data
    getInitialComponentData() {
        return {};
    }

    async addComponent() {
        const entityElement = this.closestEntity;
        if (entityElement) {
            await entityElement.ready();
            // Add the component to the entity
            const data = this.getInitialComponentData();
            this._component = entityElement.entity!.addComponent(this._componentName, data);
        }
    }

    initComponent() {}

    async connectedCallback() {
        await this.closestApp?.ready();
        await this.addComponent();
        this.initComponent();
        this._onReady();
    }

    disconnectedCallback() {
        // Remove the component when the element is disconnected
        if (this.component && this.component.entity) {
            this._component!.entity.removeComponent(this._componentName);
            this._component = null;
        }
    }

    get component(): Component | null {
        return this._component;
    }

    /**
     * Sets the enabled state of the component.
     * @param value - The enabled state of the component.
     */
    set enabled(value: boolean) {
        this._enabled = value;
        if (this.component) {
            this.component.enabled = value;
        }
    }

    /**
     * Gets the enabled state of the component.
     * @returns The enabled state of the component.
     */
    get enabled() {
        return this._enabled;
    }

    static get observedAttributes() {
        return ['enabled'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
        }
    }
}

export { ComponentElement };
