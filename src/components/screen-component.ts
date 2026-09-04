import type { ScreenComponent } from 'playcanvas';
import { SCALEMODE_BLEND, SCALEMODE_NONE, Vec2 } from 'playcanvas';

import { parseBool, parseEnum, parseNumber, parseVec2 } from '../parse';

import { ComponentElement } from './component';

// The engine's SCALEMODE_* constants are the strings 'none' and 'blend', so this map happens to be
// an identity. It is still the right shape: it supplies parseEnum's valid-name list, it is what the
// manifest generator reads the enum values from, and it keeps the attribute vocabulary independent
// of constants the engine is free to change.
const scaleModes = new Map<'none' | 'blend', string>([
    ['none', SCALEMODE_NONE],
    ['blend', SCALEMODE_BLEND]
]);

/**
 * The ScreenComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-screen/ | `<pc-screen>`} elements.
 * The ScreenComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * Engine component: {@link ScreenComponent} (`screen`).
 *
 * @elementSummary The `<pc-screen>` element gives its entity a 2D space — in screen space or in the
 * world — that a hierarchy of `<pc-element>` descendants lays out inside. Must be a child of a
 * `<pc-entity>`, `<pc-model>` or `<pc-node>`.
 *
 * @category Components
 */
class ScreenComponentElement extends ComponentElement<ScreenComponent> {
    private _screenSpace = false;

    private _resolution: Vec2 = new Vec2(640, 320);

    private _referenceResolution: Vec2 = new Vec2(640, 320);

    private _priority = 0;

    private _scaleMode: 'none' | 'blend' = 'none';

    private _scaleBlend = 0.5;

    /** @ignore */
    constructor() {
        super('screen');
    }

    protected getInitialComponentData() {
        return {
            priority: this._priority,
            referenceResolution: this._referenceResolution,
            resolution: this._resolution,
            scaleBlend: this._scaleBlend,
            scaleMode: scaleModes.get(this._scaleMode) ?? SCALEMODE_NONE,
            screenSpace: this._screenSpace
        };
    }

    /**
     * Gets the underlying PlayCanvas screen component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The screen component, or `null`.
     */
    get component(): ScreenComponent | null {
        return super.component;
    }

    /**
     * Sets the order in which the screen is drawn relative to other screens in the same layer, from
     * 0 to 255, with higher values drawn on top. Defaults to 0.
     * @param value - The priority.
     */
    set priority(value: number) {
        this._priority = value;
        if (this.component) {
            this.component.priority = this._priority;
        }
    }

    /**
     * Gets the order in which the screen is drawn relative to other screens in the same layer, from
     * 0 to 255, with higher values drawn on top.
     * @returns The priority.
     */
    get priority() {
        return this._priority;
    }

    /**
     * Sets the resolution the screen's layout was designed for, as a width and height in pixels.
     * Used only when `screenSpace` is set and `scaleMode` is `blend`, when the contents scale from
     * this resolution to the actual canvas size, weighted by `scaleBlend`. Defaults to 640 by 320.
     * @param value - The reference resolution.
     */
    set referenceResolution(value: Vec2) {
        this._referenceResolution = value;
        if (this.component) {
            this.component.referenceResolution = this._referenceResolution;
        }
    }

    /**
     * Gets the resolution the screen's layout was designed for, as a width and height in pixels.
     * @returns The reference resolution.
     */
    get referenceResolution() {
        return this._referenceResolution;
    }

    /**
     * Sets the width and height of the screen in pixels. A screen-space screen ignores this and
     * always matches the canvas; a world-space screen uses it to size its contents. Defaults to 640
     * by 320.
     * @param value - The resolution.
     */
    set resolution(value: Vec2) {
        this._resolution = value;
        if (this.component) {
            this.component.resolution = this._resolution;
        }
    }

    /**
     * Gets the width and height of the screen in pixels, which a screen-space screen overrides with
     * the canvas size.
     * @returns The resolution.
     */
    get resolution() {
        return this._resolution;
    }

    /**
     * Sets how the screen's `resolution` and `referenceResolution` are weighted against each other
     * when `scaleMode` is `blend`, from 0 (follow the resolution) to 1 (follow the reference
     * resolution). Ignored while `scaleMode` is `none`.
     * @param value - The scale blend factor.
     */
    set scaleBlend(value: number) {
        this._scaleBlend = value;
        if (this.component) {
            this.component.scaleBlend = this._scaleBlend;
        }
    }

    /**
     * Gets how the screen's resolutions are weighted against each other.
     * @returns The scale blend factor.
     */
    get scaleBlend() {
        return this._scaleBlend;
    }

    /**
     * Sets how the screen scales its contents. `none` renders at `resolution` and ignores
     * `referenceResolution`; `blend` scales between the two, weighted by `scaleBlend`, which is what
     * keeps a UI laid out at one resolution usable at another. Requires `screenSpace` - the engine
     * forces `none` on a world-space screen, which does not support scaling.
     * @param value - The scale mode ('none' or 'blend').
     */
    set scaleMode(value: 'none' | 'blend') {
        this._scaleMode = value;
        if (this.component) {
            this.component.scaleMode = scaleModes.get(value) ?? SCALEMODE_NONE;
        }
    }

    /**
     * Gets how the screen scales its contents.
     * @returns The scale mode.
     */
    get scaleMode() {
        return this._scaleMode;
    }

    /**
     * Sets whether the screen renders its `<pc-element>` descendants in screen space, as a 2D
     * overlay on the canvas, rather than in the world. Defaults to `false`.
     * @param value - Whether the screen is in screen space.
     */
    set screenSpace(value: boolean) {
        this._screenSpace = value;
        if (this.component) {
            this.component.screenSpace = this._screenSpace;
        }
    }

    /**
     * Gets whether the screen renders its `<pc-element>` descendants in screen space rather than in
     * the world.
     * @returns Whether the screen is in screen space.
     */
    get screenSpace() {
        return this._screenSpace;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'screen-space',
            'resolution',
            'reference-resolution',
            'priority',
            'scale-blend',
            'scale-mode'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'priority':
                this.priority = parseNumber(newValue, 0, name);
                break;
            case 'reference-resolution':
                this.referenceResolution = parseVec2(newValue, new Vec2(640, 320), name);
                break;
            case 'resolution':
                this.resolution = parseVec2(newValue, new Vec2(640, 320), name);
                break;
            case 'scale-blend':
                this.scaleBlend = parseNumber(newValue, 0.5, name);
                break;
            case 'scale-mode':
                this.scaleMode = parseEnum(newValue, scaleModes, 'none', name);
                break;
            case 'screen-space':
                this.screenSpace = parseBool(newValue, false);
                break;
        }
    }
}

customElements.define('pc-screen', ScreenComponentElement);

export { ScreenComponentElement };
