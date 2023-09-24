import { Application, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';

class ApplicationElement extends HTMLElement {
    connectedCallback() {
        const shadowRoot = this.attachShadow({ mode: 'open' });
        const canvas = document.createElement('canvas');
        shadowRoot.appendChild(canvas);

        this.app = new Application(canvas);
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);
        this.app.start();

        customElements.whenDefined('pc-entity').then(() => {
            // By now, pc-entity's connectedCallback should have executed
            const entityElements = this.querySelectorAll('pc-entity');
            entityElements.forEach((entityElement) => {
                if (entityElement.entity) {
                    this.app.root.addChild(entityElement.entity);
                }
            });
        });

        this.dispatchEvent(new Event('appInitialized'));
    }
}

export { ApplicationElement };
