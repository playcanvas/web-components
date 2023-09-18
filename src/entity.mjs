import { Entity } from 'playcanvas';

class EntityElement extends HTMLElement {
    constructor() {
        super();

        // Default values
        this._position = [0, 0, 0];
        this._rotation = [0, 0, 0];
        this._scale = [1, 1, 1];
    }

    connectedCallback() {
        // Create a new entity
        this.entity = new Entity();

        // Initialize from attributes
        const positionAttr = this.getAttribute('position');
        const rotationAttr = this.getAttribute('rotation');
        const scaleAttr = this.getAttribute('scale');

        if (positionAttr) this.position = positionAttr.split(',').map(Number);
        if (rotationAttr) this.rotation = rotationAttr.split(',').map(Number);
        if (scaleAttr) this.scale = scaleAttr.split(',').map(Number);

        this.updateTransform();
    }

    updateTransform() {
        if (this.entity) {
            this.entity.setLocalPosition(...this._position);
            this.entity.setLocalEulerAngles(...this._rotation);
            this.entity.setLocalScale(...this._scale);
        }
    }

    // Position
    get position() {
        return this._position;
    }

    set position(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._position = value;
            this.updateTransform();
        }
    }

    // Rotation
    get rotation() {
        return this._rotation;
    }

    set rotation(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._rotation = value;
            this.updateTransform();
        }
    }

    // Scale
    get scale() {
        return this._scale;
    }

    set scale(value) {
        if (Array.isArray(value) && value.length === 3) {
            this._scale = value;
            this.updateTransform();
        }
    }

    static get observedAttributes() {
        return ['position', 'rotation', 'scale'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch(name) {
            case 'position':
                this.position = newValue.split(',').map(Number);
                break;
            case 'rotation':
                this.rotation = newValue.split(',').map(Number);
                break;
            case 'scale':
                this.scale = newValue.split(',').map(Number);
                break;
        }
    }
}

export { EntityElement }
