import type { LayoutGroupComponent } from 'playcanvas';
import {
    FITTING_NONE,
    FITTING_STRETCH,
    FITTING_SHRINK,
    FITTING_BOTH,
    ORIENTATION_HORIZONTAL,
    ORIENTATION_VERTICAL,
    Vec2,
    Vec4
} from 'playcanvas';

import { parseBool, parseEnum, parseVec2, parseVec4 } from '../parse';

import { ComponentElement } from './component';

const orientations = new Map<'horizontal' | 'vertical', number>([
    ['horizontal', ORIENTATION_HORIZONTAL],
    ['vertical', ORIENTATION_VERTICAL]
]);

const fittings = new Map<'none' | 'stretch' | 'shrink' | 'both', number>([
    ['none', FITTING_NONE],
    ['stretch', FITTING_STRETCH],
    ['shrink', FITTING_SHRINK],
    ['both', FITTING_BOTH]
]);

/**
 * The LayoutGroupComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-layout-group/ | `<pc-layout-group>`} elements.
 * The LayoutGroupComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link LayoutGroupComponent} (`layoutgroup`).
 *
 * @elementSummary The `<pc-layout-group>` element arranges its entity's children in a row or
 * column, with spacing, padding, alignment and fitting. Must be a child of a `<pc-entity>`,
 * `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class LayoutGroupComponentElement extends ComponentElement {
    private _orientation: 'horizontal' | 'vertical' = 'horizontal';

    private _reverseX = false;

    private _reverseY = false;

    private _alignment = new Vec2(0, 1);

    private _padding = new Vec4(0, 0, 0, 0);

    private _spacing = new Vec2(0, 0);

    private _widthFitting: 'none' | 'stretch' | 'shrink' | 'both' = 'none';

    private _heightFitting: 'none' | 'stretch' | 'shrink' | 'both' = 'none';

    private _wrap = false;

    /** @ignore */
    constructor() {
        super('layoutgroup');
    }

    protected getInitialComponentData() {
        return {
            orientation: orientations.get(this._orientation),
            reverseX: this._reverseX,
            reverseY: this._reverseY,
            alignment: this._alignment,
            padding: this._padding,
            spacing: this._spacing,
            widthFitting: fittings.get(this._widthFitting),
            heightFitting: fittings.get(this._heightFitting),
            wrap: this._wrap
        };
    }

    /**
     * Gets the underlying PlayCanvas layout group component.
     * @returns The layout group component.
     */
    get component(): LayoutGroupComponent {
        return super.component as LayoutGroupComponent;
    }

    /**
     * Sets the orientation of the layout group. Can be `horizontal` or `vertical`. Defaults to
     * `horizontal`.
     * @param value - The orientation.
     */
    set orientation(value: 'horizontal' | 'vertical') {
        this._orientation = value;
        if (this.component) {
            this.component.orientation = orientations.get(value) ?? ORIENTATION_HORIZONTAL;
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
     * Sets the fitting mode along the horizontal axis. Can be `none`, `stretch`, `shrink` or
     * `both`. Defaults to `none`.
     * @param value - The width fitting mode.
     */
    set widthFitting(value: 'none' | 'stretch' | 'shrink' | 'both') {
        this._widthFitting = value;
        if (this.component) {
            this.component.widthFitting = fittings.get(value) ?? FITTING_NONE;
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
     * Sets the fitting mode along the vertical axis. Can be `none`, `stretch`, `shrink` or
     * `both`. Defaults to `none`.
     * @param value - The height fitting mode.
     */
    set heightFitting(value: 'none' | 'stretch' | 'shrink' | 'both') {
        this._heightFitting = value;
        if (this.component) {
            this.component.heightFitting = fittings.get(value) ?? FITTING_NONE;
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

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'orientation':
                this.orientation = parseEnum(newValue, orientations, 'horizontal', name);
                break;
            case 'reverse-x':
                this.reverseX = parseBool(newValue, false);
                break;
            case 'reverse-y':
                this.reverseY = parseBool(newValue, false);
                break;
            case 'alignment':
                this.alignment = parseVec2(newValue, new Vec2(0, 1), name);
                break;
            case 'padding':
                this.padding = parseVec4(newValue, Vec4.ZERO, name);
                break;
            case 'spacing':
                this.spacing = parseVec2(newValue, Vec2.ZERO, name);
                break;
            case 'width-fitting':
                this.widthFitting = parseEnum(newValue, fittings, 'none', name);
                break;
            case 'height-fitting':
                this.heightFitting = parseEnum(newValue, fittings, 'none', name);
                break;
            case 'wrap':
                this.wrap = parseBool(newValue, false);
                break;
        }
    }
}

customElements.define('pc-layout-group', LayoutGroupComponentElement);

export { LayoutGroupComponentElement };
