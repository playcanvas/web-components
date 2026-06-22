import { LayoutChildComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * The LayoutChildComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-layoutchild/ | `<pc-layoutchild>`} elements.
 * The LayoutChildComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class LayoutChildComponentElement extends ComponentElement {
    private _minWidth = 0;

    private _minHeight = 0;

    private _maxWidth: number | null = null;

    private _maxHeight: number | null = null;

    private _fitWidthProportion = 0;

    private _fitHeightProportion = 0;

    private _excludeFromLayout = false;

    /** @ignore */
    constructor() {
        super('layoutchild');
    }

    getInitialComponentData() {
        return {
            minWidth: this._minWidth,
            minHeight: this._minHeight,
            maxWidth: this._maxWidth,
            maxHeight: this._maxHeight,
            fitWidthProportion: this._fitWidthProportion,
            fitHeightProportion: this._fitHeightProportion,
            excludeFromLayout: this._excludeFromLayout
        };
    }

    /**
     * Gets the underlying PlayCanvas layout child component.
     * @returns The layout child component.
     */
    get component(): LayoutChildComponent | null {
        return super.component as LayoutChildComponent | null;
    }

    /**
     * Sets the minimum width the element should be laid out with.
     * @param value - The minimum width.
     */
    set minWidth(value: number) {
        this._minWidth = value;
        if (this.component) {
            this.component.minWidth = value;
        }
    }

    /**
     * Gets the minimum width the element should be laid out with.
     * @returns The minimum width.
     */
    get minWidth() {
        return this._minWidth;
    }

    /**
     * Sets the minimum height the element should be laid out with.
     * @param value - The minimum height.
     */
    set minHeight(value: number) {
        this._minHeight = value;
        if (this.component) {
            this.component.minHeight = value;
        }
    }

    /**
     * Gets the minimum height the element should be laid out with.
     * @returns The minimum height.
     */
    get minHeight() {
        return this._minHeight;
    }

    /**
     * Sets the maximum width the element should be laid out with (or `null` for no limit).
     * @param value - The maximum width.
     */
    set maxWidth(value: number | null) {
        this._maxWidth = value;
        if (this.component) {
            this.component.maxWidth = value as number;
        }
    }

    /**
     * Gets the maximum width the element should be laid out with.
     * @returns The maximum width.
     */
    get maxWidth() {
        return this._maxWidth;
    }

    /**
     * Sets the maximum height the element should be laid out with (or `null` for no limit).
     * @param value - The maximum height.
     */
    set maxHeight(value: number | null) {
        this._maxHeight = value;
        if (this.component) {
            this.component.maxHeight = value as number;
        }
    }

    /**
     * Gets the maximum height the element should be laid out with.
     * @returns The maximum height.
     */
    get maxHeight() {
        return this._maxHeight;
    }

    /**
     * Sets the proportion of the container's spare width this element should take (when the layout
     * group's `width-fitting` is set to stretch or shrink).
     * @param value - The fit width proportion.
     */
    set fitWidthProportion(value: number) {
        this._fitWidthProportion = value;
        if (this.component) {
            this.component.fitWidthProportion = value;
        }
    }

    /**
     * Gets the proportion of the container's spare width this element should take.
     * @returns The fit width proportion.
     */
    get fitWidthProportion() {
        return this._fitWidthProportion;
    }

    /**
     * Sets the proportion of the container's spare height this element should take (when the layout
     * group's `height-fitting` is set to stretch or shrink).
     * @param value - The fit height proportion.
     */
    set fitHeightProportion(value: number) {
        this._fitHeightProportion = value;
        if (this.component) {
            this.component.fitHeightProportion = value;
        }
    }

    /**
     * Gets the proportion of the container's spare height this element should take.
     * @returns The fit height proportion.
     */
    get fitHeightProportion() {
        return this._fitHeightProportion;
    }

    /**
     * Sets whether the element should be excluded from the layout (and thus not take up space).
     * @param value - Whether to exclude the element from layout.
     */
    set excludeFromLayout(value: boolean) {
        this._excludeFromLayout = value;
        if (this.component) {
            this.component.excludeFromLayout = value;
        }
    }

    /**
     * Gets whether the element is excluded from the layout.
     * @returns Whether the element is excluded from layout.
     */
    get excludeFromLayout() {
        return this._excludeFromLayout;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'min-width',
            'min-height',
            'max-width',
            'max-height',
            'fit-width-proportion',
            'fit-height-proportion',
            'exclude-from-layout'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'min-width':
                this.minWidth = Number(newValue);
                break;
            case 'min-height':
                this.minHeight = Number(newValue);
                break;
            case 'max-width':
                this.maxWidth = newValue === '' ? null : Number(newValue);
                break;
            case 'max-height':
                this.maxHeight = newValue === '' ? null : Number(newValue);
                break;
            case 'fit-width-proportion':
                this.fitWidthProportion = Number(newValue);
                break;
            case 'fit-height-proportion':
                this.fitHeightProportion = Number(newValue);
                break;
            case 'exclude-from-layout':
                this.excludeFromLayout = newValue !== 'false';
                break;
        }
    }
}

customElements.define('pc-layoutchild', LayoutChildComponentElement);

export { LayoutChildComponentElement };
