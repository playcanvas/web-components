import { CollisionComponent } from 'playcanvas';

import { ComponentElement } from './component';

/**
 * Represents a collision component in the PlayCanvas engine.
 *
 * @category Components
 */
class CollisionComponentElement extends ComponentElement {
    /**
     * Creates a new CollisionComponentElement.
     */
    constructor() {
        super('collision');
    }

    getInitialComponentData() {
        return {
        };
    }

    /**
     * Gets the collision component.
     * @returns The collision component.
     */
    get component(): CollisionComponent | null {
        return super.component as CollisionComponent | null;
    }


    static get observedAttributes() {
        return [...super.observedAttributes];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, _oldValue, newValue);

        switch (name) {
        }
    }
}   

customElements.define('pc-collision', CollisionComponentElement);

export { CollisionComponentElement };
