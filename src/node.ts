import type { Entity, EventHandle, GraphNode, Material, MeshInstance, Quat, RenderComponent } from 'playcanvas';
import { Vec3 } from 'playcanvas';

import { ComponentElement } from './components/component';
import { EntityBaseElement, POINTER_ATTRIBUTES } from './entity-base';
import { buildDescendantEntities } from './entity-owner';
import type { EntityOwnerElement } from './entity-owner';
import { MaterialElement } from './material';
import { ModelElement } from './model';
import { parseBool, parseTags, parseVec3 } from './parse';

/**
 * The binding states a `<pc-node>` element moves through. `pending` while the host has not yet
 * instantiated (or no `name` is assigned), `bound` once a node has been resolved and decorated,
 * `missing`/`ambiguous`/`duplicate` when resolution failed — each accompanied by a warning
 * naming the cause.
 */
export type NodeBindingState = 'pending' | 'bound' | 'missing' | 'ambiguous' | 'duplicate';

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
 * A sparse mapping from selector to `pc-material` id, as carried by the `material-overrides`
 * attribute and `materialOverrides` property. A `name:X` key selects every mesh instance of the
 * bound node's render component whose baseline material is named `X`; an `index:N` key selects
 * mesh instance `N` and wins over a name rule for the same instance.
 */
type MaterialOverrides = Readonly<Record<string, string>>;

/**
 * One baseline assignment, captured for every mesh instance of the authored render component
 * when the first material override applies: the mesh instance, the material it displaced, and
 * that material's name at capture time — the name `name:` selectors match, immune to later
 * renames. `material` is `null` when a script had already cleared the assignment.
 */
type BaselineAssignment = {
    meshInstance: MeshInstance;
    material: Material | null;
    name: string | null;
};

/** One selector of a material-overrides mapping, in parsed form. */
type MaterialRule = { kind: 'name'; name: string; id: string } | { kind: 'index'; index: number; id: string };

/**
 * Parses one mapping into its valid rules, warning for each entry that is not one: an unknown
 * or missing selector prefix, an empty `name:` value, an `index:` value that is not a
 * non-negative integer, or a replacement id that is not a non-empty string. An invalid rule
 * behaves exactly as if absent from the mapping.
 *
 * @param overrides - The mapping to parse.
 * @param label - The element description for warnings.
 * @returns The valid rules.
 */
const parseMaterialRules = (overrides: MaterialOverrides, label: string): MaterialRule[] => {
    const rules: MaterialRule[] = [];
    for (const [selector, id] of Object.entries(overrides)) {
        if (typeof id !== 'string' || id === '') {
            console.warn(`${label} material-overrides '${selector}' needs a pc-material id - rule ignored`);
        } else if (selector.startsWith('name:')) {
            // The text after the prefix is the selector value, exactly as written - a material
            // name may legitimately begin or end with whitespace
            const name = selector.slice('name:'.length);
            if (name === '') {
                console.warn(`${label} material-overrides 'name:' selector is empty - rule ignored`);
            } else {
                rules.push({ kind: 'name', name, id });
            }
        } else if (selector.startsWith('index:')) {
            // Whitespace around the number is tolerated; Number('') is 0, so blank means NaN
            const text = selector.slice('index:'.length).trim();
            const index = text === '' ? NaN : Number(text);
            if (!Number.isInteger(index) || index < 0) {
                console.warn(
                    `${label} material-overrides '${selector}' is not a non-negative integer index - rule ignored`
                );
            } else {
                rules.push({ kind: 'index', index, id });
            }
        } else {
            console.warn(`${label} material-overrides '${selector}' has no 'name:' or 'index:' prefix - rule ignored`);
        }
    }
    return rules;
};

/**
 * Parses the material-overrides attribute text. Anything but a JSON object — malformed JSON, an
 * array, a primitive — warns and yields `null`, the absent mapping: a stale mapping must not
 * survive an attribute value the DOM no longer represents.
 *
 * @param text - The attribute text.
 * @param label - The element description for warnings.
 * @returns The mapping, or `null`.
 */
const parseMaterialOverridesAttribute = (text: string, label: string): MaterialOverrides | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        console.warn(`${label} material-overrides is not valid JSON - treated as absent: ${(error as Error).message}`);
        return null;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn(`${label} material-overrides must be a JSON object - treated as absent`);
        return null;
    }
    return parsed as MaterialOverrides;
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
 * The element becomes ready once bound, and never while unresolved — a missing or ambiguous
 * name warns and records the failure in `state`, readiness stays unresolved, and descendants
 * wait with it.
 *
 * The pointer events below are dispatched by the containing `<pc-app>` element when the pointer
 * intersects the bound node's geometry, exactly as for `<pc-entity>`.
 *
 * @elementSummary The `<pc-node>` element binds to a node inside the hierarchy a `<pc-model>`
 * instantiated and declares overrides against it: a transform, an enabled state, tags, components
 * to add, or content to attach. Its `name` is a lookup, never a rename. Must be a descendant of
 * `<pc-model>`.
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
 * @attribute {string} material-overrides - Overrides material assignments on the bound node's
 * render component, as a JSON object from selector to `pc-material` id — for example
 * `{"name:CarPaint": "candy-red", "index:7": "smoked-glass"}`. A `name:X` key selects every mesh
 * instance whose baseline material is named `X`; an `index:N` key selects mesh instance `N` and
 * wins over a name rule for the same instance. Assignments no rule matches keep their baseline
 * materials, and removing the attribute restores all of them. Use `pc-model.hierarchy()` to
 * discover the names and indices a node offers.
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

    /**
     * The model-authored render component of the bound node, recorded at bind — before child
     * decorations build — so a render component added later by a child `pc-render` can never
     * become the override target. `null` when the bound node has none.
     */
    private _authoredRender: RenderComponent | null = null;

    /**
     * The baseline assignments displaced by the material overrides, captured for every mesh
     * instance when the first non-empty mapping applies and released when the mapping goes
     * absent (restoring them) or the binding dissolves.
     */
    private _baseline: BaselineAssignment[] | null = null;

    // Override values. `null` means "no override": the authored value stays in force.

    private _enabled: boolean | null = null;

    private _position: Vec3 | null = null;

    private _rotation: Vec3 | null = null;

    private _scale: Vec3 | null = null;

    private _tags: string[] | null = null;

    private _materialOverrides: MaterialOverrides | null = null;

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
        // A model fronts a host entity of its own; the names this element resolves are the
        // asset's, so the search starts at the instantiated content root, not the wrapper.
        const host = this._host;
        const hostEntity = (host instanceof ModelElement ? host.contentEntity : host?.entity) ?? null;

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
        this._authoredRender = target.render ?? null;

        this._applyOverrides();
        this._onReady();
        this._buildChildren();
    }

    /**
     * Dissolves the current binding, restoring every authored value this element's overrides
     * displaced and removing the decorations this binding hosts: attachment entities are
     * destroyed (re-created against the next binding) and component decorations are removed
     * from the abandoned node. Both sweeps are scoped by `closestEntity`, so a still-bound
     * nested `pc-node` keeps its own decorations. Safe to call in any state.
     */
    private _unbind() {
        const entity = this._entity;
        if (!entity) {
            return;
        }

        this._revertOverrides();

        // Attachment points anchor to the bound node, so they cannot outlive the binding. Each
        // destroyed entity resets its element, which the next _buildChildren re-creates - a
        // model host among them re-instantiates its content when it rebuilds.
        this.querySelectorAll<EntityOwnerElement>('pc-entity, pc-model').forEach((child) => {
            if (child.closestEntity === this) {
                child.entity?.destroy();
            }
        });

        this._destroyHandle?.off();
        this._destroyHandle = null;
        this._unregisterEntity(entity);
        this._entity = null;
        this._path = null;
        this._authored = {};
        this._authoredRender = null;

        // Component decorations come off through the same hook the host-ready cycle uses. A
        // dissolve that never rebinds fires no ready event, so the sweep is explicit - after
        // `_entity` is cleared, so the hook sees a host without an entity.
        this.querySelectorAll('*').forEach((child) => {
            if (child instanceof ComponentElement && child.closestEntity === this) {
                child._hostCycled();
            }
        });

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
        this._authoredRender = null;
        // The mesh instances died with the entity - the capture is dropped, not restored
        this._baseline = null;
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
        buildDescendantEntities(this, app);
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
        if (this._materialOverrides !== null) {
            this._applyMaterialOverrides();
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
        this._restoreBaseline();
    }

    /**
     * Applies the material mapping to the authored render component: parse the mapping's valid
     * rules, capture the baseline on first application, then recompute every assignment from
     * that baseline - name rules write over it, index rules write over them, so `index:` wins -
     * and assign whatever changed. An absent mapping, or one with no valid rules, restores the
     * baseline instead. Called while bound, from `_applyOverrides` and the property setter.
     */
    private _applyMaterialOverrides() {
        const label = `pc-node '${this._name}'`;

        const rules = this._materialOverrides ? parseMaterialRules(this._materialOverrides, label) : [];
        if (rules.length === 0) {
            this._restoreBaseline();
            return;
        }

        if (!this._baseline) {
            if (!this._authoredRender) {
                console.warn(
                    `${label} is bound to a node without an authored render component - material-overrides ignored`
                );
                return;
            }
            this._baseline = this._authoredRender.meshInstances.map((meshInstance) => ({
                meshInstance,
                material: (meshInstance.material as Material | null) ?? null,
                name: meshInstance.material?.name ?? null
            }));
        }

        const baseline = this._baseline;

        /** Resolves a replacement id, warning when it does not resolve. */
        const resolveReplacement = (id: string): Material | null => {
            const material = MaterialElement.get(id);
            if (!material) {
                console.warn(`${label} material-overrides could not resolve pc-material '${id}' - rule ignored`);
            }
            return material ?? null;
        };

        // Recompute the whole list from the baseline: name rules write over it, index rules
        // write over them. Recomputing makes mapping edits order-independent, and a rule whose
        // replacement does not resolve simply leaves the layer below it in force.
        const resolved = baseline.map((assignment) => assignment.material);

        for (const rule of rules) {
            if (rule.kind !== 'name') {
                continue;
            }
            const material = resolveReplacement(rule.id);
            if (!material) {
                continue;
            }
            let matched = false;
            baseline.forEach((assignment, index) => {
                if (assignment.name === rule.name) {
                    resolved[index] = material;
                    matched = true;
                }
            });
            if (!matched) {
                const names = baseline.map((assignment) => `'${assignment.name}'`).join(', ');
                console.warn(
                    `${label} material-overrides 'name:${rule.name}' matches no assignment - ` +
                        `baseline names: ${names || '(none)'}`
                );
            }
        }

        for (const rule of rules) {
            if (rule.kind !== 'index') {
                continue;
            }
            if (rule.index >= baseline.length) {
                console.warn(
                    `${label} material-overrides 'index:${rule.index}' is out of range - ` +
                        `${baseline.length} assignment(s)`
                );
                continue;
            }
            const material = resolveReplacement(rule.id);
            if (material) {
                resolved[rule.index] = material;
            }
        }

        baseline.forEach((assignment, index) => {
            // The engine setter rebuilds material and shader state even for a redundant write,
            // so only actual changes are assigned
            if (assignment.meshInstance.material !== resolved[index]) {
                assignment.meshInstance.material = resolved[index] as Material;
            }
        });
    }

    /**
     * Restores every baseline assignment the material overrides displaced and releases the
     * capture, so the next non-empty mapping captures afresh. Safe to call without a capture.
     */
    private _restoreBaseline() {
        const baseline = this._baseline;
        if (!baseline) {
            return;
        }
        this._baseline = null;
        for (const assignment of baseline) {
            if (assignment.meshInstance.material !== assignment.material) {
                assignment.meshInstance.material = assignment.material as Material;
            }
        }
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

    /**
     * Sets the material overrides: a sparse mapping from selector to `pc-material` id, applied
     * to the bound node's authored render component. A `name:X` key selects every mesh instance
     * whose baseline material is named `X`; an `index:N` key selects mesh instance `N` and wins
     * over a name rule for the same instance. Assignments no rule matches keep their baseline
     * materials. `null` clears the mapping, restoring every baseline assignment.
     * @param value - The mapping, or `null`.
     */
    set materialOverrides(value: MaterialOverrides | null) {
        // Copied and frozen: later caller mutation of the passed object must not silently
        // disagree with the mapping the element applied
        this._materialOverrides = value === null ? null : Object.freeze({ ...value });
        if (this._state === 'bound') {
            this._applyMaterialOverrides();
        }
    }

    /**
     * Gets the material overrides.
     * @returns The mapping, or `null` while no override is set.
     */
    get materialOverrides(): MaterialOverrides | null {
        return this._materialOverrides;
    }

    static get observedAttributes() {
        return [
            'enabled',
            'index',
            'material-overrides',
            'name',
            'position',
            'rotation',
            'scale',
            'tags',
            ...POINTER_ATTRIBUTES
        ];
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
            case 'material-overrides':
                this.materialOverrides =
                    newValue === null ? null : parseMaterialOverridesAttribute(newValue, `pc-node '${this._name}'`);
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
export type { MaterialOverrides };
