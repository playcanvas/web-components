import { CollisionComponent, Quat, Vec3 } from 'playcanvas';

import { ComponentElement } from './component';
import { parseQuat, parseVec3 } from '../utils';

/**
 * The CollisionComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-collision/ | `<pc-collision>`} elements.
 * The CollisionComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class CollisionComponentElement extends ComponentElement {
    private _angularOffset: Quat = new Quat();

    private _axis: number = 1;

    private _convexHull: boolean = false;

    private _halfExtents: Vec3 = new Vec3(0.5, 0.5, 0.5);

    private _height: number = 2;

    private _linearOffset: Vec3 = new Vec3();

    private _radius: number = 0.5;

    private _type: string = 'box';

    /** @ignore */
    constructor() {
        super('collision');
    }

    getInitialComponentData() {
        return {
            axis: this._axis,
            angularOffset: this._angularOffset,
            convexHull: this._convexHull,
            halfExtents: this._halfExtents,
            height: this._height,
            linearOffset: this._linearOffset,
            radius: this._radius,
            type: this._type
        };
    }

    /**
     * Gets the underlying PlayCanvas collision component.
     * @returns The collision component.
     */
    get component(): CollisionComponent | null {
        return super.component as CollisionComponent | null;
    }

    set angularOffset(value: Quat) {
        this._angularOffset = value;
        if (this.component) {
            this.component.angularOffset = value;
        }
    }

    get angularOffset() {
        return this._angularOffset;
    }

    set axis(value: number) {
        this._axis = value;
        if (this.component) {
            this.component.axis = value;
        }
    }

    get axis() {
        return this._axis;
    }

    set convexHull(value: boolean) {
        this._convexHull = value;
        if (this.component) {
            this.component.convexHull = value;
        }
    }

    get convexHull() {
        return this._convexHull;
    }

    set halfExtents(value: Vec3) {
        this._halfExtents = value;
        if (this.component) {
            this.component.halfExtents = value;
        }
    }

    get halfExtents() {
        return this._halfExtents;
    }

    set height(value: number) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }

    get height() {
        return this._height;
    }

    set linearOffset(value: Vec3) {
        this._linearOffset = value;
        if (this.component) {
            this.component.linearOffset = value;
        }
    }

    get linearOffset() {
        return this._linearOffset;
    }

    set radius(value: number) {
        this._radius = value;
        if (this.component) {
            this.component.radius = value;
        }
    }

    get radius() {
        return this._radius;
    }

    set type(value: string) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }

    get type() {
        return this._type;
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'angular-offset', 'axis', 'convex-hull', 'half-extents', 'height', 'linear-offset', 'radius', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'angular-offset':
                this.angularOffset = parseQuat(newValue);
                break;
            case 'axis':
                this.axis = parseInt(newValue, 10);
                break;
            case 'convex-hull':
                this.convexHull = this.hasAttribute('convex-hull');
                break;
            case 'half-extents':
                this.halfExtents = parseVec3(newValue);
                break;
            case 'height':
                this.height = parseFloat(newValue);
                break;
            case 'linear-offset':
                this.linearOffset = parseVec3(newValue);
                break;
            case 'radius':
                this.radius = parseFloat(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}

customElements.define('pc-collision', CollisionComponentElement);

export { CollisionComponentElement };
