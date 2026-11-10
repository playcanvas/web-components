import { Script, Vec3 } from 'playcanvas';

/**
 * Turns its entity at a steady rate.
 */
export class Rotate extends Script {
    static scriptName = 'rotate';

    /**
     * The rate of turn about each world axis, in degrees per second.
     *
     * @attribute
     * @type {Vec3}
     */
    speed = new Vec3(10, 20, 30);

    update(dt) {
        this.entity.rotate(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    }
}
