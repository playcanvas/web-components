import type { AppBase } from 'playcanvas';
import { Entity, Vec3 } from 'playcanvas';

import type { AppElement } from './app';
import type { AsyncElement } from './async-element';
import { attr, defineAttributes } from './attributes';
import { ComponentElement } from './components/component';
import { EntityBaseElement } from './entity-base';
import type { ModelElement } from './model';
import type { NodeElement } from './node';

/**
 * Creates and parents the entities of every descendant entity-owning element of `root`, in two
 * passes so that no parent's existence depends on document order. This is the first half of
 * building a subtree, and {@link buildDescendantContent} is the second. Called by `<pc-app>` as it
 * boots, by the root of a subtree inserted into a running application, and by a `<pc-node>` whose
 * children waited for it to bind.
 *
 * Descendants that are not yet custom elements are skipped, because there is nothing useful to do
 * for them and reaching for `_createEntity` would throw. A `<pc-node>` inserted on its own is the
 * one caller that can meet them: `<pc-app>` and an inserted entity upgrade their subtree before
 * they build it. Each skipped element becomes an entity-owning element moments later, and its own
 * `connectedCallback` builds it.
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
 * Builds what `roots` and the elements under them declare on their entities, once those entities
 * exist: the content of every model whose container has loaded, and then every component, in tree
 * order, each with the script instances whose class is registered. This is the second half of
 * building a subtree. Called by `<pc-app>` once preload has finished and before it starts the
 * application, and for what is inserted into a running application before any of it joins the
 * scene - so in both cases the scripts initialize with everything in place.
 *
 * Models come first, so that the nodes inside them are bound, and the entities declared on those
 * nodes are built, before any component looks for its host. One nested in another model's content
 * is built as that content arrives, and so is reached in turn.
 *
 * What cannot be built yet keeps the path it has always had, and is built when it can be: a model
 * whose container loads later, what is declared inside it, and a script whose class has not been
 * registered.
 *
 * @param roots - The elements to build the content of, in document order, which every element
 * under them has been upgraded along with.
 * @param owns - Whether an element is still this caller's to build. A listener run from here may
 * end the build, and `<pc-app>` leaves what a nested application owns to it.
 * @internal
 */
export const buildDescendantContent = (roots: Element[], owns: (element: AsyncElement) => boolean = () => true) => {
    const elements = roots.flatMap((root) => [root, ...Array.from(root.querySelectorAll('*'))]);

    // Told apart by tag, because the class cannot be imported here: it extends the one below
    const models = elements.filter((element): element is ModelElement => element.localName === 'pc-model');
    for (const model of models) {
        if (owns(model)) {
            model._loadPreloaded();
        }
    }

    for (const element of elements) {
        if (element instanceof ComponentElement && owns(element)) {
            element._build();
        }
    }
};

/**
 * The elements a root has taken on to build along with itself, for as long as it takes to upgrade
 * them. Each connects as it upgrades, and leaves its building to that root.
 */
const taken = new WeakSet<Element>();

/**
 * The base class for elements that create and own their backing entity: `<pc-entity>` and
 * `<pc-model>`, whose host entity carries the same authored properties. It carries the cached
 * property state, entity creation and parenting, and the reset that follows the entity's
 * destruction. `<pc-node>` sits outside this class: it borrows an entity a model instantiated,
 * and its properties are nullable overrides rather than owned values.
 *
 * @category Base Classes
 */
class EntityOwnerElement extends EntityBaseElement {
    /**
     * The enabled state of the entity.
     */
    declare enabled: boolean;

    /**
     * The name of the entity.
     */
    declare name: string;

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
     * Whether this entity has its place in the hierarchy: it has been parented, or it is the root
     * of an inserted subtree, which is parented once the subtree under it is built. Read by
     * subclasses that gate work on the entity being built.
     */
    protected _built = false;

    /**
     * Whether the element has connected: its connectedCallback has run since it was last put in
     * the document. Set and cleared by the subclasses, whose callbacks those are. An element in
     * the document that has yet to connect has only just arrived, in the DOM operation that is
     * still connecting what it inserted - which is how a root tells the elements that arrived
     * with it from the ones that were there before.
     */
    protected _connected = false;

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

        // Seed from the properties rather than re-reading the attributes. Every observed attribute
        // is routed through its property setter by attributeChangedCallback, so each property
        // already holds the parsed attribute value - and it also holds anything assigned through the
        // property API before the app booted, which reading the attribute back would discard.
        const entity = new Entity(this.name, app);
        this._entity = entity;

        entity.enabled = this.enabled;
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
        const parent = this._parentEntity(app);
        if (!parent) return;

        this._built = true;
        parent.addChild(this._entity!);
        this._onBuilt();
    }

    /**
     * Finds the entity this element's entity is to be parented under: the entity of the nearest
     * ancestor `<pc-entity>`, `<pc-model>` or `<pc-node>` when there is one, and the application
     * root otherwise.
     *
     * @param app - The application whose root adopts parentless entities.
     * @returns The parent, or `null` when there is nothing to parent, or nothing to parent it
     * under yet.
     */
    private _parentEntity(app: AppBase): Entity | null {
        if (!this._entity || this._built) return null;

        const closestEntity = this.closestEntity;

        // A host element without an entity is an unresolved `<pc-node>`: building now would
        // mis-anchor this entity to the application root while the host is still resolving.
        // Stay unbuilt - the host drives this subtree itself once it binds.
        if (closestEntity && !closestEntity.entity) {
            return null;
        }

        // An owner that exists but is not yet parented is itself deferred, behind an unresolved
        // node further up or as part of a subtree its root is still assembling. Stay unbuilt with
        // it - whichever builds it sweeps the whole subtree, ancestors before descendants.
        if (closestEntity instanceof EntityOwnerElement && !closestEntity._built) {
            return null;
        }

        return closestEntity?.entity ?? app.root;
    }

    /**
     * Builds this element and everything declared under it, in an application whose hierarchy
     * already exists - along with the elements that arrived beside it. Called when the element
     * connects.
     *
     * Everything is assembled before any of it joins the scene: the entities, the content of
     * every model whose container has loaded, and every component with the script instances
     * whose class is registered. Adding the root entity to its parent then enables the whole
     * hierarchy at once, as the engine does for a hierarchy handed to `addChild`: every script
     * in it runs `initialize()`, and then every script runs `postInitialize()`, with every
     * entity and component in place. Each element reports ready as it is built, which is before
     * its root joins the scene.
     *
     * One DOM operation can insert several entity-owning elements side by side: the children of
     * a fragment or a cloned template, of `innerHTML`, or the arguments of `append`. The first
     * of them to connect builds them all, so that what one declares can refer to another, and
     * then adds them to the scene one after the other, in document order. Each is a hierarchy of
     * its own to the engine, as each would be in as many calls to `addChild`: the scripts of one
     * have initialized and post-initialized before the next joins the scene.
     *
     * While the application is still preloading, only the entities are built. The application
     * builds every component under it once preload has finished, and starts its scripts
     * together.
     *
     * An element whose ancestor is assembling the subtree it belongs to, or which another
     * element has built, has nothing left to do here.
     *
     * @param appElement - The application element, which has built its hierarchy.
     */
    protected _buildSubtree(appElement: AppElement) {
        // The element that arrived before this one is building it
        if (taken.has(this)) {
            return;
        }

        const app = appElement.app!;

        // A subtree parsed from a string, or cloned from a <template>, arrives unupgraded and
        // upgrades in tree order, this element before its descendants. Upgrading them now makes
        // the subtree whole, so that it can be built here as one built with createElement is.
        // Each descendant connects as it upgrades, and finds this element not built yet.
        customElements.upgrade(this);

        this._createEntity(app);

        const parent = this._parentEntity(app);
        if (!parent) {
            return;
        }

        // Every root gets its entity and its place before anything is built on one, and before
        // the first event is dispatched: what one of them declares can then refer to another,
        // and nothing a listener inserts can take one of them for an element still to arrive
        const roots = [this, ...this._arrivedWith()];
        const entities = roots.map((root) => {
            root._createEntity(app);
            root._built = true;
            return root._entity;
        });

        // Building dispatches ready and load events synchronously, and a listener may remove
        // one of these elements, which destroys its entity. Nothing more is built under that
        // one then, and it does not join the scene.
        const building = (index: number) => roots[index]._entity === entities[index];

        roots.forEach((root, index) => {
            if (!building(index)) {
                return;
            }

            // In a subtree that arrived already upgraded, no element below the root has
            // connected yet, so the nodes have yet to find the model they bind into
            root.querySelectorAll<NodeElement>('pc-node').forEach((node) => node._follow());

            root._onBuilt();
            if (building(index)) {
                buildDescendantEntities(root, app);
            }
        });

        if (appElement._sceneBuilt) {
            buildDescendantContent(roots.filter((_root, index) => building(index)));
        }

        // Each root joins the scene only now, with everything that arrived in place. A script
        // that initializes as one joins may remove another.
        roots.forEach((_root, index) => {
            if (building(index)) {
                parent.addChild(entities[index]!);
            }
        });
    }

    /**
     * Finds the entity-owning elements that arrived in the document with this one - the siblings
     * after it that the same DOM operation inserted - and upgrades the ones that arrived as
     * plain elements.
     *
     * One operation inserts one run of siblings, and connects them in document order. So when
     * the first of them connects, the others are in the document and have not connected: they
     * have yet to be upgraded, or they are custom elements whose connectedCallback has not run.
     * A sibling that has connected was there before the operation, and so is everything after
     * it - including one whose entity a script has since destroyed, which this must not rebuild.
     *
     * @returns The elements that arrived with this one, in document order.
     */
    private _arrivedWith(): EntityOwnerElement[] {
        const arrived: Element[] = [];
        for (let sibling = this.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
            if (sibling.localName !== 'pc-entity' && sibling.localName !== 'pc-model') {
                continue;
            }
            if (sibling instanceof EntityOwnerElement && (sibling._connected || sibling._built)) {
                break;
            }
            arrived.push(sibling);
        }

        // Upgrading connects each one, and everything under it, into a subtree whose root is
        // spoken for
        arrived.forEach((element) => taken.add(element));
        arrived.forEach((element) => customElements.upgrade(element));
        arrived.forEach((element) => taken.delete(element));

        return arrived.filter((element): element is EntityOwnerElement => element instanceof EntityOwnerElement);
    }

    /**
     * Called once the backing entity is built — exactly once per build cycle: by
     * `_buildHierarchy` when it has parented the entity, and by `_buildSubtree` for the root of
     * an inserted subtree, which is parented last. The default announces readiness, which is
     * what a built `<pc-entity>` means; `<pc-model>` overrides it to start loading content
     * instead, because its readiness tracks the content settling rather than the host being
     * built.
     */
    protected _onBuilt() {
        this._onReady();
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

// The two attributes that are values written through to the entity. The transform and the tags
// are set through the entity's own methods, so they stay hand-written above. The schema is on this
// class rather than on pc-entity and pc-model, so that any class extending it has the properties.
defineAttributes(EntityOwnerElement, 'entity', {
    enabled: attr.bool(true),
    name: attr.string('Untitled')
});

export { EntityOwnerElement };
