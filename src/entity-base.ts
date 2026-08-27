import type { Entity } from 'playcanvas';

import type { AppElement } from './app';
import { AsyncElement } from './async-element';

/**
 * The event types the containing `<pc-app>` synthesizes on entity-fronting elements via picking:
 * the `pointer*` events, plus `click` — which concludes a primary-button press and release, and
 * is delivered as a `PointerEvent` exactly as modern browsers deliver native clicks.
 * @internal
 */
export const SYNTHESIZED_EVENTS = [
    'pointerenter',
    'pointerleave',
    'pointerdown',
    'pointerup',
    'pointermove',
    'click'
] as const;

const SYNTHESIZED_EVENT_SET: ReadonlySet<string> = new Set(SYNTHESIZED_EVENTS);

/**
 * The attribute names of the inline event handlers (`onpointerdown`, `onclick`, ...), shared by
 * every element that fronts an engine entity. Spread into `observedAttributes` by subclasses.
 * @internal
 */
export const EVENT_ATTRIBUTES = SYNTHESIZED_EVENTS.map((type) => `on${type}`);

/**
 * The base class for elements that front an engine {@link Entity}: `<pc-entity>` and
 * `<pc-model>`, which create one, and `<pc-node>`, which binds to one inside a model's
 * instantiated hierarchy. It carries what all of them need — the `entity` contract, registration
 * with the owning application (which joins picked scene nodes back to elements by identity,
 * never by name), and the pointer listener bookkeeping that lets the application lazily attach
 * its canvas handlers.
 */
class EntityBaseElement extends AsyncElement {
    protected _entity: Entity | null = null;

    /**
     * The application element this entity is registered with, cached at registration time so the
     * entity can be unregistered even once this element has left the DOM.
     */
    protected _appElement: AppElement | null = null;

    /**
     * The event listeners registered on the element, by type.
     */
    private _listeners: Record<string, EventListener[]> = {};

    /**
     * The event types for which an inline handler attribute (`onpointerdown`, `onclick`, ...)
     * is currently present.
     */
    private _inlineHandlerTypes = new Set<string>();

    /**
     * The PlayCanvas entity instance. `null` until the element is ready, and again once the
     * entity is gone — await {@link whenReady} or the element's `ready()` promise before
     * accessing it.
     * @returns The entity instance, or `null`.
     */
    get entity(): Entity | null {
        return this._entity;
    }

    /**
     * Registers `entity` as this element's backing entity with the owning application, which
     * joins engine nodes back to elements by identity (never by name).
     *
     * @param entity - The entity to register.
     */
    protected _registerEntity(entity: Entity) {
        this._appElement = this.closestApp;
        this._appElement?._registerEntityElement(entity, this);
    }

    /**
     * Removes the registration for `entity`.
     *
     * @param entity - The entity to unregister.
     */
    protected _unregisterEntity(entity: Entity) {
        this._appElement?._unregisterEntityElement(entity);
        this._appElement = null;
    }

    /**
     * Tracks whether an inline handler attribute is present. The browser itself compiles and
     * runs these attributes — they are standard `GlobalEventHandlers`, so setting one replaces
     * the previous handler and removing it removes the handler, exactly like `onclick` on any
     * HTML element. But because they bypass {@link EventTarget.addEventListener}, the connect/disconnect
     * bookkeeping that lets the application lazily attach its canvas pointer handlers must be
     * kept in sync here.
     *
     * @param name - The attribute name (e.g. 'onpointerdown').
     * @param value - The attribute value, or `null` when the attribute has been removed.
     */
    protected _updateInlineHandler(name: string, value: string | null) {
        const type = name.substring(2);
        const had = this._inlineHandlerTypes.has(type);
        const has = value !== null;

        if (has && !had) {
            this._inlineHandlerTypes.add(type);
            this.dispatchEvent(new CustomEvent(`${type}:connect`, { bubbles: true }));
        } else if (!has && had) {
            this._inlineHandlerTypes.delete(type);
            this.dispatchEvent(new CustomEvent(`${type}:disconnect`, { bubbles: true }));
        }
    }

    addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
        if (!this._listeners[type]) {
            this._listeners[type] = [];
        }
        this._listeners[type].push(listener);
        super.addEventListener(type, listener, options);
        if (SYNTHESIZED_EVENT_SET.has(type)) {
            this.dispatchEvent(new CustomEvent(`${type}:connect`, { bubbles: true }));
        }
    }

    removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
        }
        super.removeEventListener(type, listener, options);
        if (SYNTHESIZED_EVENT_SET.has(type)) {
            this.dispatchEvent(new CustomEvent(`${type}:disconnect`, { bubbles: true }));
        }
    }

    /**
     * Whether the element has a listener for an event type, registered either with
     * {@link EventTarget.addEventListener} or with the matching inline handler attribute. Read by the
     * containing `<pc-app>` element to gate event synthesis.
     *
     * @param type - The event type.
     * @returns Whether a listener is registered.
     * @internal
     */
    _hasListeners(type: string): boolean {
        return Boolean(this._listeners[type]?.length) || this._inlineHandlerTypes.has(type);
    }
}

export { EntityBaseElement };
