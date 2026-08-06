import type { AppBase } from 'playcanvas';
import { Entity, Vec3 } from 'playcanvas';

import { EntityBaseElement, POINTER_ATTRIBUTES } from './entity-base';
import { parseBool, parseTags, parseVec3 } from './parse';

/**
 * The EntityElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-entity/ | `<pc-entity>`} elements.
 * The EntityElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The pointer events below are dispatched by the containing `<pc-app>` element when the pointer
 * intersects this entity's geometry. They are only generated while the entity has a listener for
 * them, registered either with {@link addEventListener} or with the matching inline `onpointer*`
 * attribute.
 *
 * @attribute {string} onpointerenter - Script to run when the pointer moves onto the entity.
 * @attribute {string} onpointerleave - Script to run when the pointer moves off the entity.
 * @attribute {string} onpointermove - Script to run when the pointer moves over the entity.
 * @attribute {string} onpointerdown - Script to run when a pointer button is pressed over the
 * entity.
 * @attribute {string} onpointerup - Script to run when a pointer button is released over the
 * entity.
 * @fires {PointerEvent} pointerenter - Fired when the pointer moves onto the entity.
 * @fires {PointerEvent} pointerleave - Fired when the pointer moves off the entity.
 * @fires {PointerEvent} pointermove - Fired when the pointer moves over the entity.
 * @fires {PointerEvent} pointerdown - Fired when a pointer button is pressed over the entity.
 * @fires {PointerEvent} pointerup - Fired when a pointer button is released over the entity.
 */
class EntityElement extends EntityBaseElement {
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
     * Whether the hierarchy has been built for this entity.
     */
    private _built = false;

    /**
     * Creates the backing entity. Called by the containing `<pc-app>` element during its boot
     * sweep, and on connection for elements inserted while the application is already running.
     *
     * @param app - The application to create the entity in.
     * @internal
     */
    _createEntity(app: AppBase) {
        // Guard against double creation. When a subtree is inserted at runtime (e.g. cloning a
        // `<template>`), an ancestor's connectedCallback eagerly creates descendant entities; the
        // descendants' own connectedCallbacks would otherwise create them a second time.
        if (this._entity) {
            return;
        }

        // Seed from the cached fields rather than re-reading the attributes. Every observed
        // attribute is routed through its property setter by attributeChangedCallback, so the field
        // already holds the parsed attribute value - and it also holds anything assigned through the
        // property API before the app booted, which reading the attribute back would discard.
        const entity = new Entity(this._name, app);
        this._entity = entity;

        entity.enabled = this._enabled;
        entity.setLocalPosition(this._position);
        entity.setLocalEulerAngles(this._rotation);
        entity.setLocalScale(this._scale);

        if (this._tags.length > 0) {
            entity.tags.add(this._tags);
        }

        // Register with the owning application and hook the entity's destruction. The engine
        // fires 'destroy' for every entity in a destroyed subtree, so the element learns of its
        // entity's death no matter who causes it: this element, an ancestor, the whole
        // application, or a user script calling entity.destroy().
        this._registerEntity(entity);
        entity.once('destroy', this._onEntityDestroy, this);
    }

    /**
     * Handles the destruction of the backing entity. Resets the element so a later re-insertion
     * starts clean: `_built` must be cleared alongside `_entity`, or _buildHierarchy would bail
     * and a re-created entity would never be parented. Readiness is re-armed for the same
     * reason — with the entity gone, a resolved ready promise would resume its awaiters against
     * a null `entity`.
     *
     * @param entity - The entity that was destroyed.
     */
    private _onEntityDestroy(entity: Entity) {
        this._unregisterEntity(entity);
        this._entity = null;
        this._built = false;
        this._resetReady();
    }

    /**
     * Parents the backing entity: under the entity of the nearest ancestor `<pc-entity>` or
     * `<pc-node>` when there is one, and under the application root otherwise. Called by the
     * containing `<pc-app>` element once a sweep has created every entity, so a parent's
     * existence never depends on document order.
     *
     * @param app - The application whose root adopts parentless entities.
     * @internal
     */
    _buildHierarchy(app: AppBase) {
        if (!this.entity || this._built) return;

        const closestEntity = this.closestEntity;

        // A host element without an entity is an unresolved `<pc-node>`: building now would
        // mis-anchor this entity to the application root while the host is still resolving.
        // Stay unbuilt - the host drives this subtree itself once it binds.
        if (closestEntity && !closestEntity.entity) {
            return;
        }

        this._built = true;

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
        if (!closestApp) {
            // An entity outside an application is inert and never becomes ready, so awaiting it
            // hangs. Warn rather than fail silently, naming the parent it requires, as every other
            // misplaced element does.
            const name = this.getAttribute('name');
            const label = name ? ` '${name}'` : '';
            console.warn(`pc-entity${label} must be a descendant of pc-app - entity not created`);
            return;
        }

        // If app is already running, create entity immediately
        if (closestApp._hierarchyReady) {
            const app = closestApp.app!;

            this._createEntity(app);
            this._buildHierarchy(app);

            // Handle any child entities that might exist
            const childEntities = this.querySelectorAll<EntityElement>('pc-entity');
            childEntities.forEach((child) => {
                child._createEntity(app);
            });
            childEntities.forEach((child) => {
                child._buildHierarchy(app);
            });
        }
    }

    disconnectedCallback() {
        // Destroying the entity destroys its whole subtree, and the engine fires 'destroy' for
        // every entity in it - so _onEntityDestroy resets this element AND every descendant
        // element before the descendants' own disconnectedCallbacks run. Their entities are null
        // by then, making this call a no-op for them.
        this._entity?.destroy();
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

    static get observedAttributes() {
        return ['enabled', 'name', 'position', 'rotation', 'scale', 'tags', ...POINTER_ATTRIBUTES];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'enabled':
                this.enabled = parseBool(newValue, true);
                break;
            case 'name':
                this.name = newValue ?? 'Untitled';
                break;
            case 'position':
                this.position = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'scale':
                this.scale = parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'tags':
                this.tags = parseTags(newValue);
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
}

customElements.define('pc-entity', EntityElement);

export { EntityElement };
