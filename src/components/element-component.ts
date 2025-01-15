import { Color, ElementComponent, Vec2, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { parseColor, parseVec2, parseVec4 } from '../utils';

/**
 * The ElementComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-element/ | `<pc-element>`} elements.
 * The ElementComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ElementComponentElement extends ComponentElement {
    private _anchor: Vec4 = new Vec4(0.5, 0.5, 0.5, 0.5);

    private _asset: string = '';

    private _autoWidth: boolean = true;

    private _color: Color = new Color(1, 1, 1, 1);

    private _fontSize: number = 32;

    private _lineHeight: number = 32;

    private _pivot: Vec2 = new Vec2(0.5, 0.5);

    private _text: string = '';

    private _type: 'group' | 'image' | 'text' = 'group';

    private _width: number = 0;

    private _wrapLines: boolean = false;

    /** @ignore */
    constructor() {
        super('element');
    }

    initComponent() {
        this.component!._text._material.useFog = true;
    }

    getInitialComponentData() {
        return {
            anchor: this._anchor,
            autoWidth: this._autoWidth,
            color: this._color,
            fontAsset: AssetElement.get(this._asset)!.id,
            fontSize: this._fontSize,
            lineHeight: this._lineHeight,
            pivot: this._pivot,
            type: this._type,
            text: this._text,
            width: this._width,
            wrapLines: this._wrapLines
        };
    }

    /**
     * Gets the underlying PlayCanvas element component.
     * @returns The element component.
     */
    get component(): ElementComponent | null {
        return super.component as ElementComponent | null;
    }

    /**
     * Sets the anchor of the element component.
     * @param value - The anchor.
     */
    set anchor(value: Vec4) {
        this._anchor = value;
        if (this.component) {
            this.component.anchor = value;
        }
    }

    /**
     * Gets the anchor of the element component.
     * @returns The anchor.
     */
    get anchor() {
        return this._anchor;
    }

    /**
     * Sets the id of the `pc-asset` to use for the font.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.fontAsset = asset.id;
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the font.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }

    /**
     * Sets whether the element component should automatically adjust its width.
     * @param value - Whether to automatically adjust the width.
     */
    set autoWidth(value: boolean) {
        this._autoWidth = value;
        if (this.component) {
            this.component.autoWidth = value;
        }
    }

    /**
     * Gets whether the element component should automatically adjust its width.
     * @returns Whether to automatically adjust the width.
     */
    get autoWidth() {
        return this._autoWidth;
    }

    /**
     * Sets the color of the element component.
     * @param value - The color.
     */
    set color(value: Color) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }

    /**
     * Gets the color of the element component.
     * @returns The color.
     */
    get color() {
        return this._color;
    }

    /**
     * Sets the font size of the element component.
     * @param value - The font size.
     */
    set fontSize(value: number) {
        this._fontSize = value;
        if (this.component) {
            this.component.fontSize = value;
        }
    }

    /**
     * Gets the font size of the element component.
     * @returns The font size.
     */
    get fontSize() {
        return this._fontSize;
    }

    /**
     * Sets the line height of the element component.
     * @param value - The line height.
     */
    set lineHeight(value: number) {
        this._lineHeight = value;
        if (this.component) {
            this.component.lineHeight = value;
        }
    }

    /**
     * Gets the line height of the element component.
     * @returns The line height.
     */
    get lineHeight() {
        return this._lineHeight;
    }

    /**
     * Sets the pivot of the element component.
     * @param value - The pivot.
     */
    set pivot(value: Vec2) {
        this._pivot = value;
        if (this.component) {
            this.component.pivot = value;
        }
    }

    /**
     * Gets the pivot of the element component.
     * @returns The pivot.
     */
    get pivot() {
        return this._pivot;
    }

    /**
     * Sets the text of the element component.
     * @param value - The text.
     */
    set text(value: string) {
        this._text = value;
        if (this.component) {
            this.component.text = value;
        }
    }

    /**
     * Gets the text of the element component.
     * @returns The text.
     */
    get text() {
        return this._text;
    }

    /**
     * Sets the type of the element component.
     * @param value - The type.
     */
    set type(value: 'group' | 'image' | 'text') {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    /**
     * Gets the type of the element component.
     * @returns The type.
     */
    get type(): 'group' | 'image' | 'text' {
        return this._type;
    }

    /**
     * Sets the width of the element component.
     * @param value - The width.
     */
    set width(value: number) {
        this._width = value;
        if (this.component) {
            this.component.width = value;
        }
    }

    /**
     * Gets the width of the element component.
     * @returns The width.
     */
    get width() {
        return this._width;
    }

    /**
     * Sets whether the element component should wrap lines.
     * @param value - Whether to wrap lines.
     */
    set wrapLines(value: boolean) {
        this._wrapLines = value;
        if (this.component) {
            this.component.wrapLines = value;
        }
    }

    /**
     * Gets whether the element component should wrap lines.
     * @returns Whether to wrap lines.
     */
    get wrapLines() {
        return this._wrapLines;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'anchor',
            'asset',
            'auto-width',
            'color',
            'font-size',
            'line-height',
            'pivot',
            'text',
            'type',
            'width',
            'wrap-lines'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'anchor':
                this.anchor = parseVec4(newValue);
                break;
            case 'asset':
                this.asset = newValue;
                break;
            case 'auto-width':
                this.autoWidth = newValue !== 'false';
                break;
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'font-size':
                this.fontSize = Number(newValue);
                break;
            case 'line-height':
                this.lineHeight = Number(newValue);
                break;
            case 'pivot':
                this.pivot = parseVec2(newValue);
                break;
            case 'text':
                this.text = newValue;
                break;
            case 'type':
                this.type = newValue as 'group' | 'image' | 'text';
                break;
            case 'width':
                this.width = Number(newValue);
                break;
            case 'wrap-lines':
                this.wrapLines = this.hasAttribute(name);
                break;
        }
    }
}

customElements.define('pc-element', ElementComponentElement);

export { ElementComponentElement };
