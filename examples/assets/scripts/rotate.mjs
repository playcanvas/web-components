import { Script } from 'playcanvas';

export class Rotate extends Script {
    static scriptName = 'rotate';

    update(dt) {
        this.entity.rotate(10 * dt, 20 * dt, 30 * dt);
    }
}
