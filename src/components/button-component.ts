import { BUTTON_TRANSITION_MODE_SPRITE_CHANGE, BUTTON_TRANSITION_MODE_TINT, ButtonComponent, Color, Vec4 } from 'playcanvas';

import { AssetElement } from '../asset';
import { ComponentElement } from './component';
import { getEntity, parseColor, parseEnum, parseVec4 } from '../utils';

const transitionModes = new Map<string, number>([
    ['tint', BUTTON_TRANSITION_MODE_TINT],
    ['sprite', BUTTON_TRANSITION_MODE_SPRITE_CHANGE]
]);

/**
 * The ButtonComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-button/ | `<pc-button>`} elements.
 * The ButtonComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ButtonComponentElement extends ComponentElement {
    private _active = true;

    private _image = '';

    private _hitPadding = new Vec4(0, 0, 0, 0);

    private _transitionMode: number = BUTTON_TRANSITION_MODE_TINT;

    private _hoverTint = new Color(1, 1, 1, 1);

    private _pressedTint = new Color(1, 1, 1, 1);

    private _inactiveTint = new Color(1, 1, 1, 1);

    private _fadeDuration = 0;

    private _hoverSpriteAsset = '';

    private _hoverSpriteFrame = 0;

    private _pressedSpriteAsset = '';

    private _pressedSpriteFrame = 0;

    private _inactiveSpriteAsset = '';

    private _inactiveSpriteFrame = 0;

    /** @ignore */
    constructor() {
        super('button');
    }

    getInitialComponentData() {
        const data: Record<string, any> = {
            active: this._active,
            hitPadding: this._hitPadding,
            transitionMode: this._transitionMode,
            hoverTint: this._hoverTint,
            pressedTint: this._pressedTint,
            inactiveTint: this._inactiveTint,
            fadeDuration: this._fadeDuration,
            hoverSpriteFrame: this._hoverSpriteFrame,
            pressedSpriteFrame: this._pressedSpriteFrame,
            inactiveSpriteFrame: this._inactiveSpriteFrame
        };

        // The image entity defaults to the button's own entity (which carries the image element)
        // when no explicit reference is provided.
        const imageEntity = this._image ? getEntity(this._image) : this.closestEntity?.entity;
        if (imageEntity) {
            data.imageEntity = imageEntity;
        }

        const hoverSpriteAsset = AssetElement.get(this._hoverSpriteAsset);
        if (hoverSpriteAsset) {
            data.hoverSpriteAsset = hoverSpriteAsset.id;
        }

        const pressedSpriteAsset = AssetElement.get(this._pressedSpriteAsset);
        if (pressedSpriteAsset) {
            data.pressedSpriteAsset = pressedSpriteAsset.id;
        }

        const inactiveSpriteAsset = AssetElement.get(this._inactiveSpriteAsset);
        if (inactiveSpriteAsset) {
            data.inactiveSpriteAsset = inactiveSpriteAsset.id;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas button component.
     * @returns The button component.
     */
    get component(): ButtonComponent | null {
        return super.component as ButtonComponent | null;
    }

    /**
     * Sets whether the button is active and responds to input.
     * @param value - Whether the button is active.
     */
    set active(value: boolean) {
        this._active = value;
        if (this.component) {
            this.component.active = value;
        }
    }

    /**
     * Gets whether the button is active.
     * @returns Whether the button is active.
     */
    get active() {
        return this._active;
    }

    /**
     * Sets the reference (CSS selector, element id or entity name) to the `<pc-entity>` whose image
     * element is used for visual transitions. Defaults to the button's own entity.
     * @param value - The image entity reference.
     */
    set image(value: string) {
        this._image = value;
        const entity = getEntity(value);
        if (this.component && entity) {
            this.component.imageEntity = entity;
        }
    }

    /**
     * Gets the reference to the `<pc-entity>` whose image element is used for visual transitions.
     * @returns The image entity reference.
     */
    get image() {
        return this._image;
    }

    /**
     * Sets the padding used to expand the button's hit area, as a Vec4 (left, bottom, right, top).
     * @param value - The hit padding.
     */
    set hitPadding(value: Vec4) {
        this._hitPadding = value;
        if (this.component) {
            this.component.hitPadding = value;
        }
    }

    /**
     * Gets the padding used to expand the button's hit area.
     * @returns The hit padding.
     */
    get hitPadding() {
        return this._hitPadding;
    }

    /**
     * Sets how the button reacts to being hovered/pressed. Can be `tint` (0) or `sprite` (1).
     * @param value - The transition mode.
     */
    set transitionMode(value: number) {
        this._transitionMode = value;
        if (this.component) {
            this.component.transitionMode = value;
        }
    }

    /**
     * Gets how the button reacts to being hovered/pressed.
     * @returns The transition mode.
     */
    get transitionMode() {
        return this._transitionMode;
    }

    /**
     * Sets the tint color applied to the image entity when the button is hovered (tint transition
     * mode).
     * @param value - The hover tint.
     */
    set hoverTint(value: Color) {
        this._hoverTint = value;
        if (this.component) {
            this.component.hoverTint = value;
        }
    }

    /**
     * Gets the hover tint color.
     * @returns The hover tint.
     */
    get hoverTint() {
        return this._hoverTint;
    }

    /**
     * Sets the tint color applied to the image entity when the button is pressed (tint transition
     * mode).
     * @param value - The pressed tint.
     */
    set pressedTint(value: Color) {
        this._pressedTint = value;
        if (this.component) {
            this.component.pressedTint = value;
        }
    }

    /**
     * Gets the pressed tint color.
     * @returns The pressed tint.
     */
    get pressedTint() {
        return this._pressedTint;
    }

    /**
     * Sets the tint color applied to the image entity when the button is inactive (tint transition
     * mode).
     * @param value - The inactive tint.
     */
    set inactiveTint(value: Color) {
        this._inactiveTint = value;
        if (this.component) {
            this.component.inactiveTint = value;
        }
    }

    /**
     * Gets the inactive tint color.
     * @returns The inactive tint.
     */
    get inactiveTint() {
        return this._inactiveTint;
    }

    /**
     * Sets the duration (in milliseconds) over which tint transitions are applied.
     * @param value - The fade duration.
     */
    set fadeDuration(value: number) {
        this._fadeDuration = value;
        if (this.component) {
            this.component.fadeDuration = value;
        }
    }

    /**
     * Gets the duration over which tint transitions are applied.
     * @returns The fade duration.
     */
    get fadeDuration() {
        return this._fadeDuration;
    }

    /**
     * Sets the id of the `pc-asset` sprite shown when the button is hovered (sprite transition
     * mode).
     * @param value - The hover sprite asset id.
     */
    set hoverSpriteAsset(value: string) {
        this._hoverSpriteAsset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.hoverSpriteAsset = asset.id as any;
        }
    }

    /**
     * Gets the id of the `pc-asset` sprite shown when the button is hovered.
     * @returns The hover sprite asset id.
     */
    get hoverSpriteAsset() {
        return this._hoverSpriteAsset;
    }

    /**
     * Sets the frame of the hover sprite to show.
     * @param value - The hover sprite frame.
     */
    set hoverSpriteFrame(value: number) {
        this._hoverSpriteFrame = value;
        if (this.component) {
            this.component.hoverSpriteFrame = value;
        }
    }

    /**
     * Gets the frame of the hover sprite to show.
     * @returns The hover sprite frame.
     */
    get hoverSpriteFrame() {
        return this._hoverSpriteFrame;
    }

    /**
     * Sets the id of the `pc-asset` sprite shown when the button is pressed (sprite transition
     * mode).
     * @param value - The pressed sprite asset id.
     */
    set pressedSpriteAsset(value: string) {
        this._pressedSpriteAsset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.pressedSpriteAsset = asset.id as any;
        }
    }

    /**
     * Gets the id of the `pc-asset` sprite shown when the button is pressed.
     * @returns The pressed sprite asset id.
     */
    get pressedSpriteAsset() {
        return this._pressedSpriteAsset;
    }

    /**
     * Sets the frame of the pressed sprite to show.
     * @param value - The pressed sprite frame.
     */
    set pressedSpriteFrame(value: number) {
        this._pressedSpriteFrame = value;
        if (this.component) {
            this.component.pressedSpriteFrame = value;
        }
    }

    /**
     * Gets the frame of the pressed sprite to show.
     * @returns The pressed sprite frame.
     */
    get pressedSpriteFrame() {
        return this._pressedSpriteFrame;
    }

    /**
     * Sets the id of the `pc-asset` sprite shown when the button is inactive (sprite transition
     * mode).
     * @param value - The inactive sprite asset id.
     */
    set inactiveSpriteAsset(value: string) {
        this._inactiveSpriteAsset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.inactiveSpriteAsset = asset.id as any;
        }
    }

    /**
     * Gets the id of the `pc-asset` sprite shown when the button is inactive.
     * @returns The inactive sprite asset id.
     */
    get inactiveSpriteAsset() {
        return this._inactiveSpriteAsset;
    }

    /**
     * Sets the frame of the inactive sprite to show.
     * @param value - The inactive sprite frame.
     */
    set inactiveSpriteFrame(value: number) {
        this._inactiveSpriteFrame = value;
        if (this.component) {
            this.component.inactiveSpriteFrame = value;
        }
    }

    /**
     * Gets the frame of the inactive sprite to show.
     * @returns The inactive sprite frame.
     */
    get inactiveSpriteFrame() {
        return this._inactiveSpriteFrame;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'active',
            'image',
            'hit-padding',
            'transition-mode',
            'hover-tint',
            'pressed-tint',
            'inactive-tint',
            'fade-duration',
            'hover-sprite-asset',
            'hover-sprite-frame',
            'pressed-sprite-asset',
            'pressed-sprite-frame',
            'inactive-sprite-asset',
            'inactive-sprite-frame'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'active':
                this.active = newValue !== 'false';
                break;
            case 'image':
                this.image = newValue;
                break;
            case 'hit-padding':
                this.hitPadding = parseVec4(newValue);
                break;
            case 'transition-mode':
                this.transitionMode = parseEnum(newValue, transitionModes, BUTTON_TRANSITION_MODE_TINT);
                break;
            case 'hover-tint':
                this.hoverTint = parseColor(newValue);
                break;
            case 'pressed-tint':
                this.pressedTint = parseColor(newValue);
                break;
            case 'inactive-tint':
                this.inactiveTint = parseColor(newValue);
                break;
            case 'fade-duration':
                this.fadeDuration = Number(newValue);
                break;
            case 'hover-sprite-asset':
                this.hoverSpriteAsset = newValue;
                break;
            case 'hover-sprite-frame':
                this.hoverSpriteFrame = Number(newValue);
                break;
            case 'pressed-sprite-asset':
                this.pressedSpriteAsset = newValue;
                break;
            case 'pressed-sprite-frame':
                this.pressedSpriteFrame = Number(newValue);
                break;
            case 'inactive-sprite-asset':
                this.inactiveSpriteAsset = newValue;
                break;
            case 'inactive-sprite-frame':
                this.inactiveSpriteFrame = Number(newValue);
                break;
        }
    }
}

customElements.define('pc-button', ButtonComponentElement);

export { ButtonComponentElement };
