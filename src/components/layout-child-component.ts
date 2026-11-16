import type { LayoutChildComponent } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

import { ComponentElement } from './component';

/**
 * The LayoutChildComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-layout-child/ | `<pc-layout-child>`} elements.
 * The LayoutChildComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link LayoutChildComponent} (`layoutchild`).
 *
 * @elementSummary The `<pc-layout-child>` element controls how its entity is sized by the
 * `<pc-layout-group>` above it, through minimum and maximum sizes and fit proportions. Must be a
 * child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class LayoutChildComponentElement extends ComponentElement<LayoutChildComponent> {
    /**
     * Whether the element is excluded from the layout. An excluded element takes up no space.
     */
    declare excludeFromLayout: boolean;

    /**
     * The proportion of the container's spare height this element should take. It applies when the
     * layout group's `height-fitting` is set to stretch or shrink.
     */
    declare fitHeightProportion: number;

    /**
     * The proportion of the container's spare width this element should take. It applies when the
     * layout group's `width-fitting` is set to stretch or shrink.
     */
    declare fitWidthProportion: number;

    /**
     * The maximum height the element should be laid out with. `null` is no limit.
     */
    declare maxHeight: number | null;

    /**
     * The maximum width the element should be laid out with. `null` is no limit.
     */
    declare maxWidth: number | null;

    /**
     * The minimum height the element should be laid out with.
     */
    declare minHeight: number;

    /**
     * The minimum width the element should be laid out with.
     */
    declare minWidth: number;

    /** @ignore */
    constructor() {
        super('layoutchild');
    }

    /**
     * Gets the underlying PlayCanvas layout child component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The layout child component, or `null`.
     */
    get component(): LayoutChildComponent | null {
        return super.component;
    }
}

defineAttributes(LayoutChildComponentElement, 'component', {
    excludeFromLayout: attr.bool(false),
    fitHeightProportion: attr.number(0),
    fitWidthProportion: attr.number(0),
    maxHeight: attr.number(null).to((value) => value as number),
    maxWidth: attr.number(null).to((value) => value as number),
    minHeight: attr.number(0),
    minWidth: attr.number(0)
});

globalThis.customElements?.define('pc-layout-child', LayoutChildComponentElement);

export { LayoutChildComponentElement };
