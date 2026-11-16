import type { ButtonComponent } from 'playcanvas';
import { BUTTON_TRANSITION_MODE_SPRITE_CHANGE, BUTTON_TRANSITION_MODE_TINT, Color, Vec4 } from 'playcanvas';

import { useAsset } from '../asset-binding';
import { attr, defineAttributes } from '../attributes';
import { resolveEntity } from '../entity-reference';

import { ComponentElement } from './component';

const transitionModes = new Map<'tint' | 'sprite', number>([
    ['tint', BUTTON_TRANSITION_MODE_TINT],
    ['sprite', BUTTON_TRANSITION_MODE_SPRITE_CHANGE]
]);

/**
 * The ButtonComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-button/ | `<pc-button>`} elements.
 * The ButtonComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ButtonComponent} (`button`).
 *
 * @elementSummary The `<pc-button>` element makes its entity respond to pointer input, tinting or
 * swapping its image as the pointer hovers, presses and releases it. The entity also needs a
 * `<pc-element>` with `use-input` set. Must be a child of a `<pc-entity>`, `<pc-model>` or
 * `<pc-node>`.
 *
 * @category Components
 */
class ButtonComponentElement extends ComponentElement<ButtonComponent> {
    /**
     * Whether the button is active. An active button responds to input.
     */
    declare active: boolean;

    /**
     * The duration over which tint transitions are applied. It is in milliseconds.
     */
    declare fadeDuration: number;

    /**
     * The padding used to expand the button's hit area. It is a Vec4: left, bottom, right, top.
     */
    declare hitPadding: Vec4;

    /**
     * The frame of the hover sprite to show.
     */
    declare hoverSpriteFrame: number;

    /**
     * The hover tint color. It is applied to the image entity when the button is hovered, in the
     * tint transition mode. Defaults to `0.75 0.75 0.75 1`.
     */
    declare hoverTint: Color;

    /**
     * The frame of the inactive sprite to show.
     */
    declare inactiveSpriteFrame: number;

    /**
     * The inactive tint color. It is applied to the image entity when the button is inactive, in
     * the tint transition mode. Defaults to `0.25 0.25 0.25 1`.
     */
    declare inactiveTint: Color;

    /**
     * The frame of the pressed sprite to show.
     */
    declare pressedSpriteFrame: number;

    /**
     * The pressed tint color. It is applied to the image entity when the button is pressed, in the
     * tint transition mode. Defaults to `0.5 0.5 0.5 1`.
     */
    declare pressedTint: Color;

    /**
     * How the button reacts to being hovered/pressed. Can be `tint` or `sprite`. Defaults to
     * `tint`.
     */
    declare transitionMode: 'tint' | 'sprite';

    private _image = '';

    private _hoverSpriteAsset = '';

    private _pressedSpriteAsset = '';

    private _inactiveSpriteAsset = '';

    /** @ignore */
    constructor() {
        super('button');
    }

    protected getInitialComponentData() {
        const data: Record<string, any> = { ...super.getInitialComponentData() };

        // The image entity defaults to the button's own entity (which carries the image element)
        // when no explicit reference is provided.
        const imageEntity = this._image
            ? resolveEntity(this._image, this, 'image', 'reference ignored')
            : this.closestEntity?.entity;
        if (imageEntity) {
            data.imageEntity = imageEntity;
        }

        const hoverSpriteAsset = useAsset(this._hoverSpriteAsset);
        if (hoverSpriteAsset) {
            data.hoverSpriteAsset = hoverSpriteAsset.id;
        }

        const pressedSpriteAsset = useAsset(this._pressedSpriteAsset);
        if (pressedSpriteAsset) {
            data.pressedSpriteAsset = pressedSpriteAsset.id;
        }

        const inactiveSpriteAsset = useAsset(this._inactiveSpriteAsset);
        if (inactiveSpriteAsset) {
            data.inactiveSpriteAsset = inactiveSpriteAsset.id;
        }

        return data;
    }

    /**
     * Gets the underlying PlayCanvas button component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The button component, or `null`.
     */
    get component(): ButtonComponent | null {
        return super.component;
    }

    /**
     * Sets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity whose image element is used for visual transitions. An exact name
     * resolves against the nearest enclosing entity first, then outward, then the document.
     * Defaults to the button's own entity — inside a `<pc-model>`, that is the model's host
     * entity, so supply an explicit reference to target a UI entity instead. A non-empty
     * reference that does not resolve warns and is ignored.
     * @param value - The image entity reference.
     */
    set image(value: string) {
        this._image = value;
        if (this.component) {
            const entity = resolveEntity(value, this, 'image', 'reference ignored');
            if (entity) {
                this.component.imageEntity = entity;
            }
        }
    }

    /**
     * Gets the reference (a `pc-entity`, `pc-model` or `pc-node` name, or a document-wide `#`
     * selector) to the entity whose image element is used for visual transitions, or empty for
     * the button's own entity.
     * @returns The image entity reference.
     */
    get image() {
        return this._image;
    }

    /**
     * Sets the id of the `pc-asset` sprite shown when the button is hovered (sprite transition
     * mode).
     * @param value - The hover sprite asset id.
     */
    set hoverSpriteAsset(value: string) {
        this._hoverSpriteAsset = value;
        const asset = useAsset(value);
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
     * Sets the id of the `pc-asset` sprite shown when the button is pressed (sprite transition
     * mode).
     * @param value - The pressed sprite asset id.
     */
    set pressedSpriteAsset(value: string) {
        this._pressedSpriteAsset = value;
        const asset = useAsset(value);
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
     * Sets the id of the `pc-asset` sprite shown when the button is inactive (sprite transition
     * mode).
     * @param value - The inactive sprite asset id.
     */
    set inactiveSpriteAsset(value: string) {
        this._inactiveSpriteAsset = value;
        const asset = useAsset(value);
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

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'image',
            'hover-sprite-asset',
            'pressed-sprite-asset',
            'inactive-sprite-asset'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'image':
                this.image = newValue ?? '';
                break;
            case 'hover-sprite-asset':
                this.hoverSpriteAsset = newValue ?? '';
                break;
            case 'pressed-sprite-asset':
                this.pressedSpriteAsset = newValue ?? '';
                break;
            case 'inactive-sprite-asset':
                this.inactiveSpriteAsset = newValue ?? '';
                break;
        }
    }
}

defineAttributes(ButtonComponentElement, 'component', {
    active: attr.bool(true),
    fadeDuration: attr.number(0),
    hitPadding: attr.vec4(Vec4.ZERO),
    hoverSpriteFrame: attr.number(0),
    hoverTint: attr.color(new Color(0.75, 0.75, 0.75, 1)),
    inactiveSpriteFrame: attr.number(0),
    inactiveTint: attr.color(new Color(0.25, 0.25, 0.25, 1)),
    pressedSpriteFrame: attr.number(0),
    pressedTint: attr.color(new Color(0.5, 0.5, 0.5, 1)),
    transitionMode: attr.oneOf(transitionModes, 'tint')
});

globalThis.customElements?.define('pc-button', ButtonComponentElement);

export { ButtonComponentElement };
