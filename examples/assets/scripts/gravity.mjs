import { Script } from 'playcanvas';

export class Gravity extends Script {
    static scriptName = 'gravity';

    update(_dt) {
        const { x, y, z } = this.entity.getPosition();
        this.entity.rigidbody.applyForce(-x, -y, -z);
    }
}
