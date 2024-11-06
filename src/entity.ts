import { Entity, Vec3 } from 'playcanvas';

import { AppElement } from './app';
import { parseVec3 } from './utils';

/**
 * Represents an entity in the PlayCanvas engine.
 */
class EntityElement extends HTMLElement {
    /**
     * Whether the entity is enabled.
     */
    private _enabled = true;

    /**
     * The name of the entity.
     */
    private _name = 'Untitled';

    /**
     * The position of the entity.
     */
    private _position = new Vec3();

    /**
     * The rotation of the entity.
     */
    private _rotation = new Vec3();

    /**
     * The scale of the entity.
     */
    private _scale = new Vec3(1, 1, 1);

    /**
     * The tags of the entity.
     */
    private _tags: string[] = [];

    private _resolveEntity!: (entity: Entity) => void;

    private _entityReady = new Promise<Entity>((resolve) => {
        this._resolveEntity = resolve;
    });

    /**
     * The PlayCanvas entity instance.
     */
    entity: Entity | null = null;

    async connectedCallback() {
        // Get the application
        const appElement = this.closest('pc-app') as AppElement;
        if (!appElement) {
            console.warn(`${this.tagName} must be a child of pc-app`);
            return;
        }

        const app = await appElement.getApplication();

        // Create a new entity
        this.entity = new Entity(this._name, app);
        this._resolveEntity(this.entity);

        if (this.parentElement &&
            this.parentElement.tagName.toLowerCase() === 'pc-entity') {
            const parentEntity = await (this.parentElement as EntityElement)._entityReady;
            parentEntity.addChild(this.entity);
        } else {
            app.root.addChild(this.entity);
        }

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

    disconnectedCallback() {
        if (this.entity) {
            // Notify all children that their entities are about to become invalid
            const children = this.querySelectorAll('pc-entity');
            children.forEach((child) => {
                (child as EntityElement).entity = null;
            });

            this.entity.destroy();
            this.entity = null;
        }

        // Reset the promise for potential reconnection
        this._entityReady = new Promise<Entity>((resolve) => {
            this._resolveEntity = resolve;
        });
    }

    /**
     * Sets the enabled state of the entity.
     * @param value - Whether the entity is enabled.
     */
    set enabled(value) {
        this._enabled = value;
        if (this.entity) {
            this.entity.enabled = value;
        }
    }

    /**
     * Gets the enabled state of the entity.
     * @returns Whether the entity is enabled.
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Sets the name of the entity.
     * @param value - The name of the entity.
     */
    set name(value) {
        this._name = value;
        if (this.entity) {
            this.entity.name = value;
        }
    }

    /**
     * Gets the name of the entity.
     * @returns The name of the entity.
     */
    get name() {
        return this._name;
    }

    /**
     * Sets the position of the entity.
     * @param value - The position of the entity.
     */
    set position(value) {
        this._position = value;
        if (this.entity) {
            this.entity.setLocalPosition(this._position);
        }
    }

    /**
     * Gets the position of the entity.
     * @returns The position of the entity.
     */
    get position() {
        return this._position;
    }

    /**
     * Sets the rotation of the entity.
     * @param value - The rotation of the entity.
     */
    set rotation(value) {
        this._rotation = value;
        if (this.entity) {
            this.entity.setLocalEulerAngles(this._rotation);
        }
    }

    /**
     * Gets the rotation of the entity.
     * @returns The rotation of the entity.
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * Sets the scale of the entity.
     * @param value - The scale of the entity.
     */
    set scale(value) {
        this._scale = value;
        if (this.entity) {
            this.entity.setLocalScale(this._scale);
        }
    }

    /**
     * Gets the scale of the entity.
     * @returns The scale of the entity.
     */
    get scale() {
        return this._scale;
    }

    /**
     * Sets the tags of the entity.
     * @param value - The tags of the entity.
     */
    set tags(value) {
        this._tags = value;
        if (this.entity) {
            this.entity.tags.clear();
            this.entity.tags.add(this._tags);
        }
    }

    /**
     * Gets the tags of the entity.
     * @returns The tags of the entity.
     */
    get tags() {
        return this._tags;
    }

    static get observedAttributes() {
        return ['enabled', 'name', 'position', 'rotation', 'scale', 'tags'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'position':
                this.position = parseVec3(newValue);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'tags':
                this.tags = newValue.split(',').map(tag => tag.trim());
                break;
        }
    }
}

customElements.define('pc-entity', EntityElement);

export { EntityElement };
