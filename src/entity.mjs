import { Entity } from 'playcanvas';

class EntityElement extends HTMLElement {
    connectedCallback() {
        // Create a new entity
        this.entity = new Entity();
    }
}

export { EntityElement }
