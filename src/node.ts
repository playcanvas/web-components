import type { Entity, EventHandle, GraphNode, Quat } from 'playcanvas';
import { Vec3 } from 'playcanvas';

import type { EntityElement } from './entity';
import { EntityBaseElement, POINTER_ATTRIBUTES } from './entity-base';
import { ModelElement } from './model';
import { parseBool, parseTags, parseVec3 } from './parse';

/**
 * The binding states a `<pc-node>` element moves through. `pending` while the host has not yet
 * instantiated (or no `name` is assigned), `bound` once a node has been resolved and decorated,
 * `missing`/`ambiguous`/`duplicate` when resolution failed — each accompanied by a warning
 * naming the cause.
 */
type NodeBindingState = 'pending' | 'bound' | 'missing' | 'ambiguous' | 'duplicate';

/**
 * The authored values a bound node's overrides displaced, captured per property when the first
 * override of that property applies and restored when the override clears.
 */
type AuthoredState = {
    enabled?: boolean;
    position?: Vec3;
    rotation?: Quat;
    scale?: Vec3;
    tags?: string[];
};

/**
 * Computes the Levenshtein distance between two strings, for near-miss suggestions in the
 * resolution warnings.
 *
 * @param a - The first string.
 * @param b - The second string.
 * @returns The edit distance.
 */
const levenshtein = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const current = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
            previous = current;
        }
    }
    return row[b.length];
};

/**
 * The NodeElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-node/ | `<pc-node>`}
 * elements. The NodeElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * A `pc-node` is an override element: where `pc-entity` creates an entity, `pc-node` binds to a
 * node a `pc-model` loaded and declares overrides against the authored asset — components to
 * add, properties to change, content to attach. Attributes present apply as overrides; attributes
 * absent leave authored values untouched, and removing an attribute (or assigning `null` to the
 * matching property) restores the authored value.
 *
 * `name` selects among the host model's nodes (first match in depth-first order), nesting a
 * `pc-node` inside another scopes the search to that subtree, and `index` picks among identically
 * named matches. When `name` matches more than one node and no `index` is given, the element
 * warns and binds nothing.
 *
 * The element becomes ready once bound. It never becomes ready while unresolved — a missing or
 * ambiguous name warns and leaves the element pending, and descendants wait with it.
 *
 * The pointer events below are dispatched by the containing `<pc-app>` element when the pointer
 * intersects the bound node's geometry, exactly as for `<pc-entity>`.
 *
 * @attribute {string} name - The name of the node to bind, resolved within the nearest ancestor
 * `pc-model` (or `pc-node`) once it has instantiated.
 * @attribute {number} index - Which match to bind when `name` matches more than one node,
 * 0-based in depth-first order. Optional for a unique match; required for an ambiguous one.
 * @attribute {boolean} enabled - Overrides the node's enabled state.
 * @attribute {string} position - Overrides the node's local position, as an "x y z" triple.
 * @attribute {string} rotation - Overrides the node's local rotation (Euler angles), as an
 * "x y z" triple.
 * @attribute {string} scale - Overrides the node's local scale, as an "x y z" triple.
 * @attribute {string} tags - Overrides the node's tags, separated by spaces or commas.
 * @attribute {string} onpointerenter - Script to run when the pointer moves onto the node.
 * @attribute {string} onpointerleave - Script to run when the pointer moves off the node.
 * @attribute {string} onpointermove - Script to run when the pointer moves over the node.
 * @attribute {string} onpointerdown - Script to run when a pointer button is pressed over the
 * node.
 * @attribute {string} onpointerup - Script to run when a pointer button is released over the
 * node.
 * @fires {PointerEvent} pointerenter - Fired when the pointer moves onto the node.
 * @fires {PointerEvent} pointerleave - Fired when the pointer moves off the node.
 * @fires {PointerEvent} pointermove - Fired when the pointer moves over the node.
 * @fires {PointerEvent} pointerdown - Fired when a pointer button is pressed over the node.
 * @fires {PointerEvent} pointerup - Fired when a pointer button is released over the node.
 */
class NodeElement extends EntityBaseElement {
    private _name = '';

    private _index: number | null = null;

    private _state: NodeBindingState = 'pending';

    private _path: string | null = null;

    /**
     * The element whose entity roots this element's search: the nearest ancestor `pc-node`, or
     * failing that the nearest ancestor `pc-model`. Resolved on connection.
     */
    private _host: ModelElement | NodeElement | null = null;

    /**
     * The listener following the host's binding cycles. Both host kinds announce each cycle
     * with a `ready` event — `pc-model` on every instantiation, `pc-node` on every bind.
     */
    private _hostListener: EventListener | null = null;

    /**
     * The subscription to the bound entity's destruction, detached on unbind so a retargeted
     * element cannot be reset by the eventual death of a node it no longer fronts.
     */
    private _destroyHandle: EventHandle | null = null;

    /** The authored values displaced by this element's overrides, captured per property. */
    private _authored: AuthoredState = {};

    // Override values. `null` means "no override": the authored value stays in force.

    private _enabled: boolean | null = null;

    private _position: Vec3 | null = null;

    private _rotation: Vec3 | null = null;

    private _scale: Vec3 | null = null;

    private _tags: string[] | null = null;

    /**
     * The binding state: `pending` until the host instantiates and `name` resolves, `bound`
     * once decorated, `missing`/`ambiguous`/`duplicate` when resolution failed (each also
     * warns). Useful for asserting a document's bindings programmatically.
     * @returns The binding state.
     */
    get state(): NodeBindingState {
        return this._state;
    }

    /**
     * The path of the bound node below the search root, `/`-separated, or `null` while not
     * bound.
     * @returns The bound node's path, or `null`.
     */
    get path(): string | null {
        return this._path;
    }

    connectedCallback() {
        const host = (this.parentElement?.closest('pc-model, pc-node') ?? null) as
            | ModelElement
            | NodeElement
            | null;
        if (!host) {
            const label = this._name ? ` '${this._name}'` : '';
            console.warn(`pc-node${label} must be a descendant of pc-model - node not bound`);
            return;
        }

        this._host = host;

        // Follow the host's binding cycles. `ready` bubbles, so cycles of elements nested under
        // the host pass through it - only the host's own count.
        this._hostListener = (event: Event) => {
            if (event.target !== this._host) {
                return;
            }
            this._rebind();
        };
        host.addEventListener('ready', this._hostListener);

        // The host may already be instantiated (an element inserted after load binds immediately)
        this._rebind();
    }

    disconnectedCallback() {
        if (this._host && this._hostListener) {
            this._host.removeEventListener('ready', this._hostListener);
        }
        this._host = null;
        this._hostListener = null;

        // Removal reverts: the model owns the node, so the entity is left as authored. Children
        // clean up through their own disconnect behavior.
        this._unbind();
        this._state = 'pending';
    }

    /**
     * Re-resolves the binding against the host's current hierarchy: on connection, on a `name`
     * or `index` change, and on every host cycle (a model [re]instantiating, an enclosing
     * `pc-node` [re]binding). When re-resolution yields the entity already bound, the binding
     * is retained untouched — a redundant edit must not flicker overrides through a revert.
     */
    private _rebind() {
        const hostEntity = this._host?.entity ?? null;

        if (!hostEntity || !this._name) {
            // Host not instantiated (or nothing to look up yet): return to pending. An assigned
            // name arriving later, or the host's next cycle, resolves it.
            this._unbind();
            this._state = 'pending';
            return;
        }

        const target = this._resolve(hostEntity);

        if (target && target === this._entity) {
            this._path = this._pathOf(target, hostEntity);
            return;
        }

        this._unbind();

        if (!target) {
            // _resolve warned and set the failure state
            return;
        }

        this._bind(target, hostEntity);
    }

    /**
     * Resolves `name` (and `index`) to an entity under `hostEntity`, warning and recording the
     * failure state when it cannot.
     *
     * @param hostEntity - The root of the search.
     * @returns The resolved entity, or `null`.
     */
    private _resolve(hostEntity: Entity): Entity | null {
        const matches = hostEntity.find((node: GraphNode) => node.name === this._name) as Entity[];

        if (matches.length === 0) {
            const closest = this._closestName(hostEntity);
            const hint = closest ? ` - closest match: '${closest}'` : '';
            console.warn(`pc-node '${this._name}' not found in ${this._describeHost()}${hint}`);
            this._state = 'missing';
            return null;
        }

        let target: Entity;
        if (this._index !== null) {
            if (this._index >= matches.length) {
                console.warn(
                    `pc-node '${this._name}' index ${this._index} is out of range - ${matches.length} match(es) in ${this._describeHost()}`
                );
                this._state = 'missing';
                return null;
            }
            target = matches[this._index];
        } else if (matches.length > 1) {
            // Ambiguity binds nothing: a fallback guess performs side effects on the wrong
            // scene node, and would go wrong silently when a re-export introduces a duplicate
            // name. The candidates tell the author exactly what to write.
            const candidates = matches.map((m, i) => `[${i}] ${this._pathOf(m, hostEntity)}`).join(', ');
            console.warn(
                `pc-node '${this._name}' is ambiguous in ${this._describeHost()} - specify index: ${candidates}`
            );
            this._state = 'ambiguous';
            return null;
        } else {
            target = matches[0];
        }

        const owner = this.closestApp?.elementFromEntity(target);
        if (owner && owner !== this) {
            console.warn(
                `pc-node '${this._name}' resolves to a node already bound by another element - element ignored`
            );
            this._state = 'duplicate';
            return null;
        }

        return target;
    }

    /**
     * Binds `target`: registers it (making it a pick target), hooks its destruction, applies
     * this element's overrides, announces readiness and builds the deferred child subtree.
     *
     * @param target - The entity to bind.
     * @param hostEntity - The search root, for the path.
     */
    private _bind(target: Entity, hostEntity: Entity) {
        this._entity = target;
        this._registerEntity(target);
        this._destroyHandle = target.once('destroy', this._onEntityDestroy, this);
        this._state = 'bound';
        this._path = this._pathOf(target, hostEntity);

        this._applyOverrides();
        this._onReady();
        this._buildChildren();
    }

    /**
     * Dissolves the current binding, restoring every authored value this element's overrides
     * displaced and destroying the entities its child `pc-entity` elements created (they are
     * re-created against the next binding). Safe to call in any state.
     */
    private _unbind() {
        const entity = this._entity;
        if (!entity) {
            return;
        }

        this._revertOverrides();

        // Attachment points anchor to the bound node, so they cannot outlive the binding. Each
        // destroyed entity resets its element, which the next _buildChildren re-creates.
        this.querySelectorAll<EntityElement>('pc-entity').forEach((child) => {
            child.entity?.destroy();
        });

        this._destroyHandle?.off();
        this._destroyHandle = null;
        this._unregisterEntity(entity);
        this._entity = null;
        this._path = null;
        this._authored = {};
        this._resetReady();
    }

    /**
     * Handles the destruction of the bound entity - its model unloading, reloading, or a script
     * destroying it. There is nothing to revert on a destroyed entity; the element returns to
     * pending and the host's next cycle re-resolves it.
     */
    private _onEntityDestroy(entity: Entity) {
        this._destroyHandle = null;
        this._unregisterEntity(entity);
        this._entity = null;
        this._path = null;
        this._authored = {};
        this._state = 'pending';
        this._resetReady();
    }

    /**
     * Creates and parents the entities of child `pc-entity` elements - the attachment points.
     * Mirrors the runtime-insertion path in EntityElement.connectedCallback: children were
     * deferred while this host was unresolved (or reset when a previous binding dissolved), and
     * build here once it binds.
     */
    private _buildChildren() {
        const app = this.closestApp?.app;
        if (!app) {
            return;
        }
        const childEntities = this.querySelectorAll<EntityElement>('pc-entity');
        childEntities.forEach((child) => {
            child._createEntity(app);
        });
        childEntities.forEach((child) => {
            child._buildHierarchy(app);
        });
    }

    /**
     * Applies every override that is explicitly set, capturing the authored value it displaces.
     */
    private _applyOverrides() {
        if (this._enabled !== null) {
            this.enabled = this._enabled;
        }
        if (this._position !== null) {
            this.position = this._position;
        }
        if (this._rotation !== null) {
            this.rotation = this._rotation;
        }
        if (this._scale !== null) {
            this.scale = this._scale;
        }
        if (this._tags !== null) {
            this.tags = this._tags;
        }
    }

    /**
     * Restores every authored value this element's overrides displaced. The override values
     * themselves are kept - they re-apply on the next binding.
     */
    private _revertOverrides() {
        const entity = this._entity!;
        const authored = this._authored;
        if (authored.enabled !== undefined) {
            entity.enabled = authored.enabled;
        }
        if (authored.position) {
            entity.setLocalPosition(authored.position);
        }
        if (authored.rotation) {
            entity.setLocalRotation(authored.rotation);
        }
        if (authored.scale) {
            entity.setLocalScale(authored.scale);
        }
        if (authored.tags) {
            entity.tags.clear();
            entity.tags.add(authored.tags);
        }
        this._authored = {};
    }

    /**
     * Renders the path of `node` below `root`, for the `path` property and the resolution
     * warnings.
     *
     * @param node - The node to describe.
     * @param root - The search root.
     * @returns The `/`-separated path.
     */
    private _pathOf(node: GraphNode, root: GraphNode): string {
        const parts: string[] = [];
        for (let current: GraphNode | null = node; current && current !== root; current = current.parent) {
            parts.unshift(current.name);
        }
        return parts.join('/') || node.name;
    }

    /**
     * Describes the search root for warnings: the model's asset id, or the enclosing node's
     * name.
     * @returns The description.
     */
    private _describeHost(): string {
        if (this._host instanceof ModelElement) {
            return `model '${this._host.asset}'`;
        }
        return `pc-node '${this._host?.name ?? ''}' subtree`;
    }

    /**
     * Finds the node name nearest to the missing `name`, for the miss warning. The names are
     * already in hand from resolution, so the suggestion is nearly free.
     *
     * @param hostEntity - The root of the search.
     * @returns The closest name within an edit distance of 2, or `null`.
     */
    private _closestName(hostEntity: Entity): string | null {
        let best: string | null = null;
        let bestDistance = 3;
        hostEntity.find((node: GraphNode) => {
            const distance = levenshtein(this._name, node.name);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = node.name;
            }
            return false;
        });
        return best;
    }

    /**
     * Sets the name of the node to bind. A change retargets: the current binding's overrides
     * revert and the new name resolves afresh. `name` on a `pc-node` is never a rename of the
     * authored node - it is only ever a reference.
     * @param value - The node name.
     */
    set name(value: string) {
        this._name = value;
        if (this.isConnected && this._host) {
            this._rebind();
        }
    }

    /**
     * Gets the name of the node to bind.
     * @returns The node name.
     */
    get name(): string {
        return this._name;
    }

    /**
     * Sets which match to bind when `name` matches more than one node, 0-based in depth-first
     * order. A change retargets, like `name`. `null` means unset - required when the name is
     * ambiguous, optional otherwise.
     * @param value - The match index, or `null`.
     */
    set index(value: number | null) {
        this._index = value;
        if (this.isConnected && this._host) {
            this._rebind();
        }
    }

    /**
     * Gets which match to bind.
     * @returns The match index, or `null` when unset.
     */
    get index(): number | null {
        return this._index;
    }

    /**
     * Sets the enabled override. `null` clears it, restoring the authored state.
     * @param value - The enabled state, or `null`.
     */
    set enabled(value: boolean | null) {
        this._enabled = value;
        const entity = this._state === 'bound' ? this._entity : null;
        if (!entity) {
            return;
        }
        if (value !== null) {
            this._authored.enabled ??= entity.enabled;
            entity.enabled = value;
        } else if (this._authored.enabled !== undefined) {
            entity.enabled = this._authored.enabled;
            delete this._authored.enabled;
        }
    }

    /**
     * Gets the enabled override.
     * @returns The enabled state, or `null` while no override is set.
     */
    get enabled(): boolean | null {
        return this._enabled;
    }

    /**
     * Sets the local position override. `null` clears it, restoring the authored position.
     * @param value - The position, or `null`.
     */
    set position(value: Vec3 | null) {
        this._position = value;
        const entity = this._state === 'bound' ? this._entity : null;
        if (!entity) {
            return;
        }
        if (value !== null) {
            this._authored.position ??= entity.getLocalPosition().clone();
            entity.setLocalPosition(value);
        } else if (this._authored.position) {
            entity.setLocalPosition(this._authored.position);
            delete this._authored.position;
        }
    }

    /**
     * Gets the local position override.
     * @returns The position, or `null` while no override is set.
     */
    get position(): Vec3 | null {
        return this._position;
    }

    /**
     * Sets the local rotation override, as Euler angles in degrees. `null` clears it, restoring
     * the authored rotation.
     * @param value - The rotation, or `null`.
     */
    set rotation(value: Vec3 | null) {
        this._rotation = value;
        const entity = this._state === 'bound' ? this._entity : null;
        if (!entity) {
            return;
        }
        if (value !== null) {
            // The authored rotation is cached as a quaternion: it restores exactly, where a
            // round trip through Euler angles need not.
            this._authored.rotation ??= entity.getLocalRotation().clone();
            entity.setLocalEulerAngles(value);
        } else if (this._authored.rotation) {
            entity.setLocalRotation(this._authored.rotation);
            delete this._authored.rotation;
        }
    }

    /**
     * Gets the local rotation override.
     * @returns The rotation, or `null` while no override is set.
     */
    get rotation(): Vec3 | null {
        return this._rotation;
    }

    /**
     * Sets the local scale override. `null` clears it, restoring the authored scale.
     * @param value - The scale, or `null`.
     */
    set scale(value: Vec3 | null) {
        this._scale = value;
        const entity = this._state === 'bound' ? this._entity : null;
        if (!entity) {
            return;
        }
        if (value !== null) {
            this._authored.scale ??= entity.getLocalScale().clone();
            entity.setLocalScale(value);
        } else if (this._authored.scale) {
            entity.setLocalScale(this._authored.scale);
            delete this._authored.scale;
        }
    }

    /**
     * Gets the local scale override.
     * @returns The scale, or `null` while no override is set.
     */
    get scale(): Vec3 | null {
        return this._scale;
    }

    /**
     * Sets the tags override. `null` clears it, restoring the authored tags.
     * @param value - The tags, or `null`.
     */
    set tags(value: string[] | null) {
        this._tags = value;
        const entity = this._state === 'bound' ? this._entity : null;
        if (!entity) {
            return;
        }
        if (value !== null) {
            this._authored.tags ??= entity.tags.list().slice();
            entity.tags.clear();
            entity.tags.add(value);
        } else if (this._authored.tags) {
            entity.tags.clear();
            entity.tags.add(this._authored.tags);
            delete this._authored.tags;
        }
    }

    /**
     * Gets the tags override.
     * @returns The tags, or `null` while no override is set.
     */
    get tags(): string[] | null {
        return this._tags;
    }

    static get observedAttributes() {
        return ['enabled', 'index', 'name', 'position', 'rotation', 'scale', 'tags', ...POINTER_ATTRIBUTES];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue === null ? null : parseBool(newValue, true);
                break;
            case 'index':
                if (newValue === null) {
                    this.index = null;
                } else {
                    // Number('') is 0, which would make index="" silently mean the first match
                    const index = newValue.trim() === '' ? NaN : Number(newValue);
                    if (!Number.isInteger(index) || index < 0) {
                        // Invalid values are treated as absent: under ambiguity that means
                        // unbound, the fail-safe direction.
                        console.warn(`pc-node index '${newValue}' is not a non-negative integer - treated as absent`);
                        this.index = null;
                    } else {
                        this.index = index;
                    }
                }
                break;
            case 'name':
                this.name = newValue ?? '';
                break;
            case 'position':
                this.position = newValue === null ? null : parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'rotation':
                this.rotation = newValue === null ? null : parseVec3(newValue, Vec3.ZERO, name);
                break;
            case 'scale':
                this.scale = newValue === null ? null : parseVec3(newValue, Vec3.ONE, name);
                break;
            case 'tags':
                this.tags = newValue === null ? null : parseTags(newValue);
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

customElements.define('pc-node', NodeElement);

export { NodeElement };
