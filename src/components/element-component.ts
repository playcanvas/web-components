import type { ElementComponent } from 'playcanvas';
import { Color, Vec2, Vec4 } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { attr, defineAttributes } from '../attributes';
import { parseNumber, parseVec4 } from '../parse';

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
    /**
     * The horizontal and vertical alignment of the text within the element. Each is from 0 to 1,
     * and applies to text elements only. Defaults to `0.5 0.5`, centered; `0 1` aligns to the top
     * left.
     */
    declare alignment: Vec2;

    /**
     * The anchor of the element component. It is the left, bottom, right and top edges as fractions
     * of the parent's size, in that order. Defaults to `0 0 0 0`, the parent's bottom-left corner;
     * `0.5 0.5 0.5 0.5` centers the element.
     */
    declare anchor: Vec4;

    /**
     * Whether a text element automatically reduces its font size to fit its height. The size goes
     * down to `min-font-size`, so that the text fits within the element's height. Requires
     * `auto-height` to be `false`.
     */
    declare autoFitHeight: boolean;

    /**
     * Whether a text element automatically reduces its font size to fit its width. The size goes
     * down to `min-font-size`, so that the text fits within the element's width. Requires
     * `auto-width` to be `false`.
     */
    declare autoFitWidth: boolean;

    /**
     * Whether the element component should automatically adjust its height. It adjusts to the text
     * content, and applies to text elements only.
     */
    declare autoHeight: boolean;

    /**
     * Whether the element component should automatically adjust its width. It adjusts to the text
     * content, and applies to text elements only.
     */
    declare autoWidth: boolean;

    /**
     * The color of the element component.
     */
    declare color: Color;

    /**
     * Whether the element component should use markup.
     */
    declare enableMarkup: boolean;

    /**
     * How the texture or sprite fits the element's rectangle. Applies to image elements only. Can
     * be:
     *
     * - `stretch` - Fills the rectangle exactly, ignoring the source aspect ratio.
     * - `contain` - Fits within the rectangle, preserving the source aspect ratio.
     * - `cover` - Covers the whole rectangle, preserving the source aspect ratio.
     *
     * Defaults to `stretch`.
     */
    declare fitMode: FitMode;

    /**
     * The font size of the element component.
     */
    declare fontSize: number;

    /**
     * The height of the element component. Defaults to 32.
     */
    declare height: number;

    /**
     * Whether wrapped lines are stretched flush with both edges of the element, which needs
     * `wrap-lines` and a fixed width. The gaps between their words are widened to do it, and it
     * applies to text elements only. The last line, and any line ended by an explicit line break,
     * follows `alignment` instead. Defaults to `false`.
     */
    declare justify: boolean;

    /**
     * The extra space between the letters of the text, as a fraction of the font size. Applies to
     * text elements only. 0.1 adds a tenth of the font size between each pair of characters, like
     * the CSS `letter-spacing` property, and a negative value tightens the text. It is added on top
     * of `spacing`. Defaults to 0.
     */
    declare letterSpacing: number;

    /**
     * The line height of the element component.
     */
    declare lineHeight: number;

    /**
     * Whether the element component is a mask. A mask clips its descendants to its bounds, and
     * applies to image elements only.
     */
    declare mask: boolean;

    /**
     * The largest font size a text element may use when auto-fitting.
     */
    declare maxFontSize: number;

    /**
     * The maximum number of lines `wrap-lines` wraps the text onto. Any leftover text is appended
     * to the last line, and it applies to text elements only. Defaults to `null`, no limit.
     */
    declare maxLines: number | null;

    /**
     * The smallest font size a text element may use when auto-fitting.
     */
    declare minFontSize: number;

    /**
     * The opacity of the element component. It ranges from 0 to 1.
     */
    declare opacity: number;

    /**
     * The color of the text outline, which is only drawn when `outline-thickness` is above 0.
     * Applies to text elements only. Defaults to opaque black.
     */
    declare outlineColor: Color;

    /**
     * The thickness of the text outline. It ranges from 0 to 1, and applies to text elements only.
     * Defaults to 0, no outline.
     */
    declare outlineThickness: number;

    /**
     * The pivot of the element component. It is the point within its rectangle, as fractions of its
     * width and height, that sits on its position and that it rotates and scales about. Defaults to
     * `0 0`, the bottom-left corner; `0.5 0.5` centers it.
     */
    declare pivot: Vec2;

    /**
     * The color of the text shadow, which is only drawn when `shadow-offset` is not `0 0`. Applies
     * to text elements only. Defaults to opaque black.
     */
    declare shadowColor: Color;

    /**
     * The offset of the text shadow. It is horizontal then vertical, each from -1 to 1 and
     * proportional to the font size, and applies to text elements only. Positive values shift the
     * shadow right and up. Defaults to `0 0`, no shadow.
     */
    declare shadowOffset: Vec2;

    /**
     * The spacing between the letters of the text. It is a multiple of their normal spacing, and
     * applies to text elements only. Defaults to 1.
     */
    declare spacing: number;

    /**
     * The frame of the sprite to render. Applies to image elements only.
     */
    declare spriteFrame: number;

    /**
     * The text of the element component.
     */
    declare text: string;

    /**
     * The type of the element component.
     */
    declare type: 'group' | 'image' | 'text';

    /**
     * Whether the element component accepts input events. Buttons and scrolling require it.
     */
    declare useInput: boolean;

    /**
     * The width of the element component. Defaults to 32.
     */
    declare width: number;

    /**
     * Whether the element component should wrap lines.
     */
    declare wrapLines: boolean;

    private _fontAsset = '';

    private _margin: Vec4 | null = null;

    private _pixelsPerUnit: number | null = null;

    private _spriteAsset = '';

    private _textureAsset = '';

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
        const data: Record<string, any> = { ...super.getInitialComponentData() };

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

        // Margins are only passed when authored. For stretched (split) anchors they govern the
        // element size; for point anchors width/height take over (handled by the engine). Without
        // them, the engine places each point-anchored axis at the entity's position.
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

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'font-asset',
            'margin',
            'pixels-per-unit',
            'sprite-asset',
            'texture-asset'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'font-asset':
                this.fontAsset = newValue ?? '';
                break;
            case 'margin':
                this.margin = parseVec4(newValue, null, name);
                break;
            case 'pixels-per-unit':
                this.pixelsPerUnit = parseNumber(newValue, null, name);
                break;
            case 'sprite-asset':
                this.spriteAsset = newValue ?? '';
                break;
            case 'texture-asset':
                this.textureAsset = newValue ?? '';
                break;
        }
    }
}

defineAttributes(ElementComponentElement, 'component', {
    alignment: attr.vec2(new Vec2(0.5, 0.5)),
    anchor: attr.vec4(new Vec4(0, 0, 0, 0)),
    autoFitHeight: attr.bool(false),
    autoFitWidth: attr.bool(false),
    autoHeight: attr.bool(true),
    autoWidth: attr.bool(true),
    color: attr.color(Color.WHITE),
    enableMarkup: attr.bool(false),
    fitMode: attr.oneOf(fitModes, 'stretch'),
    fontSize: attr.number(32),
    height: attr.number(32),
    justify: attr.bool(false),
    letterSpacing: attr.number(0),
    lineHeight: attr.number(32),
    mask: attr.bool(false),
    maxFontSize: attr.number(32),
    maxLines: attr.number(null).to((value) => value as number),
    minFontSize: attr.number(8),
    opacity: attr.number(1),
    outlineColor: attr.color(Color.BLACK),
    outlineThickness: attr.number(0),
    pivot: attr.vec2(new Vec2(0, 0)),
    shadowColor: attr.color(Color.BLACK),
    shadowOffset: attr.vec2(new Vec2(0, 0)),
    spacing: attr.number(1),
    spriteFrame: attr.number(0),
    text: attr.string(''),
    type: attr.oneOf(['group', 'image', 'text'], 'group'),
    useInput: attr.bool(false),
    width: attr.number(32),
    wrapLines: attr.bool(false)
});

globalThis.customElements?.define('pc-element', ElementComponentElement);

export { ElementComponentElement };
