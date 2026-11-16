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

import { attr, defineAttributes } from '../attributes';

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
class LayoutGroupComponentElement extends ComponentElement<LayoutGroupComponent> {
    /**
     * The alignment of the child elements. It is horizontal then vertical, each from 0 to 1.
     */
    declare alignment: Vec2;

    /**
     * The fitting mode along the vertical axis. Can be `none`, `stretch`, `shrink` or `both`.
     * Defaults to `none`.
     */
    declare heightFitting: 'none' | 'stretch' | 'shrink' | 'both';

    /**
     * The orientation of the layout group. Can be `horizontal` or `vertical`. Defaults to
     * `horizontal`.
     */
    declare orientation: 'horizontal' | 'vertical';

    /**
     * The padding around the layout group. It is a Vec4: left, bottom, right, top.
     */
    declare padding: Vec4;

    /**
     * Whether the order of children is reversed along the horizontal axis.
     */
    declare reverseX: boolean;

    /**
     * Whether the order of children is reversed along the vertical axis. Defaults to true, so a
     * vertical group lays its children out from the top down.
     */
    declare reverseY: boolean;

    /**
     * The spacing between child elements. It is a Vec2: x, y.
     */
    declare spacing: Vec2;

    /**
     * The fitting mode along the horizontal axis. Can be `none`, `stretch`, `shrink` or `both`.
     * Defaults to `none`.
     */
    declare widthFitting: 'none' | 'stretch' | 'shrink' | 'both';

    /**
     * Whether children wrap onto a new line/column when they overflow the group.
     */
    declare wrap: boolean;

    /** @ignore */
    constructor() {
        super('layoutgroup');
    }

    /**
     * Gets the underlying PlayCanvas layout group component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The layout group component, or `null`.
     */
    get component(): LayoutGroupComponent | null {
        return super.component;
    }
}

defineAttributes(LayoutGroupComponentElement, 'component', {
    alignment: attr.vec2(new Vec2(0, 1)),
    heightFitting: attr.oneOf(fittings, 'none'),
    orientation: attr.oneOf(orientations, 'horizontal'),
    padding: attr.vec4(Vec4.ZERO),
    reverseX: attr.bool(false),
    reverseY: attr.bool(true),
    spacing: attr.vec2(Vec2.ZERO),
    widthFitting: attr.oneOf(fittings, 'none'),
    wrap: attr.bool(false)
});

globalThis.customElements?.define('pc-layout-group', LayoutGroupComponentElement);

export { LayoutGroupComponentElement };
