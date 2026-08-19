import type { AppBase } from 'playcanvas';
import { Entity, Vec3 } from 'playcanvas';

import { EntityBaseElement } from './entity-base';

/**
 * Creates and parents the entities of every descendant entity-owning element of `root`, in two
 * passes so that no parent's existence depends on document order. Called wherever a subtree could
 * not build itself: an element inserted into an application that is already running, and a
 * `<pc-node>` whose children waited for it to bind.
 *
 * Descendants that are not yet custom elements are skipped, because there is nothing useful to do
 * for them and reaching for `_createEntity` would throw. A subtree cloned from a `<template>`
 * arrives entirely unupgraded — template content lives in an inert document, where custom element
 * definitions are never looked up — and appending the clone upgrades its elements in tree order,
 * an element before its descendants. So a sweep from an element's own `connectedCallback` sees
 * plain `HTMLElement`s below it. Each becomes an entity-owning element moments later and its own
 * `connectedCallback` creates and parents it, by which time the ancestor it parents under has its
 * entity — the same guarantee tree order gives this sweep.
 *
 * @param root - The element whose descendant entities to build.
 * @param app - The application to create the entities in.
 * @internal
 */
export const buildDescendantEntities = (root: Element, app: AppBase) => {
    const children = Array.from(root.querySelectorAll('pc-entity, pc-model')).filter(
        (child): child is EntityOwnerElement => child instanceof EntityOwnerElement
    );
    children.forEach((child) => child._createEntity(app));
    children.forEach((child) => child._buildHierarchy(app));
};

/**
 * The base class for elements that create and own their backing entity: `<pc-entity>` and
 * `<pc-model>`, whose host entity carries the same authored properties. It carries the cached
 * property state, entity creation and parenting, and the reset that follows the entity's
 * destruction. `<pc-node>` sits outside this class: it borrows an entity a model instantiated,
 * and its properties are nullable overrides rather than owned values.
 */
class EntityOwnerElement extends EntityBaseElement {
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
     * Whether the hierarchy has been built for this entity — set once {@link _buildHierarchy} has
     * parented it. Read by subclasses that gate work on the entity being in the scene graph.
     */
    protected _built = false;

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
    protected _onEntityDestroy(entity: Entity) {
        this._unregisterEntity(entity);
        this._entity = null;
        this._built = false;
        this._resetReady();
    }

    /**
     * Parents the backing entity: under the entity of the nearest ancestor `<pc-entity>`,
     * `<pc-model>` or `<pc-node>` when there is one, and under the application root otherwise.
     * Called by the containing `<pc-app>` element once a sweep has created every entity, so a
     * parent's existence never depends on document order.
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

        this._onBuilt();
    }

    /**
     * Called by {@link _buildHierarchy} once the backing entity has been parented — exactly once
     * per build cycle. The default announces readiness, which is what a parented `<pc-entity>`
     * means; `<pc-model>` overrides it to start loading content instead, because its readiness
     * tracks the content settling rather than the host entering the scene graph.
     */
    protected _onBuilt() {
        this._onReady();
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
}

export { EntityOwnerElement };
