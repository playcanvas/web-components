import { Application, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';

class ApplicationElement extends HTMLElement {
    async connectedCallback() {
        const shadowRoot = this.attachShadow({ mode: 'open' });
        const canvas = document.createElement('canvas');
        shadowRoot.appendChild(canvas);

        const app = new Application(canvas);
        app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(RESOLUTION_AUTO);
        app.start();

        // Wait for pc-entity to be fully defined
        await customElements.whenDefined('pc-entity');

        // By now, pc-entity's connectedCallback should have executed
        const entityElements = this.querySelectorAll('pc-entity');
        entityElements.forEach(entityElement => {
            if (entityElement.entity) {
                app.root.addChild(entityElement.entity);
            }
        });
    }
}

export { ApplicationElement }
