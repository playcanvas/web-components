import { Entity, Vec3 } from 'playcanvas';
import { parseVec3 } from './utils';

class EntityElement extends HTMLElement {
    private _name = 'Untitled';

    private _position = new Vec3();

    private _rotation = new Vec3();

    private _scale = new Vec3(1, 1, 1);

    private _tags: string[] = [];

    entity: Entity | null = null;

    connectedCallback() {
        // Create a new entity
        this.entity = new Entity();

        // Initialize from attributes
        const nameAttr = this.getAttribute('name');
        const positionAttr = this.getAttribute('position');
        const rotationAttr = this.getAttribute('rotation');
        const scaleAttr = this.getAttribute('scale');
        const tagsAttr = this.getAttribute('tags');

        if (nameAttr) this.name = nameAttr;
        if (positionAttr) this.position = parseVec3(positionAttr);
        if (rotationAttr) this.rotation = parseVec3(rotationAttr);
        if (scaleAttr) this.scale = parseVec3(scaleAttr);
        if (tagsAttr) this.tags = tagsAttr.split(',').map(tag => tag.trim());
    }

    set name(value) {
        this._name = value;
        if (this.entity) {
            this.entity.name = value;
        }
    }

    get name() {
        return this._name;
    }

    set position(value) {
        this._position = value;
        if (this.entity) {
            this.entity.setLocalPosition(this._position);
        }
    }

    get position() {
        return this._position;
    }

    set rotation(value) {
        this._rotation = value;
        if (this.entity) {
            this.entity.setLocalEulerAngles(this._rotation);
        }
    }

    get rotation() {
        return this._rotation;
    }

    set scale(value) {
        this._scale = value;
        if (this.entity) {
            this.entity.setLocalScale(this._scale);
        }
    }

    get scale() {
        return this._scale;
    }

    set tags(value) {
        this._tags = value;
        if (this.entity) {
            this.entity.tags.clear();
            this.entity.tags.add(this._tags);
        }
    }

    get tags() {
        return this._tags;
    }

    static get observedAttributes() {
        return ['position', 'rotation', 'scale', 'name', 'tags'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'position':
                this.position = parseVec3(newValue);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'tags':
                this.tags = newValue.split(',').map(tag => tag.trim());
                break;
        }
    }
}

export { EntityElement };
