import { AppBase, Entity, Vec3 } from 'playcanvas';

import { AsyncElement } from './async-element';
import { parseBool, parseVec3 } from './utils';

/**
 * The EntityElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-entity/ | `<pc-entity>`} elements.
 * The EntityElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class EntityElement extends AsyncElement {
    /**
     * Whether the entity is enabled.
     */
    private _enabled = true;

    /**
     * The name of the entity.
     */
    private _name = 'Untitled';

    /**
     * The position of the entity.
     */
    private _position = new Vec3();

    /**
     * The rotation of the entity.
     */
    private _rotation = new Vec3();

    /**
     * The scale of the entity.
     */
    private _scale = new Vec3(1, 1, 1);

    /**
     * The tags of the entity.
     */
    private _tags: string[] = [];

    /**
     * The pointer event listeners for the entity.
     */
    private _listeners: { [key: string]: EventListener[] } = {};

    /**
     * The event types for which an inline `onpointer*` attribute is currently present.
     */
    private _inlineHandlerTypes = new Set<string>();

    /**
     * Whether the hierarchy has been built for this entity.
     */
    private _built = false;

    private _entity: Entity | null = null;

    /**
     * The PlayCanvas entity instance. Available once the element is ready — await
     * {@link whenReady} or the element's `ready()` promise before accessing it.
     * @returns The entity instance.
     */
    get entity(): Entity {
        return this._entity!;
    }

    createEntity(app: AppBase) {
        // Guard against double creation. When a subtree is inserted at runtime (e.g. cloning a
        // `<template>`), an ancestor's connectedCallback eagerly creates descendant entities; the
        // descendants' own connectedCallbacks would otherwise create them a second time.
        if (this._entity) {
            return;
        }

        // Create a new entity
        const entity = new Entity(this.getAttribute('name') || this._name, app);
        this._entity = entity;

        entity.enabled = parseBool(this.getAttribute('enabled'), true);

        const position = this.getAttribute('position');
        if (position) {
            entity.setLocalPosition(parseVec3(position));
        }

        const rotation = this.getAttribute('rotation');
        if (rotation) {
            entity.setLocalEulerAngles(parseVec3(rotation));
        }

        const scale = this.getAttribute('scale');
        if (scale) {
            entity.setLocalScale(parseVec3(scale));
        }

        const tags = this.getAttribute('tags');
        if (tags) {
            entity.tags.add(tags.split(',').map(tag => tag.trim()));
        }
    }

    buildHierarchy(app: AppBase) {
        if (!this.entity || this._built) return;
        this._built = true;

        const closestEntity = this.closestEntity;
        if (closestEntity?.entity) {
            closestEntity.entity.addChild(this.entity);
        } else {
            app.root.addChild(this.entity);
        }

        this._onReady();
    }

    connectedCallback() {
        // Wait for app to be ready
        const closestApp = this.closestApp;
        if (!closestApp) return;

        // If app is already running, create entity immediately
        if (closestApp.hierarchyReady) {
            const app = closestApp.app!;

            this.createEntity(app);
            this.buildHierarchy(app);

            // Handle any child entities that might exist
            const childEntities = this.querySelectorAll<EntityElement>('pc-entity');
            childEntities.forEach((child) => {
                child.createEntity(app);
            });
            childEntities.forEach((child) => {
                child.buildHierarchy(app);
            });
        }
    }

    disconnectedCallback() {
        if (this.entity) {
            // Notify all children that their entities are about to become invalid
            const children = this.querySelectorAll('pc-entity');
            children.forEach((child) => {
                (child as EntityElement)._entity = null;
            });

            // Destroy the entity
            this.entity.destroy();
            this._entity = null;
            this._built = false;
        }
    }

    /**
     * Sets the enabled state of the entity.
     * @param value - Whether the entity is enabled.
     */
    set enabled(value) {
        this._enabled = value;
        if (this.entity) {
            this.entity.enabled = value;
        }
    }

    /**
     * Gets the enabled state of the entity.
     * @returns Whether the entity is enabled.
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Sets the name of the entity.
     * @param value - The name of the entity.
     */
    set name(value) {
        this._name = value;
        if (this.entity) {
            this.entity.name = value;
        }
    }

    /**
     * Gets the name of the entity.
     * @returns The name of the entity.
     */
    get name() {
        return this._name;
    }

    /**
     * Sets the position of the entity.
     * @param value - The position of the entity.
     */
    set position(value) {
        this._position = value;
        if (this.entity) {
            this.entity.setLocalPosition(this._position);
        }
    }

    /**
     * Gets the position of the entity.
     * @returns The position of the entity.
     */
    get position() {
        return this._position;
    }

    /**
     * Sets the rotation of the entity.
     * @param value - The rotation of the entity.
     */
    set rotation(value) {
        this._rotation = value;
        if (this.entity) {
            this.entity.setLocalEulerAngles(this._rotation);
        }
    }

    /**
     * Gets the rotation of the entity.
     * @returns The rotation of the entity.
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * Sets the scale of the entity.
     * @param value - The scale of the entity.
     */
    set scale(value) {
        this._scale = value;
        if (this.entity) {
            this.entity.setLocalScale(this._scale);
        }
    }

    /**
     * Gets the scale of the entity.
     * @returns The scale of the entity.
     */
    get scale() {
        return this._scale;
    }

    /**
     * Sets the tags of the entity.
     * @param value - The tags of the entity.
     */
    set tags(value) {
        this._tags = value;
        if (this.entity) {
            this.entity.tags.clear();
            this.entity.tags.add(this._tags);
        }
    }

    /**
     * Gets the tags of the entity.
     * @returns The tags of the entity.
     */
    get tags() {
        return this._tags;
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
    private _updateInlineHandler(name: string, value: string | null) {
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

    static get observedAttributes() {
        return [
            'enabled',
            'name',
            'position',
            'rotation',
            'scale',
            'tags',
            'onpointerenter',
            'onpointerleave',
            'onpointerdown',
            'onpointerup',
            'onpointermove'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'enabled':
                this.enabled = parseBool(newValue, true);
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'position':
                this.position = parseVec3(newValue);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'tags':
                this.tags = newValue.split(',').map(tag => tag.trim());
                break;
            case 'onpointerenter':
            case 'onpointerleave':
            case 'onpointerdown':
            case 'onpointerup':
            case 'onpointermove':
                this._updateInlineHandler(name, newValue);
                break;
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
            this._listeners[type] = this._listeners[type].filter(l => l !== listener);
        }
        super.removeEventListener(type, listener, options);
        if (type.startsWith('pointer')) {
            this.dispatchEvent(new CustomEvent(`${type}:disconnect`, { bubbles: true }));
        }
    }

    hasListeners(type: string): boolean {
        return Boolean(this._listeners[type]?.length) || this._inlineHandlerTypes.has(type);
    }
}

customElements.define('pc-entity', EntityElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-entity': EntityElement;
    }
}

export { EntityElement };
