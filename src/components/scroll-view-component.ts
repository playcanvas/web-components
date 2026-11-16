import type { ScrollViewComponent } from 'playcanvas';
import {
    SCROLL_MODE_BOUNCE,
    SCROLL_MODE_CLAMP,
    SCROLL_MODE_INFINITE,
    SCROLLBAR_VISIBILITY_SHOW_ALWAYS,
    SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED,
    Vec2
} from 'playcanvas';

import { attr, defineAttributes } from '../attributes';
import { resolveEntity } from '../entity-reference';

import { ComponentElement } from './component';

const scrollModes = new Map<'clamp' | 'bounce' | 'infinite', number>([
    ['clamp', SCROLL_MODE_CLAMP],
    ['bounce', SCROLL_MODE_BOUNCE],
    ['infinite', SCROLL_MODE_INFINITE]
]);

const visibilities = new Map<'always' | 'when-required', number>([
    ['always', SCROLLBAR_VISIBILITY_SHOW_ALWAYS],
    ['when-required', SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED]
]);

/**
 * The ScrollViewComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scroll-view/ | `<pc-scroll-view>`} elements.
 * The ScrollViewComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ScrollViewComponent} (`scrollview`).
 *
 * @elementSummary The `<pc-scroll-view>` element scrolls a larger content entity within a clipped
 * viewport at its entity, optionally driven by the `<pc-scrollbar>` elements it references. Must be
 * a child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ScrollViewComponentElement extends ComponentElement<ScrollViewComponent> {
    /**
     * The bounce amount. It is how far the content is allowed to bounce beyond its bounds when
     * `scroll-mode` is `bounce`, in the range 0 to 1.
     */
    declare bounceAmount: number;

    /**
     * The friction. It is how freely the content moves once thrown, in the range 0 (no friction) to
     * 1.
     */
    declare friction: number;

    /**
     * Whether scrolling along the horizontal axis is enabled. This is a toggle, unlike the
     * `orientation` of a `<pc-scrollbar>`, for which `horizontal` is one of the accepted values.
     */
    declare horizontal: boolean;

    /**
     * The visibility of the horizontal scrollbar. Can be `always` or `when-required`. Defaults to
     * `always`.
     */
    declare horizontalScrollbarVisibility: 'always' | 'when-required';

    /**
     * The mouse wheel sensitivity. It is a Vec2: horizontal, vertical. A value of 0 on an axis
     * disables mouse wheel scrolling for that axis.
     */
    declare mouseWheelSensitivity: Vec2;

    /**
     * How the scroll view behaves when the content is scrolled beyond its bounds. Can be `clamp`,
     * `bounce` or `infinite`. Defaults to `bounce`.
     */
    declare scrollMode: 'clamp' | 'bounce' | 'infinite';

    /**
     * Whether the scroll view responds to mouse wheel events.
     */
    declare useMouseWheel: boolean;

    /**
     * Whether scrolling along the vertical axis is enabled. This is a toggle, unlike the
     * `orientation` of a `<pc-scrollbar>`, for which `vertical` is one of the accepted values.
     */
    declare vertical: boolean;

    /**
     * The visibility of the vertical scrollbar. Can be `always` or `when-required`. Defaults to
     * `always`.
     */
    declare verticalScrollbarVisibility: 'always' | 'when-required';

    private _viewport = '';

    private _content = '';

    private _horizontalScrollbar = '';

    private _verticalScrollbar = '';

    /** @ignore */
    constructor() {
        super('scrollview');
    }

    protected getInitialComponentData() {
        const data: Record<string, any> = { ...super.getInitialComponentData() };

        const viewport = resolveEntity(this._viewport, this, 'viewport', 'reference ignored');
        if (viewport) {
            data.viewportEntity = viewport;
        }

        const content = resolveEntity(this._content, this, 'content', 'reference ignored');
        if (content) {
            data.contentEntity = content;
        }

        const horizontalScrollbar = resolveEntity(
            this._horizontalScrollbar,
            this,
            'horizontal-scrollbar',
            'reference ignored'
        );
        if (horizontalScrollbar) {
            data.horizontalScrollbarEntity = horizontalScrollbar;
        }

        const verticalScrollbar = resolveEntity(
            this._verticalScrollbar,
            this,
            'vertical-scrollbar',
            'reference ignored'
        );
        if (verticalScrollbar) {
            data.verticalScrollbarEntity = verticalScrollbar;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas scroll view component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The scroll view component, or `null`.
     */
    get component(): ScrollViewComponent | null {
        return super.component;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the viewport, which clips the content to the scroll view's
     * bounds. An exact name resolves against the nearest enclosing entity first, then outward,
     * then the document. A non-empty reference that does not resolve warns and is ignored.
     * @param value - The viewport entity reference.
     */
    set viewport(value: string) {
        this._viewport = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'viewport', 'reference ignored');
            if (entity) {
                this.component.viewportEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the viewport.
     * @returns The viewport entity reference.
     */
    get viewport() {
        return this._viewport;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the content, which is moved as the scroll view is
     * scrolled. An exact name resolves against the nearest enclosing entity first, then outward,
     * then the document. A non-empty reference that does not resolve warns and is ignored.
     * @param value - The content entity reference.
     */
    set content(value: string) {
        this._content = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'content', 'reference ignored');
            if (entity) {
                this.component.contentEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity used as the content.
     * @returns The content entity reference.
     */
    get content() {
        return this._content;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity containing the horizontal `<pc-scrollbar>`. An exact name resolves
     * against the nearest enclosing entity first, then outward, then the document. A non-empty
     * reference that does not resolve warns and is ignored.
     * @param value - The horizontal scrollbar entity reference.
     */
    set horizontalScrollbar(value: string) {
        this._horizontalScrollbar = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'horizontal-scrollbar', 'reference ignored');
            if (entity) {
                this.component.horizontalScrollbarEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity containing the horizontal scrollbar.
     * @returns The horizontal scrollbar entity reference.
     */
    get horizontalScrollbar() {
        return this._horizontalScrollbar;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity containing the vertical `<pc-scrollbar>`. An exact name resolves
     * against the nearest enclosing entity first, then outward, then the document. A non-empty
     * reference that does not resolve warns and is ignored.
     * @param value - The vertical scrollbar entity reference.
     */
    set verticalScrollbar(value: string) {
        this._verticalScrollbar = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'vertical-scrollbar', 'reference ignored');
            if (entity) {
                this.component.verticalScrollbarEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity containing the vertical scrollbar.
     * @returns The vertical scrollbar entity reference.
     */
    get verticalScrollbar() {
        return this._verticalScrollbar;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'viewport', 'content', 'horizontal-scrollbar', 'vertical-scrollbar'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'viewport':
                this.viewport = newValue ?? '';
                break;
            case 'content':
                this.content = newValue ?? '';
                break;
            case 'horizontal-scrollbar':
                this.horizontalScrollbar = newValue ?? '';
                break;
            case 'vertical-scrollbar':
                this.verticalScrollbar = newValue ?? '';
                break;
        }
    }
}

defineAttributes(ScrollViewComponentElement, 'component', {
    bounceAmount: attr.number(0.1),
    friction: attr.number(0.05),
    horizontal: attr.bool(true),
    horizontalScrollbarVisibility: attr
        .oneOf(visibilities, 'always')
        .to((value) => visibilities.get(value) ?? SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED),
    mouseWheelSensitivity: attr.vec2(Vec2.ONE),
    scrollMode: attr.oneOf(scrollModes, 'bounce'),
    useMouseWheel: attr.bool(true),
    vertical: attr.bool(true),
    verticalScrollbarVisibility: attr
        .oneOf(visibilities, 'always')
        .to((value) => visibilities.get(value) ?? SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED)
});

globalThis.customElements?.define('pc-scroll-view', ScrollViewComponentElement);

export { ScrollViewComponentElement };
