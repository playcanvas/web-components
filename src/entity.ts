import { Application, Entity, Vec3 } from 'playcanvas';

import { AsyncElement } from './async-element';
import { parseVec3 } from './utils';

/**
 * The EntityElement interface provides properties and methods for manipulating
 * `<pc-entity>` elements. The EntityElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class EntityElement extends AsyncElement {
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

    /**
     * The PlayCanvas entity instance.
     */
    entity: Entity | null = null;

    createEntity(app: Application) {
        // Create a new entity
        this.entity = new Entity(
            this.getAttribute('name') || this._name,
            app
        );

        // Initialize from attributes first, falling back to member variable defaults
        const enabled = this.getAttribute('enabled');
        this.entity.enabled = enabled !== null ? enabled !== 'false' : this._enabled;

        const position = this.getAttribute('position');
        this.entity.setLocalPosition(position ? parseVec3(position) : this._position);

        const rotation = this.getAttribute('rotation');
        this.entity.setLocalEulerAngles(rotation ? parseVec3(rotation) : this._rotation);

        const scale = this.getAttribute('scale');
        this.entity.setLocalScale(scale ? parseVec3(scale) : this._scale);

        const tags = this.getAttribute('tags');
        if (tags) {
            this.entity.tags.add(tags.split(',').map(tag => tag.trim()));
        }
    }

    buildHierarchy(app: Application) {
        if (!this.entity) return;

        const closestEntity = this.closestEntity;
        if (closestEntity?.entity) {
            closestEntity.entity.addChild(this.entity);
        } else {
            app.root.addChild(this.entity);
        }

        this._onReady();
    }

    connectedCallback() {
        // Wait for app to be ready
        const closestApp = this.closestApp;
        if (!closestApp) return;

        // If app is already running, create entity immediately
        if (closestApp.hierarchyReady) {
            const app = closestApp.app!;

            this.createEntity(app);
            this.buildHierarchy(app);

            // Handle any child entities that might exist
            const childEntities = this.querySelectorAll<EntityElement>('pc-entity');
            childEntities.forEach((child) => {
                child.createEntity(app);
            });
            childEntities.forEach((child) => {
                child.buildHierarchy(app);
            });
        }
    }

    disconnectedCallback() {
        if (this.entity) {
            // Notify all children that their entities are about to become invalid
            const children = this.querySelectorAll('pc-entity');
            children.forEach((child) => {
                (child as EntityElement).entity = null;
            });

            // Destroy the entity
            this.entity.destroy();
            this.entity = null;
        }
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
