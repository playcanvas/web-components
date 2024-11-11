import { Color, ElementComponent, Vec2, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { parseColor, parseVec2, parseVec4 } from '../utils';


/**
 * Represents an element component in the PlayCanvas engine.
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

    constructor() {
        super('element');
    }

    async connectedCallback() {
        await super.connectedCallback();

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
     * Gets the element component.
     * @returns The element component.
     */
    get component(): ElementComponent | null {
        return super.component as ElementComponent | null;
    }

    set anchor(value: Vec4) {
        this._anchor = value;
        if (this.component) {
            this.component.anchor = value;
        }
    }

    get anchor() {
        return this._anchor;
    }

    set asset(value: string) {
        this._asset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.fontAsset = asset.id;
        }
    }

    get asset() {
        return this._asset;
    }

    set autoWidth(value: boolean) {
        this._autoWidth = value;
        if (this.component) {
            this.component.autoWidth = value;
        }
    }

    get autoWidth() {
        return this._autoWidth;
    }

    set color(value: Color) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }

    get color() {
        return this._color;
    }

    set fontSize(value: number) {
        this._fontSize = value;
        if (this.component) {
            this.component.fontSize = value;
        }
    }

    get fontSize() {
        return this._fontSize;
    }

    set lineHeight(value: number) {
        this._lineHeight = value;
        if (this.component) {
            this.component.lineHeight = value;
        }
    }

    get lineHeight() {
        return this._lineHeight;
    }

    set pivot(value: Vec2) {
        this._pivot = value;
        if (this.component) {
            this.component.pivot = value;
        }
    }

    get pivot() {
        return this._pivot;
    }

    set text(value: string) {
        this._text = value;
        if (this.component) {
            this.component.text = value;
        }
    }

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

    set width(value: number) {
        this._width = value;
        if (this.component) {
            this.component.width = value;
        }
    }

    get width() {
        return this._width;
    }

    set wrapLines(value: boolean) {
        this._wrapLines = value;
        if (this.component) {
            this.component.wrapLines = value;
        }
    }

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
