import { Script } from 'playcanvas';

export class Scroll extends Script {
    static scriptName = 'scroll';

    update(dt) {
        this.entity.translateLocal(0, dt * 0.5, 0);
    }
}
