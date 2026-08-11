import type { Entity } from 'playcanvas';

import type { AppElement } from './app';
import { AsyncElement } from './async-element';

/**
 * The attribute names of the inline `onpointer*` event handlers, shared by every element that
 * fronts an engine entity. Spread into `observedAttributes` by subclasses.
 * @internal
 */
export const POINTER_ATTRIBUTES = [
    'onpointerenter',
    'onpointerleave',
    'onpointerdown',
    'onpointerup',
    'onpointermove'
] as const;

/**
 * The base class for elements that front an engine {@link Entity}: `<pc-entity>`, which creates
 * one, and `<pc-node>`, which binds to one inside a model's instantiated hierarchy. It carries
 * what both need — the `entity` contract, registration with the owning application (which joins
 * picked scene nodes back to elements by identity, never by name), and the pointer listener
 * bookkeeping that lets the application lazily attach its canvas handlers.
 */
class EntityBaseElement extends AsyncElement {
    protected _entity: Entity | null = null;

    /**
     * The application element this entity is registered with, cached at registration time so the
     * entity can be unregistered even once this element has left the DOM.
     */
    protected _appElement: AppElement | null = null;

    /**
     * The pointer event listeners for the entity.
     */
    private _listeners: Record<string, EventListener[]> = {};

    /**
     * The event types for which an inline `onpointer*` attribute is currently present.
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
     * Tracks whether an inline `onpointer*` attribute is present. The browser itself compiles and
     * runs these attributes — they are standard `GlobalEventHandlers`, so setting one replaces
     * the previous handler and removing it removes the handler, exactly like `onclick` on any
     * HTML element. But because they bypass {@link addEventListener}, the connect/disconnect
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
        if (type.startsWith('pointer')) {
            this.dispatchEvent(new CustomEvent(`${type}:connect`, { bubbles: true }));
        }
    }

    removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
        }
        super.removeEventListener(type, listener, options);
        if (type.startsWith('pointer')) {
            this.dispatchEvent(new CustomEvent(`${type}:disconnect`, { bubbles: true }));
        }
    }

    /**
     * Whether the element has a listener for an event type, registered either with
     * {@link addEventListener} or with the matching inline `onpointer*` attribute. Read by the
     * containing `<pc-app>` element to gate pointer event synthesis.
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
