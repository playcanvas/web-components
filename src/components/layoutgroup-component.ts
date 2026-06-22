import { FITTING_NONE, FITTING_STRETCH, FITTING_SHRINK, FITTING_BOTH, LayoutGroupComponent, ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL, Vec2, Vec4 } from 'playcanvas';

import { ComponentElement } from './component';
import { parseEnum, parseVec2, parseVec4 } from '../utils';

const orientations = new Map<string, number>([
    ['horizontal', ORIENTATION_HORIZONTAL],
    ['vertical', ORIENTATION_VERTICAL]
]);

const fittings = new Map<string, number>([
    ['none', FITTING_NONE],
    ['stretch', FITTING_STRETCH],
    ['shrink', FITTING_SHRINK],
    ['both', FITTING_BOTH]
]);

/**
 * The LayoutGroupComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-layoutgroup/ | `<pc-layoutgroup>`} elements.
 * The LayoutGroupComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class LayoutGroupComponentElement extends ComponentElement {
    private _orientation: number = ORIENTATION_HORIZONTAL;

    private _reverseX = false;

    private _reverseY = false;

    private _alignment = new Vec2(0, 1);

    private _padding = new Vec4(0, 0, 0, 0);

    private _spacing = new Vec2(0, 0);

    private _widthFitting: number = FITTING_NONE;

    private _heightFitting: number = FITTING_NONE;

    private _wrap = false;

    /** @ignore */
    constructor() {
        super('layoutgroup');
    }

    getInitialComponentData() {
        return {
            orientation: this._orientation,
            reverseX: this._reverseX,
            reverseY: this._reverseY,
            alignment: this._alignment,
            padding: this._padding,
            spacing: this._spacing,
            widthFitting: this._widthFitting,
            heightFitting: this._heightFitting,
            wrap: this._wrap
        };
    }

    /**
     * Gets the underlying PlayCanvas layout group component.
     * @returns The layout group component.
     */
    get component(): LayoutGroupComponent | null {
        return super.component as LayoutGroupComponent | null;
    }

    /**
     * Sets the orientation of the layout group. Can be `horizontal` (0) or `vertical` (1).
     * @param value - The orientation.
     */
    set orientation(value: number) {
        this._orientation = value;
        if (this.component) {
            this.component.orientation = value;
        }
    }

    /**
     * Gets the orientation of the layout group.
     * @returns The orientation.
     */
    get orientation() {
        return this._orientation;
    }

    /**
     * Sets whether the order of children is reversed along the horizontal axis.
     * @param value - Whether to reverse the horizontal order.
     */
    set reverseX(value: boolean) {
        this._reverseX = value;
        if (this.component) {
            this.component.reverseX = value;
        }
    }

    /**
     * Gets whether the order of children is reversed along the horizontal axis.
     * @returns Whether the horizontal order is reversed.
     */
    get reverseX() {
        return this._reverseX;
    }

    /**
     * Sets whether the order of children is reversed along the vertical axis.
     * @param value - Whether to reverse the vertical order.
     */
    set reverseY(value: boolean) {
        this._reverseY = value;
        if (this.component) {
            this.component.reverseY = value;
        }
    }

    /**
     * Gets whether the order of children is reversed along the vertical axis.
     * @returns Whether the vertical order is reversed.
     */
    get reverseY() {
        return this._reverseY;
    }

    /**
     * Sets the horizontal and vertical alignment of the child elements (each component 0 to 1).
     * @param value - The alignment.
     */
    set alignment(value: Vec2) {
        this._alignment = value;
        if (this.component) {
            this.component.alignment = value;
        }
    }

    /**
     * Gets the alignment of the child elements.
     * @returns The alignment.
     */
    get alignment() {
        return this._alignment;
    }

    /**
     * Sets the padding around the layout group, as a Vec4 (left, bottom, right, top).
     * @param value - The padding.
     */
    set padding(value: Vec4) {
        this._padding = value;
        if (this.component) {
            this.component.padding = value;
        }
    }

    /**
     * Gets the padding around the layout group.
     * @returns The padding.
     */
    get padding() {
        return this._padding;
    }

    /**
     * Sets the spacing between child elements, as a Vec2 (x, y).
     * @param value - The spacing.
     */
    set spacing(value: Vec2) {
        this._spacing = value;
        if (this.component) {
            this.component.spacing = value;
        }
    }

    /**
     * Gets the spacing between child elements.
     * @returns The spacing.
     */
    get spacing() {
        return this._spacing;
    }

    /**
     * Sets the fitting mode along the horizontal axis. Can be `none` (0), `stretch` (1), `shrink`
     * (2) or `both` (3).
     * @param value - The width fitting mode.
     */
    set widthFitting(value: number) {
        this._widthFitting = value;
        if (this.component) {
            this.component.widthFitting = value;
        }
    }

    /**
     * Gets the fitting mode along the horizontal axis.
     * @returns The width fitting mode.
     */
    get widthFitting() {
        return this._widthFitting;
    }

    /**
     * Sets the fitting mode along the vertical axis. Can be `none` (0), `stretch` (1), `shrink` (2)
     * or `both` (3).
     * @param value - The height fitting mode.
     */
    set heightFitting(value: number) {
        this._heightFitting = value;
        if (this.component) {
            this.component.heightFitting = value;
        }
    }

    /**
     * Gets the fitting mode along the vertical axis.
     * @returns The height fitting mode.
     */
    get heightFitting() {
        return this._heightFitting;
    }

    /**
     * Sets whether children wrap onto a new line/column when they overflow the group.
     * @param value - Whether to wrap children.
     */
    set wrap(value: boolean) {
        this._wrap = value;
        if (this.component) {
            this.component.wrap = value;
        }
    }

    /**
     * Gets whether children wrap onto a new line/column when they overflow the group.
     * @returns Whether children wrap.
     */
    get wrap() {
        return this._wrap;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'orientation',
            'reverse-x',
            'reverse-y',
            'alignment',
            'padding',
            'spacing',
            'width-fitting',
            'height-fitting',
            'wrap'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'orientation':
                this.orientation = parseEnum(newValue, orientations, ORIENTATION_HORIZONTAL);
                break;
            case 'reverse-x':
                this.reverseX = newValue !== 'false';
                break;
            case 'reverse-y':
                this.reverseY = newValue !== 'false';
                break;
            case 'alignment':
                this.alignment = parseVec2(newValue);
                break;
            case 'padding':
                this.padding = parseVec4(newValue);
                break;
            case 'spacing':
                this.spacing = parseVec2(newValue);
                break;
            case 'width-fitting':
                this.widthFitting = parseEnum(newValue, fittings, FITTING_NONE);
                break;
            case 'height-fitting':
                this.heightFitting = parseEnum(newValue, fittings, FITTING_NONE);
                break;
            case 'wrap':
                this.wrap = newValue !== 'false';
                break;
        }
    }
}

customElements.define('pc-layoutgroup', LayoutGroupComponentElement);

export { LayoutGroupComponentElement };
