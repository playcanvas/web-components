import { CollisionComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a collision component in the PlayCanvas engine.
 *
 * @category Components
 */
class CollisionComponentElement extends ComponentElement {
    private _axis: number = 1;

    private _convexHull: boolean = false;

    private _height: number = 2;

    private _radius: number = 0.5;

    private _type: string = 'box';

    /**
     * Creates a new CollisionComponentElement.
     */
    constructor() {
        super('collision');
    }

    getInitialComponentData() {
        return {
            axis: this._axis,
            convexHull: this._convexHull,
            height: this._height,
            radius: this._radius,
            type: this._type
        };
    }

    /**
     * Gets the collision component.
     * @returns The collision component.
     */
    get component(): CollisionComponent | null {
        return super.component as CollisionComponent | null;
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

    set height(value: number) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }

    get height() {
        return this._height;
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
        return [...super.observedAttributes, 'axis', 'convex-hull', 'height', 'radius', 'type'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
            case 'axis':
                this.axis = parseInt(newValue);
                break;
            case 'convex-hull':
                this.convexHull = this.hasAttribute('convex-hull');
                break;
            case 'height':
                this.height = parseFloat(newValue);
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
