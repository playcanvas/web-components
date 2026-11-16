import type { ScrollbarComponent } from 'playcanvas';
import { ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';
import { resolveEntity } from '../entity-reference';

import { ComponentElement } from './component';

const orientations = new Map<'horizontal' | 'vertical', number>([
    ['horizontal', ORIENTATION_HORIZONTAL],
    ['vertical', ORIENTATION_VERTICAL]
]);

/**
 * The ScrollbarComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scrollbar/ | `<pc-scrollbar>`} elements.
 * The ScrollbarComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ScrollbarComponent} (`scrollbar`).
 *
 * @elementSummary The `<pc-scrollbar>` element gives its entity a draggable handle reporting a
 * position from 0 to 1, which a `<pc-scroll-view>` references to scroll its content. Must be a
 * child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ScrollbarComponentElement extends ComponentElement<ScrollbarComponent> {
    /**
     * The size of the handle relative to the size of the track. It is in the range 0 to 1. Defaults
     * to 0.
     */
    declare handleSize: number;

    /**
     * The orientation of the scrollbar. Can be `horizontal` or `vertical`. Defaults to
     * `horizontal`.
     */
    declare orientation: 'horizontal' | 'vertical';

    /**
     * The current position value of the scrollbar. It is in the range 0 to 1.
     */
    declare value: number;

    private _handle = '';

    /** @ignore */
    constructor() {
        super('scrollbar');
    }

    protected getInitialComponentData() {
        const data: Record<string, any> = { ...super.getInitialComponentData() };

        const handle = resolveEntity(this._handle, this, 'handle', 'reference ignored');
        if (handle) {
            data.handleEntity = handle;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas scrollbar component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The scrollbar component, or `null`.
     */
    get component(): ScrollbarComponent | null {
        return super.component;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the scrollbar handle. An exact name resolves against the
     * nearest enclosing entity first, then outward, then the document. A non-empty reference that
     * does not resolve warns and is ignored.
     * @param value - The handle entity reference.
     */
    set handle(value: string) {
        this._handle = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'handle', 'reference ignored');
            if (entity) {
                this.component.handleEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the scrollbar handle.
     * @returns The handle entity reference.
     */
    get handle() {
        return this._handle;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'handle'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'handle':
                this.handle = newValue ?? '';
                break;
        }
    }
}

defineAttributes(ScrollbarComponentElement, 'component', {
    handleSize: attr.number(0),
    orientation: attr.oneOf(orientations, 'horizontal'),
    value: attr.number(0)
});

globalThis.customElements?.define('pc-scrollbar', ScrollbarComponentElement);

export { ScrollbarComponentElement };
