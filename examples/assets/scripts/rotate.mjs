import { Script } from 'playcanvas';

export class Rotate extends Script {
    update(dt) {
        this.entity.rotate(1 * dt, 1 * dt, 1 * dt);
    }
}
