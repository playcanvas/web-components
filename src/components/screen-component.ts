import type { ScreenComponent } from 'playcanvas';
import { SCALEMODE_BLEND, SCALEMODE_NONE, Vec2 } from 'playcanvas';

import { attr, defineAttributes } from '../attributes';

import { ComponentElement } from './component';

// The engine's SCALEMODE_* constants are the strings 'none' and 'blend', so this map happens to be
// an identity. It is still the right shape: it supplies the attribute's valid names, it is what the
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
    /**
     * The order in which the screen is drawn relative to other screens in the same layer, from 0 to
     * 127, with higher values drawn on top and receiving input first. Defaults to 0.
     */
    declare priority: number;

    /**
     * The resolution the screen's layout was designed for, as a width and height in pixels. Used
     * only when `screenSpace` is set and `scaleMode` is `blend`, when the contents scale from this
     * resolution to the actual canvas size, weighted by `scaleBlend`. Defaults to 640 by 320.
     */
    declare referenceResolution: Vec2;

    /**
     * The width and height of the screen in pixels, which a screen-space screen overrides with the
     * canvas size. A world-space screen uses it to size its contents. Defaults to 640 by 320.
     */
    declare resolution: Vec2;

    /**
     * How the canvas's width and height are weighted against each other. Each is measured against
     * `referenceResolution`, and the weighting applies when `scaleMode` is `blend`: from 0 (scale
     * by the width alone) to 1 (scale by the height alone). Ignored while `scaleMode` is `none`.
     */
    declare scaleBlend: number;

    /**
     * How the screen scales its contents. `none` renders at `resolution` and ignores
     * `referenceResolution`; `blend` scales them from `referenceResolution` to fit the canvas's
     * width, its height or a mix of the two, as `scaleBlend` sets, which is what keeps a UI laid
     * out at one resolution usable at another. Requires `screenSpace` - the engine forces `none` on
     * a world-space screen, which does not support scaling.
     */
    declare scaleMode: 'none' | 'blend';

    /**
     * Whether the screen renders its `<pc-element>` descendants in screen space rather than in the
     * world. Screen space is a 2D overlay on the canvas. Defaults to `false`.
     */
    declare screenSpace: boolean;

    /** @ignore */
    constructor() {
        super('screen');
    }

    /**
     * Gets the underlying PlayCanvas screen component. `null` until the element is
     * ready — see {@link ComponentElement.component}.
     * @returns The screen component, or `null`.
     */
    get component(): ScreenComponent | null {
        return super.component;
    }
}

defineAttributes(ScreenComponentElement, 'component', {
    priority: attr.number(0),
    referenceResolution: attr.vec2(new Vec2(640, 320)),
    resolution: attr.vec2(new Vec2(640, 320)),
    scaleBlend: attr.number(0.5),
    scaleMode: attr.oneOf(scaleModes, 'none'),
    screenSpace: attr.bool(false)
});

globalThis.customElements?.define('pc-screen', ScreenComponentElement);

export { ScreenComponentElement };
