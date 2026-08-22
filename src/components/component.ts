import type { Component } from 'playcanvas';

import type { AppElement } from '../app';
import { AsyncElement } from '../async-element';
import type { EntityBaseElement } from '../entity-base';
import type { PropertyTable } from '../properties';
import { applyAttribute, attributeNames, booleanProperty, defineProperties } from '../properties';

const componentProperties = defineProperties({
    enabled: booleanProperty(true)
});

/**
 * Represents a component in the PlayCanvas engine.
 *
 * @category Components
 */
class ComponentElement extends AsyncElement {
    private _componentName: string;

    private _enabled = componentProperties.enabled.initial();

    private _component: Component | null = null;

    private _appElement: AppElement | null = null;

    /**
     * The element hosting this component, held so the host's readiness cycles can be observed
     * even after `closestEntity` would no longer resolve (during teardown).
     */
    private _hostElement: EntityBaseElement | null = null;

    /**
     * The listener re-applying this component when the host's readiness cycles. Held for
     * removal on disconnect.
     */
    private _hostReadyListener: EventListener | null = null;

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

    /**
     * Returns the data the component is created with. Overridden by subclasses to supply the
     * initial values of their cached properties.
     *
     * @returns The initial component data.
     */
    protected getInitialComponentData() {
        return {};
    }

    /**
     * Creates the component on the host's current entity, removing it first from a previous
     * entity that is still alive (a retargeted `<pc-node>` moves its decorations with it). When
     * the entity already has a component of this type — a glTF node arriving with its authored
     * `render` component, say — warns and leaves `component` null. The element-level warning is
     * load-bearing: the engine's own duplicate-addComponent warning is Debug-stripped from
     * production builds, which would otherwise leave a silent null.
     */
    private _applyComponent() {
        const entity = this._hostElement?.entity ?? null;
        if (this._component && this._component.entity === entity) {
            return;
        }

        // A retarget leaves the previous component on a still-live entity - remove it so the
        // decoration follows the element, or vanishes with a dissolved binding. A destroyed
        // entity took its components with it.
        const previous = this._component;
        if (previous?.entity && previous.entity.c[this._componentName] === previous) {
            previous.entity.removeComponent(this._componentName);
        }
        this._component = null;

        if (!entity) {
            return;
        }

        if (entity.c[this._componentName]) {
            const label = this.id ? ` '${this.id}'` : '';
            console.warn(
                `${this.tagName.toLowerCase()}${label} - '${entity.name}' already has a '${this._componentName}' component - component not added`
            );
            return;
        }

        this._component = entity.addComponent(this._componentName, this.getInitialComponentData());
    }

    private async _addComponent() {
        const generation = this._connectionGeneration;

        const entityElement = this.closestEntity;
        if (!entityElement) {
            // A component can only exist on an entity, so an element placed outside one is inert.
            // It still becomes ready (with a null `component`), so warn rather than fail silently
            const label = this.id ? ` '${this.id}'` : '';
            console.warn(
                `${this.tagName.toLowerCase()}${label} must be a descendant of pc-entity, pc-model or pc-node - component not added`
            );
            return;
        }

        await entityElement.ready();

        // The element may have been removed, or removed and re-inserted, while the entity became
        // ready — the component belongs to the connection that owns the current generation.
        if (generation !== this._connectionGeneration) {
            return;
        }

        this._hostElement = entityElement;
        this._applyComponent();

        // Re-apply when the host's readiness cycles without this element disconnecting: a
        // `<pc-node>` rebinding after its model reloads or retargets, or a re-created entity.
        // The 'ready' event bubbles, so events from descendants pass through this host - only
        // the host's own cycles count. Readiness is cycled here too, so decorations one level
        // down re-apply the same way.
        this._hostReadyListener = (event: Event) => {
            if (event.target !== this._hostElement) {
                return;
            }
            if (generation !== this._connectionGeneration) {
                return;
            }
            this._hostCycled();
        };
        entityElement.addEventListener('ready', this._hostReadyListener);
    }

    /**
     * Re-evaluates this component against the host's current entity: applied to a new entity,
     * moved from a still-live old one, or removed when the host no longer fronts an entity at
     * all. Readiness follows - it cycles with a re-application and stays unresolved while the
     * host is unbound. Called by the host-ready listener, and directly by a `<pc-node>`
     * dissolving its binding: the one transition that fires no ready event to ride.
     *
     * @internal
     */
    _hostCycled() {
        this._resetReady();
        this._applyComponent();
        if (this._hostElement?.entity) {
            this.initComponent();
            this._onReady();
        }
    }

    /**
     * Configures the newly added component. Overridden by subclasses whose setup goes beyond
     * the initial data — child-element handling, asset resolution and the like.
     */
    protected initComponent() {
        // optional hook
    }

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

        await this._addComponent();

        if (generation !== this._connectionGeneration) {
            return;
        }

        this.initComponent();
        this._onReady();
    }

    disconnectedCallback() {
        // Invalidate any connectedCallback still suspended on an await
        this._connectionGeneration++;

        if (this._hostElement && this._hostReadyListener) {
            this._hostElement.removeEventListener('ready', this._hostReadyListener);
        }
        this._hostElement = null;
        this._hostReadyListener = null;

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
     * element that is not a descendant of an entity-fronting element (`<pc-entity>`,
     * `<pc-model>` or `<pc-node>`) — await {@link whenReady} or the element's `ready()` promise
     * before accessing it.
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

    /**
     * The attribute schema shared by every component element. A subclass declares only its own
     * table; the chain of tables is merged at lookup (see `src/properties.ts`).
     * @internal
     */
    static properties: PropertyTable = componentProperties;

    static get observedAttributes() {
        return attributeNames(this);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        applyAttribute(this, name, newValue);
    }
}

export { ComponentElement };
