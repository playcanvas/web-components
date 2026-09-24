import type { Entity } from 'playcanvas';

import type { AppElement } from './app';
import { AsyncElement } from './async-element';
import { ListenerRegistry } from './pointer-events';

/**
 * The base class for elements that front an engine {@link Entity}: `<pc-entity>` and
 * `<pc-model>`, which create one, and `<pc-node>`, which binds to one inside a model's
 * instantiated hierarchy. It carries what all of them need — the `entity` contract, registration
 * with the owning application (which joins picked scene nodes back to elements by identity,
 * never by name), and the pointer listener bookkeeping that tells the application when to pick.
 *
 * @category Base Classes
 */
class EntityBaseElement extends AsyncElement {
    protected _entity: Entity | null = null;

    /**
     * The application element this entity is registered with, cached at registration time so the
     * entity can be unregistered even once this element has left the DOM.
     */
    protected _appElement: AppElement | null = null;

    /**
     * The pointer listeners registered on the element, which the containing `<pc-app>` reads to
     * decide when to pick.
     * @internal
     */
    readonly _pointerListeners = new ListenerRegistry(this);

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
     * Registers a listener exactly as {@link EventTarget.addEventListener} does, and records it
     * for the pointer bookkeeping. Internal so that the published typings keep the DOM's own
     * typed signatures.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The listener options.
     * @internal
     */
    addEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | AddEventListenerOptions
    ): void;
    /** @internal */
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void;
    /** @internal */
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ) {
        super.addEventListener(type, listener, options);
        this._pointerListeners.add(type, listener, options);
    }

    /**
     * Removes a listener exactly as {@link EventTarget.removeEventListener} does, and forgets it
     * for the pointer bookkeeping.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The listener options.
     * @internal
     */
    removeEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | EventListenerOptions
    ): void;
    /** @internal */
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
    ): void;
    /** @internal */
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
    ) {
        super.removeEventListener(type, listener, options);
        this._pointerListeners.remove(type, listener, options);
    }
}

export { EntityBaseElement };
