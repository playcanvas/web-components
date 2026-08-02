import { SCROLL_MODE_BOUNCE, SCROLL_MODE_CLAMP, SCROLL_MODE_INFINITE, SCROLLBAR_VISIBILITY_SHOW_ALWAYS, SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED, ScrollViewComponent, Vec2 } from 'playcanvas';

import { ComponentElement } from './component';
import { getEntity, parseBool, parseEnum, parseNumber, parseVec2 } from '../parse';

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
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-scrollview/ | `<pc-scrollview>`} elements.
 * The ScrollViewComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScrollViewComponentElement extends ComponentElement {
    private _horizontal = true;

    private _vertical = true;

    private _scrollMode: 'clamp' | 'bounce' | 'infinite' = 'bounce';

    private _bounceAmount = 0.1;

    private _friction = 0.05;

    private _useMouseWheel = true;

    private _mouseWheelSensitivity = new Vec2(1, 1);

    private _horizontalScrollbarVisibility: 'always' | 'when-required' = 'when-required';

    private _verticalScrollbarVisibility: 'always' | 'when-required' = 'when-required';

    private _viewport = '';

    private _content = '';

    private _horizontalScrollbar = '';

    private _verticalScrollbar = '';

    /** @ignore */
    constructor() {
        super('scrollview');
    }

    getInitialComponentData() {
        const data: Record<string, any> = {
            horizontal: this._horizontal,
            vertical: this._vertical,
            scrollMode: scrollModes.get(this._scrollMode),
            bounceAmount: this._bounceAmount,
            friction: this._friction,
            useMouseWheel: this._useMouseWheel,
            mouseWheelSensitivity: this._mouseWheelSensitivity,
            horizontalScrollbarVisibility: visibilities.get(this._horizontalScrollbarVisibility),
            verticalScrollbarVisibility: visibilities.get(this._verticalScrollbarVisibility)
        };

        const viewport = getEntity(this._viewport);
        if (viewport) {
            data.viewportEntity = viewport;
        }

        const content = getEntity(this._content);
        if (content) {
            data.contentEntity = content;
        }

        const horizontalScrollbar = getEntity(this._horizontalScrollbar);
        if (horizontalScrollbar) {
            data.horizontalScrollbarEntity = horizontalScrollbar;
        }

        const verticalScrollbar = getEntity(this._verticalScrollbar);
        if (verticalScrollbar) {
            data.verticalScrollbarEntity = verticalScrollbar;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas scroll view component.
     * @returns The scroll view component.
     */
    get component(): ScrollViewComponent {
        return super.component as ScrollViewComponent;
    }

    /**
     * Sets whether horizontal scrolling is enabled.
     * @param value - Whether horizontal scrolling is enabled.
     */
    set horizontal(value: boolean) {
        this._horizontal = value;
        if (this.component) {
            this.component.horizontal = value;
        }
    }

    /**
     * Gets whether horizontal scrolling is enabled.
     * @returns Whether horizontal scrolling is enabled.
     */
    get horizontal() {
        return this._horizontal;
    }

    /**
     * Sets whether vertical scrolling is enabled.
     * @param value - Whether vertical scrolling is enabled.
     */
    set vertical(value: boolean) {
        this._vertical = value;
        if (this.component) {
            this.component.vertical = value;
        }
    }

    /**
     * Gets whether vertical scrolling is enabled.
     * @returns Whether vertical scrolling is enabled.
     */
    get vertical() {
        return this._vertical;
    }

    /**
     * Sets how the scroll view should behave when the content is scrolled beyond its bounds. Can be
     * `clamp`, `bounce` or `infinite`. Defaults to `bounce`.
     * @param value - The scroll mode.
     */
    set scrollMode(value: 'clamp' | 'bounce' | 'infinite') {
        this._scrollMode = value;
        if (this.component) {
            this.component.scrollMode = scrollModes.get(value) ?? SCROLL_MODE_BOUNCE;
        }
    }

    /**
     * Gets how the scroll view behaves when the content is scrolled beyond its bounds.
     * @returns The scroll mode.
     */
    get scrollMode() {
        return this._scrollMode;
    }

    /**
     * Sets how far the content is allowed to bounce beyond its bounds when `scroll-mode` is
     * `bounce`, in the range 0 to 1.
     * @param value - The bounce amount.
     */
    set bounceAmount(value: number) {
        this._bounceAmount = value;
        if (this.component) {
            this.component.bounceAmount = value;
        }
    }

    /**
     * Gets the bounce amount.
     * @returns The bounce amount.
     */
    get bounceAmount() {
        return this._bounceAmount;
    }

    /**
     * Sets how freely the content moves once thrown, in the range 0 (no friction) to 1.
     * @param value - The friction.
     */
    set friction(value: number) {
        this._friction = value;
        if (this.component) {
            this.component.friction = value;
        }
    }

    /**
     * Gets the friction.
     * @returns The friction.
     */
    get friction() {
        return this._friction;
    }

    /**
     * Sets whether the scroll view responds to mouse wheel events.
     * @param value - Whether to use the mouse wheel.
     */
    set useMouseWheel(value: boolean) {
        this._useMouseWheel = value;
        if (this.component) {
            this.component.useMouseWheel = value;
        }
    }

    /**
     * Gets whether the scroll view responds to mouse wheel events.
     * @returns Whether the mouse wheel is used.
     */
    get useMouseWheel() {
        return this._useMouseWheel;
    }

    /**
     * Sets the mouse wheel sensitivity as a Vec2 (horizontal, vertical). A value of 0 on an axis
     * disables mouse wheel scrolling for that axis.
     * @param value - The mouse wheel sensitivity.
     */
    set mouseWheelSensitivity(value: Vec2) {
        this._mouseWheelSensitivity = value;
        if (this.component) {
            this.component.mouseWheelSensitivity = value;
        }
    }

    /**
     * Gets the mouse wheel sensitivity.
     * @returns The mouse wheel sensitivity.
     */
    get mouseWheelSensitivity() {
        return this._mouseWheelSensitivity;
    }

    /**
     * Sets the visibility of the horizontal scrollbar. Can be `always` or `when-required`.
     * Defaults to `when-required`.
     * @param value - The horizontal scrollbar visibility.
     */
    set horizontalScrollbarVisibility(value: 'always' | 'when-required') {
        this._horizontalScrollbarVisibility = value;
        if (this.component) {
            this.component.horizontalScrollbarVisibility = visibilities.get(value) ?? SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED;
        }
    }

    /**
     * Gets the visibility of the horizontal scrollbar.
     * @returns The horizontal scrollbar visibility.
     */
    get horizontalScrollbarVisibility() {
        return this._horizontalScrollbarVisibility;
    }

    /**
     * Sets the visibility of the vertical scrollbar. Can be `always` or `when-required`.
     * Defaults to `when-required`.
     * @param value - The vertical scrollbar visibility.
     */
    set verticalScrollbarVisibility(value: 'always' | 'when-required') {
        this._verticalScrollbarVisibility = value;
        if (this.component) {
            this.component.verticalScrollbarVisibility = visibilities.get(value) ?? SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED;
        }
    }

    /**
     * Gets the visibility of the vertical scrollbar.
     * @returns The vertical scrollbar visibility.
     */
    get verticalScrollbarVisibility() {
        return this._verticalScrollbarVisibility;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` used as the
     * viewport, which clips the content to the scroll view's bounds.
     * @param value - The viewport entity reference.
     */
    set viewport(value: string) {
        this._viewport = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.viewportEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` used as the viewport.
     * @returns The viewport entity reference.
     */
    get viewport() {
        return this._viewport;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` used as the
     * content, which is moved as the scroll view is scrolled.
     * @param value - The content entity reference.
     */
    set content(value: string) {
        this._content = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.contentEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` used as the content.
     * @returns The content entity reference.
     */
    get content() {
        return this._content;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` containing
     * the horizontal `<pc-scrollbar>`.
     * @param value - The horizontal scrollbar entity reference.
     */
    set horizontalScrollbar(value: string) {
        this._horizontalScrollbar = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.horizontalScrollbarEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` containing the horizontal scrollbar.
     * @returns The horizontal scrollbar entity reference.
     */
    get horizontalScrollbar() {
        return this._horizontalScrollbar;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` containing
     * the vertical `<pc-scrollbar>`.
     * @param value - The vertical scrollbar entity reference.
     */
    set verticalScrollbar(value: string) {
        this._verticalScrollbar = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.verticalScrollbarEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` containing the vertical scrollbar.
     * @returns The vertical scrollbar entity reference.
     */
    get verticalScrollbar() {
        return this._verticalScrollbar;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'horizontal',
            'vertical',
            'scroll-mode',
            'bounce-amount',
            'friction',
            'use-mouse-wheel',
            'mouse-wheel-sensitivity',
            'horizontal-scrollbar-visibility',
            'vertical-scrollbar-visibility',
            'viewport',
            'content',
            'horizontal-scrollbar',
            'vertical-scrollbar'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'horizontal':
                this.horizontal = parseBool(newValue, true);
                break;
            case 'vertical':
                this.vertical = parseBool(newValue, true);
                break;
            case 'scroll-mode':
                this.scrollMode = parseEnum(newValue, scrollModes, 'bounce', name);
                break;
            case 'bounce-amount':
                this.bounceAmount = parseNumber(newValue, 0.1, name);
                break;
            case 'friction':
                this.friction = parseNumber(newValue, 0.05, name);
                break;
            case 'use-mouse-wheel':
                this.useMouseWheel = parseBool(newValue, true);
                break;
            case 'mouse-wheel-sensitivity':
                this.mouseWheelSensitivity = parseVec2(newValue, Vec2.ONE, name);
                break;
            case 'horizontal-scrollbar-visibility':
                this.horizontalScrollbarVisibility = parseEnum(newValue, visibilities, 'when-required', name);
                break;
            case 'vertical-scrollbar-visibility':
                this.verticalScrollbarVisibility = parseEnum(newValue, visibilities, 'when-required', name);
                break;
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

customElements.define('pc-scrollview', ScrollViewComponentElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-scrollview': ScrollViewComponentElement;
    }
}

export { ScrollViewComponentElement };
