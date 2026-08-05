import { Component } from 'playcanvas';

import { AppElement } from '../app';
import { AsyncElement } from '../async-element';
import { parseBool } from '../parse';

/**
 * Represents a component in the PlayCanvas engine.
 *
 * @category Components
 */
class ComponentElement extends AsyncElement {
    private _componentName: string;

    private _enabled = true;

    private _component: Component | null = null;

    private _appElement: AppElement | null = null;

    /**
     * Incremented on every connect and disconnect. connectedCallback captures the value on entry
     * and abandons itself wherever it resumes from an await if the value has moved on — so a
     * callback whose element was removed cannot act on a torn-down tree, and one whose element
     * was removed and re-inserted (which runs a callback of its own) cannot add the component a
     * second time.
     */
    private _connectionGeneration = 0;

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
        const generation = this._connectionGeneration;

        const entityElement = this.closestEntity;
        if (!entityElement) {
            // A component can only exist on an entity, so an element placed outside one is inert.
            // It still becomes ready (with a null `component`), so warn rather than fail silently
            const label = this.id ? ` '${this.id}'` : '';
            console.warn(`${this.tagName.toLowerCase()}${label} must be a descendant of pc-entity - component not added`);
            return;
        }

        await entityElement.ready();

        // The element may have been removed, or removed and re-inserted, while the entity became
        // ready — the component belongs to the connection that owns the current generation.
        if (generation !== this._connectionGeneration) {
            return;
        }

        // Add the component to the entity
        const data = this.getInitialComponentData();
        this._component = entityElement.entity!.addComponent(this._componentName, data);
    }

    initComponent() {}

    async connectedCallback() {
        const generation = ++this._connectionGeneration;

        this._appElement = this.closestApp ?? null;
        await this._appElement?.ready();

        // The element may have been removed, or removed and re-inserted, while the application
        // became ready. A re-insertion runs a connectedCallback of its own, so a stale resume
        // must not add the component alongside it.
        if (generation !== this._connectionGeneration) {
            return;
        }

        await this.addComponent();

        if (generation !== this._connectionGeneration) {
            return;
        }

        this.initComponent();
        this._onReady();
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback still suspended on an await
        this._connectionGeneration++;

        // Remove the component when the element is disconnected. Skip this when the owning
        // application has already been destroyed — removing a <pc-app> disconnects it before
        // its children, taking the component systems with it.
        if (this._appElement?.app && this._component?.entity) {
            this._component.entity.removeComponent(this._componentName);
        }
        this._component = null;
        this._appElement = null;
        this._resetReady();
    }

    /**
     * The PlayCanvas component instance. `null` until the element is ready, and also for an
     * element that is not a descendant of a `<pc-entity>` — await {@link whenReady} or the
     * element's `ready()` promise before accessing it.
     * @returns The component instance, or `null`.
     */
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

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'enabled':
                this.enabled = parseBool(newValue, true);
                break;
        }
    }
}

export { ComponentElement };
