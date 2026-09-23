import type { ElementComponent } from 'playcanvas';
import { Color, Vec2, Vec4 } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { parseBool, parseColor, parseEnum, parseNumber, parseVec2, parseVec4 } from '../parse';

import { ComponentElement } from './component';

/**
 * How an image element fits its texture or sprite into its rectangle: `stretch` fills the rectangle
 * exactly, `contain` fits within it and `cover` fills it, both preserving the source aspect ratio.
 *
 * @category Types
 */
export type FitMode = 'stretch' | 'contain' | 'cover';

// The FITMODE_* constants are strings whose values are exactly these names, so a parsed value is
// assigned to the component unchanged rather than mapped through a table.
const fitModes: FitMode[] = ['stretch', 'contain', 'cover'];

/**
 * The ElementComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-element/ | `<pc-element>`} elements.
 * The ElementComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Despite the name, this is not a base class or a generic wrapper: it is the engine's 2D UI
 * component, which gives its host entity a rectangle in a `<pc-screen>` hierarchy that draws
 * either an image, a line of text or nothing (`type="image"`, `"text"` or `"group"`). The tag
 * spells the engine component it adds, as every component element does.
 *
 * Engine component: {@link ElementComponent} (`element`).
 *
 * @elementSummary The `<pc-element>` element gives its entity a 2D UI rectangle inside a
 * `<pc-screen>` hierarchy, drawing an image, a line of text or nothing (`type="image"`, `"text"` or
 * `"group"`). Must be a child of a `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ElementComponentElement extends ComponentElement<ElementComponent> {
    private _alignment: Vec2 = new Vec2(0.5, 0.5);

    private _anchor: Vec4 = new Vec4(0, 0, 0, 0);

    private _autoWidth = true;

    private _autoHeight = true;

    private _autoFitWidth = false;

    private _autoFitHeight = false;

    private _color: Color = new Color(1, 1, 1, 1);

    private _enableMarkup = false;

    private _fitMode: FitMode = 'stretch';

    private _fontAsset = '';

    private _fontSize = 32;

    private _maxFontSize = 32;

    private _minFontSize = 8;

    private _height = 32;

    private _justify = false;

    private _lineHeight = 32;

    private _margin: Vec4 | null = null;

    private _mask = false;

    private _maxLines: number | null = null;

    private _opacity = 1;

    private _outlineColor: Color = new Color(0, 0, 0, 1);

    private _outlineThickness = 0;

    private _pivot: Vec2 = new Vec2(0, 0);

    private _pixelsPerUnit: number | null = null;

    private _shadowColor: Color = new Color(0, 0, 0, 1);

    private _shadowOffset: Vec2 = new Vec2(0, 0);

    private _spacing = 1;

    private _spriteAsset = '';

    private _spriteFrame = 0;

    private _text = '';

    private _textureAsset = '';

    private _type: 'group' | 'image' | 'text' = 'group';

    private _useInput = false;

    private _width = 32;

    private _wrapLines = false;

    /** @ignore */
    constructor() {
        super('element');
    }

    protected initComponent() {
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

    protected getInitialComponentData() {
        const data: Record<string, any> = {
            alignment: this._alignment,
            anchor: this._anchor,
            autoWidth: this._autoWidth,
            autoHeight: this._autoHeight,
            autoFitWidth: this._autoFitWidth,
            autoFitHeight: this._autoFitHeight,
            color: this._color,
            enableMarkup: this._enableMarkup,
            fitMode: this._fitMode,
            fontSize: this._fontSize,
            maxFontSize: this._maxFontSize,
            minFontSize: this._minFontSize,
            height: this._height,
            justify: this._justify,
            lineHeight: this._lineHeight,
            mask: this._mask,
            // The engine reads null as "no limit"
            maxLines: this._maxLines,
            opacity: this._opacity,
            outlineColor: this._outlineColor,
            outlineThickness: this._outlineThickness,
            pivot: this._pivot,
            shadowColor: this._shadowColor,
            shadowOffset: this._shadowOffset,
            spacing: this._spacing,
            spriteFrame: this._spriteFrame,
            type: this._type,
            text: this._text,
            useInput: this._useInput,
            width: this._width,
            wrapLines: this._wrapLines
        };

        // Asset references are resolved from `<pc-asset>` element ids to engine asset ids. They are
        // only included when they resolve, so image/group elements (with no font) don't error.
        const fontAsset = useAsset(this._fontAsset);
        if (fontAsset) {
            data.fontAsset = fontAsset.id;
        }

        const spriteAsset = useAsset(this._spriteAsset);
        if (spriteAsset) {
            data.spriteAsset = spriteAsset.id;
        }

        const textureAsset = useAsset(this._textureAsset);
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
     * Gets the underlying PlayCanvas element component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The element component, or `null`.
     */
    get component(): ElementComponent | null {
        return super.component;
    }

    /**
     * Sets the horizontal and vertical alignment of the text within the element (text elements
     * only), each from 0 to 1. Defaults to `0.5 0.5`, centered; `0 1` aligns to the top left.
     * @param value - The alignment.
     */
    set alignment(value: Vec2) {
        this._alignment = value;
        if (this.component) {
            this.component.alignment = value;
        }
    }

    /**
     * Gets the horizontal and vertical alignment of the text within the element.
     * @returns The alignment.
     */
    get alignment() {
        return this._alignment;
    }

    /**
     * Sets the anchor of the element component: the left, bottom, right and top edges as fractions
     * of the parent's size, in that order. Defaults to `0 0 0 0`, the parent's
     * bottom-left corner; `0.5 0.5 0.5 0.5` centers the element.
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
     * Sets how the texture or sprite fits the element's rectangle (image elements only). Can be:
     *
     * - `stretch` - Fills the rectangle exactly, ignoring the source aspect ratio.
     * - `contain` - Fits within the rectangle, preserving the source aspect ratio.
     * - `cover` - Covers the whole rectangle, preserving the source aspect ratio.
     *
     * Defaults to `stretch`.
     * @param value - The fit mode.
     */
    set fitMode(value: FitMode) {
        this._fitMode = value;
        if (this.component) {
            this.component.fitMode = value;
        }
    }

    /**
     * Gets how the texture or sprite fits the element's rectangle.
     * @returns The fit mode.
     */
    get fitMode(): FitMode {
        return this._fitMode;
    }

    /**
     * Sets the id of the `pc-asset` to use for the font (text elements).
     * @param value - The font asset ID.
     */
    set fontAsset(value: string) {
        this._fontAsset = value;
        const asset = useAsset(value);
        if (this.component && asset) {
            this.component.fontAsset = asset.id;
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the font.
     * @returns The font asset ID.
     */
    get fontAsset() {
        return this._fontAsset;
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
     * Sets the height of the element component. Defaults to 32.
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
     * Sets whether wrapped lines are stretched flush with both edges of the element by widening
     * the gaps between their words, which needs `wrap-lines` and a fixed width (text elements
     * only). The last line, and any line ended by an explicit line break, follows `alignment`
     * instead. Defaults to `false`.
     * @param value - Whether to justify wrapped lines.
     */
    set justify(value: boolean) {
        this._justify = value;
        if (this.component) {
            this.component.justify = value;
        }
    }

    /**
     * Gets whether wrapped lines are stretched flush with both edges of the element, which needs
     * `wrap-lines` and a fixed width.
     * @returns Whether wrapped lines are justified.
     */
    get justify() {
        return this._justify;
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
     * Sets the maximum number of lines `wrap-lines` wraps the text onto, appending any leftover
     * text to the last line (text elements only). Defaults to `null`, no limit.
     * @param value - The maximum number of lines, or `null` for no limit.
     */
    set maxLines(value: number | null) {
        this._maxLines = value;
        if (this.component) {
            this.component.maxLines = value as number;
        }
    }

    /**
     * Gets the maximum number of lines `wrap-lines` wraps the text onto.
     * @returns The maximum number of lines, or `null` for no limit.
     */
    get maxLines() {
        return this._maxLines;
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
     * Sets the color of the text outline, which is only drawn when `outline-thickness` is above 0
     * (text elements only). Defaults to opaque black.
     * @param value - The outline color.
     */
    set outlineColor(value: Color) {
        this._outlineColor = value;
        if (this.component) {
            this.component.outlineColor = value;
        }
    }

    /**
     * Gets the color of the text outline, which is only drawn when `outline-thickness` is above 0.
     * @returns The outline color.
     */
    get outlineColor() {
        return this._outlineColor;
    }

    /**
     * Sets the thickness of the text outline, from 0 to 1 (text elements only). Defaults to 0,
     * no outline.
     * @param value - The outline thickness.
     */
    set outlineThickness(value: number) {
        this._outlineThickness = value;
        if (this.component) {
            this.component.outlineThickness = value;
        }
    }

    /**
     * Gets the thickness of the text outline.
     * @returns The outline thickness.
     */
    get outlineThickness() {
        return this._outlineThickness;
    }

    /**
     * Sets the pivot of the element component: the point within its rectangle, as fractions of
     * its width and height, that sits on its position and that it rotates and scales about.
     * Defaults to `0 0`, the bottom-left corner; `0.5 0.5` centers it.
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
     * Sets the color of the text shadow, which is only drawn when `shadow-offset` is not `0 0`
     * (text elements only). Defaults to opaque black.
     * @param value - The shadow color.
     */
    set shadowColor(value: Color) {
        this._shadowColor = value;
        if (this.component) {
            this.component.shadowColor = value;
        }
    }

    /**
     * Gets the color of the text shadow, which is only drawn when `shadow-offset` is not `0 0`.
     * @returns The shadow color.
     */
    get shadowColor() {
        return this._shadowColor;
    }

    /**
     * Sets the offset of the text shadow, horizontally and vertically, each from -1 to 1 and
     * proportional to the font size (text elements only). Positive values shift the shadow right
     * and up. Defaults to `0 0`, no shadow.
     * @param value - The shadow offset.
     */
    set shadowOffset(value: Vec2) {
        this._shadowOffset = value;
        if (this.component) {
            this.component.shadowOffset = value;
        }
    }

    /**
     * Gets the offset of the text shadow.
     * @returns The shadow offset.
     */
    get shadowOffset() {
        return this._shadowOffset;
    }

    /**
     * Sets the spacing between the letters of the text, as a multiple of their normal spacing
     * (text elements only). Defaults to 1.
     * @param value - The letter spacing.
     */
    set spacing(value: number) {
        this._spacing = value;
        if (this.component) {
            this.component.spacing = value;
        }
    }

    /**
     * Gets the spacing between the letters of the text.
     * @returns The letter spacing.
     */
    get spacing() {
        return this._spacing;
    }

    /**
     * Sets the id of the `pc-asset` to use for the sprite (image elements only).
     * @param value - The sprite asset ID.
     */
    set spriteAsset(value: string) {
        this._spriteAsset = value;
        const asset = useAsset(value);
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
        const asset = useAsset(value);
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
     * Sets the width of the element component. Defaults to 32.
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
            'alignment',
            'anchor',
            'auto-width',
            'auto-height',
            'auto-fit-width',
            'auto-fit-height',
            'color',
            'enable-markup',
            'fit-mode',
            'font-asset',
            'font-size',
            'max-font-size',
            'min-font-size',
            'height',
            'justify',
            'line-height',
            'margin',
            'mask',
            'max-lines',
            'opacity',
            'outline-color',
            'outline-thickness',
            'pivot',
            'pixels-per-unit',
            'shadow-color',
            'shadow-offset',
            'spacing',
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

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'alignment':
                this.alignment = parseVec2(newValue, new Vec2(0.5, 0.5), name);
                break;
            case 'anchor':
                this.anchor = parseVec4(newValue, new Vec4(0, 0, 0, 0), name);
                break;
            case 'auto-width':
                this.autoWidth = parseBool(newValue, true);
                break;
            case 'auto-height':
                this.autoHeight = parseBool(newValue, true);
                break;
            case 'auto-fit-width':
                this.autoFitWidth = parseBool(newValue, false);
                break;
            case 'auto-fit-height':
                this.autoFitHeight = parseBool(newValue, false);
                break;
            case 'color':
                this.color = parseColor(newValue, Color.WHITE, name);
                break;
            case 'enable-markup':
                this.enableMarkup = parseBool(newValue, false);
                break;
            case 'fit-mode':
                this.fitMode = parseEnum(newValue, fitModes, 'stretch', name);
                break;
            case 'font-asset':
                this.fontAsset = newValue ?? '';
                break;
            case 'font-size':
                this.fontSize = parseNumber(newValue, 32, name);
                break;
            case 'max-font-size':
                this.maxFontSize = parseNumber(newValue, 32, name);
                break;
            case 'min-font-size':
                this.minFontSize = parseNumber(newValue, 8, name);
                break;
            case 'height':
                this.height = parseNumber(newValue, 32, name);
                break;
            case 'justify':
                this.justify = parseBool(newValue, false);
                break;
            case 'line-height':
                this.lineHeight = parseNumber(newValue, 32, name);
                break;
            case 'margin':
                this.margin = parseVec4(newValue, null, name);
                break;
            case 'mask':
                this.mask = parseBool(newValue, false);
                break;
            case 'max-lines':
                this.maxLines = parseNumber(newValue, null, name);
                break;
            case 'opacity':
                this.opacity = parseNumber(newValue, 1, name);
                break;
            case 'outline-color':
                this.outlineColor = parseColor(newValue, Color.BLACK, name);
                break;
            case 'outline-thickness':
                this.outlineThickness = parseNumber(newValue, 0, name);
                break;
            case 'pivot':
                this.pivot = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'pixels-per-unit':
                this.pixelsPerUnit = parseNumber(newValue, null, name);
                break;
            case 'shadow-color':
                this.shadowColor = parseColor(newValue, Color.BLACK, name);
                break;
            case 'shadow-offset':
                this.shadowOffset = parseVec2(newValue, new Vec2(0, 0), name);
                break;
            case 'spacing':
                this.spacing = parseNumber(newValue, 1, name);
                break;
            case 'sprite-asset':
                this.spriteAsset = newValue ?? '';
                break;
            case 'sprite-frame':
                this.spriteFrame = parseNumber(newValue, 0, name);
                break;
            case 'text':
                this.text = newValue ?? '';
                break;
            case 'texture-asset':
                this.textureAsset = newValue ?? '';
                break;
            case 'type':
                this.type = parseEnum(newValue, ['group', 'image', 'text'], 'group', name);
                break;
            case 'use-input':
                this.useInput = parseBool(newValue, false);
                break;
            case 'width':
                this.width = parseNumber(newValue, 32, name);
                break;
            case 'wrap-lines':
                this.wrapLines = parseBool(newValue, false);
                break;
        }
    }
}

customElements.define('pc-element', ElementComponentElement);

export { ElementComponentElement };
