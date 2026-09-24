import { Vec3 } from 'playcanvas';

import { buildDescendantEntities, EntityOwnerElement } from './entity-owner';
import { parseBool, parseTags, parseVec3 } from './parse';

/**
 * The EntityElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-entity/ | `<pc-entity>`} elements.
 * The EntityElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The pointer events below are dispatched by the containing `<pc-app>` element when the pointer
 * is over this entity's geometry, and behave like the DOM's own pointer events: each targets the
 * element fronting the deepest node under the pointer and propagates up the element tree, so a
 * listener on an ancestor entity, or on `<pc-scene>`, also receives the events of the entities
 * below it. `pointerenter` and `pointerleave` do not bubble - they are dispatched to each element
 * the pointer moves onto or off. `<pc-app>` picks the scene for an event type while a listener for
 * it is registered on an entity element or on `<pc-scene>`; its `picking` attribute covers
 * listeners it cannot see, such as a framework's delegated handlers.
 *
 * @elementSummary The `<pc-entity>` element creates an entity: a named, transformable node of the
 * scene hierarchy, and the host for component elements such as `<pc-camera>`, `<pc-light>` and
 * `<pc-render>`. Place it in the `<pc-scene>`, or nest it under another `<pc-entity>`, a
 * `<pc-model>` or a `<pc-node>` to parent it there.
 *
 * @attribute {boolean} enabled - The enabled state of the entity.
 * @attribute {string} name - The name of the entity.
 * @attribute {string} position - The position of the entity.
 * @attribute {string} rotation - The rotation of the entity.
 * @attribute {string} scale - The scale of the entity.
 * @attribute {string} tags - The tags of the entity.
 * @attribute {string} onpointerover - Script to run when the pointer moves onto the entity, or onto
 * an entity below it.
 * @attribute {string} onpointerenter - Script to run when the pointer moves onto the entity or an
 * entity below it, having been over none of them.
 * @attribute {string} onpointermove - Script to run when the pointer moves over the entity.
 * @attribute {string} onpointerdown - Script to run when a pointer button is pressed over the
 * entity.
 * @attribute {string} onpointerup - Script to run when a pointer button is released over the
 * entity.
 * @attribute {string} onpointercancel - Script to run when the browser cancels a press that began
 * over the entity, for example because a touch became a scroll.
 * @attribute {string} onpointerout - Script to run when the pointer moves off the entity, or off an
 * entity below it.
 * @attribute {string} onpointerleave - Script to run when the pointer moves off the entity and
 * every entity below it.
 * @attribute {string} onclick - Script to run when the entity is clicked: a primary pointer button
 * pressed and then released over it.
 * @fires {PointerEvent} pointerover - Fired when the pointer moves onto the entity. Bubbles;
 * `relatedTarget` is the element the pointer came from, which is `<pc-app>` when it came from the
 * background.
 * @fires {PointerEvent} pointerenter - Fired when the pointer moves onto the entity or an entity
 * below it, having been over none of them. Does not bubble.
 * @fires {PointerEvent} pointermove - Fired when the pointer moves over the entity.
 * @fires {PointerEvent} pointerdown - Fired when a pointer button is pressed over the entity.
 * @fires {PointerEvent} pointerup - Fired when a pointer button is released over the entity.
 * @fires {PointerEvent} pointercancel - Fired on the entity a press began over when the browser
 * cancels that press, for example because a touch became a scroll. No click follows.
 * @fires {PointerEvent} pointerout - Fired when the pointer moves off the entity. Bubbles;
 * `relatedTarget` is the element the pointer went to, which is `<pc-app>` when it went to the
 * background.
 * @fires {PointerEvent} pointerleave - Fired when the pointer moves off the entity and every entity
 * below it. Does not bubble.
 * @fires {PointerEvent} click - Fired when a primary pointer button is pressed and then released
 * over the entity. A press and release that picked different elements fires on their nearest common
 * ancestor instead, as in the DOM. `detail` carries the click count, so a double click arrives as a
 * click whose `detail` is 2.
 *
 * @category Entities
 */
class EntityElement extends EntityOwnerElement {
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

            // Handle any child entities that might exist. A build that deferred (an unresolved
            // pc-node above) defers the whole subtree with it - the node's bind sweeps it.
            if (this._built) {
                buildDescendantEntities(this, app);
            }
        }
    }

    disconnectedCallback() {
        // Destroying the entity destroys its whole subtree, and the engine fires 'destroy' for
        // every entity in it - so _onEntityDestroy resets this element AND every descendant
        // element before the descendants' own disconnectedCallbacks run. Their entities are null
        // by then, making this call a no-op for them.
        this._entity?.destroy();
    }

    static get observedAttributes() {
        return ['enabled', 'name', 'position', 'rotation', 'scale', 'tags'];
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
        }
    }
}

customElements.define('pc-entity', EntityElement);

export { EntityElement };
