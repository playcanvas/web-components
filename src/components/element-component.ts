import { Color, ElementComponent, Vec2, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { parseColor, parseVec2, parseVec4 } from '../utils';

/**
 * The ElementComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-element/ | `<pc-element>`} elements.
 * The ElementComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ElementComponentElement extends ComponentElement {
    private _anchor: Vec4 = new Vec4(0.5, 0.5, 0.5, 0.5);

    private _asset: string = '';

    private _autoWidth: boolean = true;

    private _autoHeight: boolean = true;

    private _autoFitWidth: boolean = false;

    private _autoFitHeight: boolean = false;

    private _color: Color = new Color(1, 1, 1, 1);

    private _enableMarkup: boolean = false;

    private _fontSize: number = 32;

    private _maxFontSize: number = 32;

    private _minFontSize: number = 8;

    private _height: number = 0;

    private _lineHeight: number = 32;

    private _margin: Vec4 | null = null;

    private _mask: boolean = false;

    private _opacity: number = 1;

    private _pivot: Vec2 = new Vec2(0.5, 0.5);

    private _pixelsPerUnit: number | null = null;

    private _spriteAsset: string = '';

    private _spriteFrame: number = 0;

    private _text: string = '';

    private _textureAsset: string = '';

    private _type: 'group' | 'image' | 'text' = 'group';

    private _useInput: boolean = false;

    private _width: number = 0;

    private _wrapLines: boolean = false;

    /** @ignore */
    constructor() {
        super('element');
    }

    initComponent() {
        const component = this.component as any;
        if (!component) {
            return;
        }

        // Text elements render through their own material; enable fog on it so 3D text respects
        // scene fog. Image/group elements have no text material, so guard the access.
        if (component._text?._material) {
            component._text._material.useFog = true;
        }

        // The engine establishes element masking in ElementComponent._onInsert, which fires when an
        // entity is inserted into the hierarchy. Web-components inserts the entity first and adds
        // the element component afterwards, so that pass is missed. Re-dirty the mask state here so
        // masks (e.g. a scroll view viewport) correctly clip this element and any added at runtime.
        component._dirtifyMask?.();
    }

    getInitialComponentData() {
        const data: Record<string, any> = {
            anchor: this._anchor,
            autoWidth: this._autoWidth,
            autoHeight: this._autoHeight,
            autoFitWidth: this._autoFitWidth,
            autoFitHeight: this._autoFitHeight,
            color: this._color,
            enableMarkup: this._enableMarkup,
            fontSize: this._fontSize,
            maxFontSize: this._maxFontSize,
            minFontSize: this._minFontSize,
            height: this._height,
            lineHeight: this._lineHeight,
            mask: this._mask,
            opacity: this._opacity,
            pivot: this._pivot,
            spriteFrame: this._spriteFrame,
            type: this._type,
            text: this._text,
            useInput: this._useInput,
            width: this._width,
            wrapLines: this._wrapLines
        };

        // Asset references are resolved from `<pc-asset>` element ids to engine asset ids. They are
        // only included when they resolve, so image/group elements (with no font) don't error.
        const fontAsset = AssetElement.get(this._asset);
        if (fontAsset) {
            data.fontAsset = fontAsset.id;
        }

        const spriteAsset = AssetElement.get(this._spriteAsset);
        if (spriteAsset) {
            data.spriteAsset = spriteAsset.id;
        }

        const textureAsset = AssetElement.get(this._textureAsset);
        if (textureAsset) {
            data.textureAsset = textureAsset.id;
        }

        // Margin is only applied when explicitly set. For stretched (split) anchors it governs the
        // element size; for point anchors width/height take over (handled by the engine).
        if (this._margin) {
            data.margin = this._margin;
        }

        if (this._pixelsPerUnit !== null) {
            data.pixelsPerUnit = this._pixelsPerUnit;
        }

        return data;
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
     * Sets the id of the `pc-asset` to use for the font (text elements).
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
     * Sets whether the element component should automatically adjust its width to the text content
     * (text elements only).
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
     * Sets whether the element component should automatically adjust its height to the text content
     * (text elements only).
     * @param value - Whether to automatically adjust the height.
     */
    set autoHeight(value: boolean) {
        this._autoHeight = value;
        if (this.component) {
            this.component.autoHeight = value;
        }
    }

    /**
     * Gets whether the element component should automatically adjust its height.
     * @returns Whether to automatically adjust the height.
     */
    get autoHeight() {
        return this._autoHeight;
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
     * Sets whether the element component should use markup.
     * @param value - Whether to enable markup.
     */
    set enableMarkup(value: boolean) {
        this._enableMarkup = value;
        if (this.component) {
            this.component.enableMarkup = value;
        }
    }

    /**
     * Gets whether the element component should use markup.
     * @returns Whether markup is enabled.
     */
    get enableMarkup() {
        return this._enableMarkup;
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
     * Sets the height of the element component.
     * @param value - The height.
     */
    set height(value: number) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }

    /**
     * Gets the height of the element component.
     * @returns The height.
     */
    get height() {
        return this._height;
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
     * Sets the margin of the element component (used to inset the element from stretched anchors).
     * @param value - The margin as a Vec4 (left, bottom, right, top).
     */
    set margin(value: Vec4 | null) {
        this._margin = value;
        if (this.component && value) {
            this.component.margin = value;
        }
    }

    /**
     * Gets the margin of the element component.
     * @returns The margin.
     */
    get margin() {
        return this._margin;
    }

    /**
     * Sets whether the element component is a mask, clipping its descendants to its bounds (image
     * elements only).
     * @param value - Whether the element is a mask.
     */
    set mask(value: boolean) {
        this._mask = value;
        if (this.component) {
            this.component.mask = value;
        }
    }

    /**
     * Gets whether the element component is a mask.
     * @returns Whether the element is a mask.
     */
    get mask() {
        return this._mask;
    }

    /**
     * Sets the opacity of the element component.
     * @param value - The opacity (0 to 1).
     */
    set opacity(value: number) {
        this._opacity = value;
        if (this.component) {
            this.component.opacity = value;
        }
    }

    /**
     * Gets the opacity of the element component.
     * @returns The opacity.
     */
    get opacity() {
        return this._opacity;
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
     * Sets the number of pixels per unit to use when rendering a sprite (image elements only).
     * @param value - The pixels per unit.
     */
    set pixelsPerUnit(value: number | null) {
        this._pixelsPerUnit = value;
        if (this.component && value !== null) {
            this.component.pixelsPerUnit = value;
        }
    }

    /**
     * Gets the number of pixels per unit used when rendering a sprite.
     * @returns The pixels per unit.
     */
    get pixelsPerUnit() {
        return this._pixelsPerUnit;
    }

    /**
     * Sets the id of the `pc-asset` to use for the sprite (image elements only).
     * @param value - The sprite asset ID.
     */
    set spriteAsset(value: string) {
        this._spriteAsset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.spriteAsset = asset.id;
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the sprite.
     * @returns The sprite asset ID.
     */
    get spriteAsset() {
        return this._spriteAsset;
    }

    /**
     * Sets the frame of the sprite to render (image elements only).
     * @param value - The sprite frame index.
     */
    set spriteFrame(value: number) {
        this._spriteFrame = value;
        if (this.component) {
            this.component.spriteFrame = value;
        }
    }

    /**
     * Gets the frame of the sprite to render.
     * @returns The sprite frame index.
     */
    get spriteFrame() {
        return this._spriteFrame;
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
     * Sets the id of the `pc-asset` to use for the texture (image elements only).
     * @param value - The texture asset ID.
     */
    set textureAsset(value: string) {
        this._textureAsset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.textureAsset = asset.id;
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the texture.
     * @returns The texture asset ID.
     */
    get textureAsset() {
        return this._textureAsset;
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
     * Sets whether the element component accepts input events (required for buttons and scrolling).
     * @param value - Whether the element accepts input.
     */
    set useInput(value: boolean) {
        this._useInput = value;
        if (this.component) {
            this.component.useInput = value;
        }
    }

    /**
     * Gets whether the element component accepts input events.
     * @returns Whether the element accepts input.
     */
    get useInput() {
        return this._useInput;
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

    /**
     * Sets whether a text element should automatically reduce its font size (down to `min-font-size`)
     * so the text fits within the element's width. Requires `auto-width` to be `false`.
     * @param value - Whether to auto-fit the width.
     */
    set autoFitWidth(value: boolean) {
        this._autoFitWidth = value;
        if (this.component) {
            this.component.autoFitWidth = value;
        }
    }

    /**
     * Gets whether a text element automatically reduces its font size to fit its width.
     * @returns Whether the width is auto-fit.
     */
    get autoFitWidth() {
        return this._autoFitWidth;
    }

    /**
     * Sets whether a text element should automatically reduce its font size (down to `min-font-size`)
     * so the text fits within the element's height. Requires `auto-height` to be `false`.
     * @param value - Whether to auto-fit the height.
     */
    set autoFitHeight(value: boolean) {
        this._autoFitHeight = value;
        if (this.component) {
            this.component.autoFitHeight = value;
        }
    }

    /**
     * Gets whether a text element automatically reduces its font size to fit its height.
     * @returns Whether the height is auto-fit.
     */
    get autoFitHeight() {
        return this._autoFitHeight;
    }

    /**
     * Sets the smallest font size a text element may use when auto-fitting.
     * @param value - The minimum font size.
     */
    set minFontSize(value: number) {
        this._minFontSize = value;
        if (this.component) {
            this.component.minFontSize = value;
        }
    }

    /**
     * Gets the smallest font size a text element may use when auto-fitting.
     * @returns The minimum font size.
     */
    get minFontSize() {
        return this._minFontSize;
    }

    /**
     * Sets the largest font size a text element may use when auto-fitting.
     * @param value - The maximum font size.
     */
    set maxFontSize(value: number) {
        this._maxFontSize = value;
        if (this.component) {
            this.component.maxFontSize = value;
        }
    }

    /**
     * Gets the largest font size a text element may use when auto-fitting.
     * @returns The maximum font size.
     */
    get maxFontSize() {
        return this._maxFontSize;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'anchor',
            'asset',
            'auto-width',
            'auto-height',
            'auto-fit-width',
            'auto-fit-height',
            'color',
            'enable-markup',
            'font-size',
            'max-font-size',
            'min-font-size',
            'height',
            'line-height',
            'margin',
            'mask',
            'opacity',
            'pivot',
            'pixels-per-unit',
            'sprite-asset',
            'sprite-frame',
            'text',
            'texture-asset',
            'type',
            'use-input',
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
            case 'auto-height':
                this.autoHeight = newValue !== 'false';
                break;
            case 'auto-fit-width':
                this.autoFitWidth = newValue !== 'false';
                break;
            case 'auto-fit-height':
                this.autoFitHeight = newValue !== 'false';
                break;
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'enable-markup':
                this.enableMarkup = this.hasAttribute(name);
                break;
            case 'font-size':
                this.fontSize = Number(newValue);
                break;
            case 'max-font-size':
                this.maxFontSize = Number(newValue);
                break;
            case 'min-font-size':
                this.minFontSize = Number(newValue);
                break;
            case 'height':
                this.height = Number(newValue);
                break;
            case 'line-height':
                this.lineHeight = Number(newValue);
                break;
            case 'margin':
                this.margin = parseVec4(newValue);
                break;
            case 'mask':
                this.mask = this.hasAttribute(name);
                break;
            case 'opacity':
                this.opacity = Number(newValue);
                break;
            case 'pivot':
                this.pivot = parseVec2(newValue);
                break;
            case 'pixels-per-unit':
                this.pixelsPerUnit = Number(newValue);
                break;
            case 'sprite-asset':
                this.spriteAsset = newValue;
                break;
            case 'sprite-frame':
                this.spriteFrame = Number(newValue);
                break;
            case 'text':
                this.text = newValue;
                break;
            case 'texture-asset':
                this.textureAsset = newValue;
                break;
            case 'type':
                this.type = newValue as 'group' | 'image' | 'text';
                break;
            case 'use-input':
                this.useInput = this.hasAttribute(name);
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
