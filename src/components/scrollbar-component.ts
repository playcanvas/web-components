import { ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL, ScrollbarComponent } from 'playcanvas';

import { ComponentElement } from './component';
import { getEntity, parseEnum } from '../utils';

const orientations = new Map<string, number>([
    ['horizontal', ORIENTATION_HORIZONTAL],
    ['vertical', ORIENTATION_VERTICAL]
]);

/**
 * The ScrollbarComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scrollbar/ | `<pc-scrollbar>`} elements.
 * The ScrollbarComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScrollbarComponentElement extends ComponentElement {
    private _orientation: number = ORIENTATION_HORIZONTAL;

    private _value = 0;

    private _handleSize = 0.5;

    private _handle = '';

    /** @ignore */
    constructor() {
        super('scrollbar');
    }

    getInitialComponentData() {
        const data: Record<string, any> = {
            orientation: this._orientation,
            value: this._value,
            handleSize: this._handleSize
        };

        const handle = getEntity(this._handle);
        if (handle) {
            data.handleEntity = handle;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas scrollbar component.
     * @returns The scrollbar component.
     */
    get component(): ScrollbarComponent | null {
        return super.component as ScrollbarComponent | null;
    }

    /**
     * Sets the orientation of the scrollbar. Can be `horizontal` (0) or `vertical` (1).
     * @param value - The orientation.
     */
    set orientation(value: number) {
        this._orientation = value;
        if (this.component) {
            this.component.orientation = value;
        }
    }

    /**
     * Gets the orientation of the scrollbar.
     * @returns The orientation.
     */
    get orientation() {
        return this._orientation;
    }

    /**
     * Sets the current position value of the scrollbar, in the range 0 to 1.
     * @param value - The scrollbar value.
     */
    set value(value: number) {
        this._value = value;
        if (this.component) {
            this.component.value = value;
        }
    }

    /**
     * Gets the current position value of the scrollbar.
     * @returns The scrollbar value.
     */
    get value() {
        return this._value;
    }

    /**
     * Sets the size of the handle relative to the size of the track, in the range 0 to 1.
     * @param value - The handle size.
     */
    set handleSize(value: number) {
        this._handleSize = value;
        if (this.component) {
            this.component.handleSize = value;
        }
    }

    /**
     * Gets the size of the handle relative to the size of the track.
     * @returns The handle size.
     */
    get handleSize() {
        return this._handleSize;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` used as the
     * scrollbar handle.
     * @param value - The handle entity reference.
     */
    set handle(value: string) {
        this._handle = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.handleEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` used as the scrollbar handle.
     * @returns The handle entity reference.
     */
    get handle() {
        return this._handle;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'orientation',
            'value',
            'handle-size',
            'handle'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'orientation':
                this.orientation = parseEnum(newValue, orientations, ORIENTATION_HORIZONTAL);
                break;
            case 'value':
                this.value = Number(newValue);
                break;
            case 'handle-size':
                this.handleSize = Number(newValue);
                break;
            case 'handle':
                this.handle = newValue;
                break;
        }
    }
}

customElements.define('pc-scrollbar', ScrollbarComponentElement);

export { ScrollbarComponentElement };
