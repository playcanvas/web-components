import { Script } from 'playcanvas';

export class Gravity extends Script {
    static scriptName = 'gravity';

    update(dt) {
        const { x, y, z } = this.entity.getPosition();
        this.entity.rigidbody.applyForce(-x, -y, -z);
    }
}
