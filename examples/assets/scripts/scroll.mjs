import { Script } from 'playcanvas';

export class Scroll extends Script {
    update(dt) {
        this.entity.translateLocal(0, dt * 0.5, 0);
    }
}
