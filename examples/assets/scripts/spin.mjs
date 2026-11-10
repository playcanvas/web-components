import { Script, Vec3 } from 'playcanvas';

/**
 * Turns its entity about its own axes at a steady rate.
 */
export class Spin extends Script {
    static scriptName = 'spin';

    /**
     * The rate of turn about each of the entity's local axes, in degrees per second.
     *
     * @attribute
     * @type {Vec3}
     */
    speed = new Vec3();

    update(dt) {
        this.entity.rotateLocal(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    }
}
