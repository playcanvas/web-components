import { SCALEMODE_BLEND, SCALEMODE_NONE, ScreenComponent, Vec2 } from 'playcanvas';

import { ComponentElement } from './component';
import { parseVec2 } from '../utils';

/**
 * The ScreenComponentElement interface provides properties and methods for manipulating
 * `<pc-screen>` elements. The ScreenComponentElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScreenComponentElement extends ComponentElement {
    private _screenSpace = false;

    private _resolution: Vec2 = new Vec2(640, 320);

    private _referenceResolution: Vec2 = new Vec2(640, 320);

    private _priority = 0;

    private _blend = false;

    private _scaleBlend = 0.5;

    /** @ignore */
    constructor() {
        super('screen');
    }

    getInitialComponentData() {
        return {
            priority: this._priority,
            referenceResolution: this._referenceResolution,
            resolution: this._resolution,
            scaleBlend: this._scaleBlend,
            scaleMode: this._blend ? SCALEMODE_BLEND : SCALEMODE_NONE,
            screenSpace: this._screenSpace
        };
    }

    /**
     * Gets the underlying PlayCanvas screen component.
     * @returns The screen component.
     */
    get component(): ScreenComponent | null {
        return super.component as ScreenComponent | null;
    }

    set priority(value: number) {
        this._priority = value;
        if (this.component) {
            this.component.priority = this._priority;
        }
    }

    get priority() {
        return this._priority;
    }

    set referenceResolution(value: Vec2) {
        this._referenceResolution = value;
        if (this.component) {
            this.component.referenceResolution = this._referenceResolution;
        }
    }

    get referenceResolution() {
        return this._referenceResolution;
    }

    set resolution(value: Vec2) {
        this._resolution = value;
        if (this.component) {
            this.component.resolution = this._resolution;
        }
    }

    get resolution() {
        return this._resolution;
    }

    set scaleBlend(value: number) {
        this._scaleBlend = value;
        if (this.component) {
            this.component.scaleBlend = this._scaleBlend;
        }
    }

    get scaleBlend() {
        return this._scaleBlend;
    }

    set blend(value: boolean) {
        this._blend = value;
        if (this.component) {
            this.component.scaleMode = this._blend ? SCALEMODE_BLEND : SCALEMODE_NONE;
        }
    }

    get blend() {
        return this._blend;
    }

    set screenSpace(value: boolean) {
        this._screenSpace = value;
        if (this.component) {
            this.component.screenSpace = this._screenSpace;
        }
    }

    get screenSpace() {
        return this._screenSpace;
    }

    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'blend',
            'screen-space',
            'resolution',
            'reference-resolution',
            'priority',
            'scale-blend'
        ];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'priority':
                this.priority = parseInt(newValue, 10);
                break;
            case 'reference-resolution':
                this.referenceResolution = parseVec2(newValue);
                break;
            case 'resolution':
                this.resolution = parseVec2(newValue);
                break;
            case 'scale-blend':
                this.scaleBlend = parseFloat(newValue);
                break;
            case 'blend':
                this.blend = this.hasAttribute('blend');
                break;
            case 'screen-space':
                this.screenSpace = this.hasAttribute('screen-space');
                break;
        }
    }
}

customElements.define('pc-screen', ScreenComponentElement);

export { ScreenComponentElement };
