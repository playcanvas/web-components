import { Script } from 'playcanvas';

/**
 * @import { CameraComponent } from 'playcanvas';
 */

export class PhysicalPointer extends Script {
    initialize() {
        const canvas = this.app.graphicsDevice.canvas;
        canvas.addEventListener('pointermove', (event) => {
            /** @type {CameraComponent} */
            const camera = this.app.root.findComponent('camera');
            const { z } = camera.entity.getPosition();
            const { x, y } = camera.screenToWorld(event.clientX, event.clientY, z);
            this.entity.setPosition(x, y, 0);
        });
    }
}
