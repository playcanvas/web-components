import { Vec3 } from 'playcanvas';

import { POINTER_ATTRIBUTES } from './entity-base';
import { buildDescendantEntities, EntityOwnerElement } from './entity-owner';
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
 * @attribute {boolean} enabled - The enabled state of the entity.
 * @attribute {string} name - The name of the entity.
 * @attribute {string} position - The position of the entity.
 * @attribute {string} rotation - The rotation of the entity.
 * @attribute {string} scale - The scale of the entity.
 * @attribute {string} tags - The tags of the entity.
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
