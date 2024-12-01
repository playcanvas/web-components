import { Script } from 'playcanvas';

export class Orbit extends Script {
    radius = 4;

    speed = 0.4;

    time = 0;

    update(dt) {
        this.time += dt * this.speed;

        const x = Math.cos(this.time) * this.radius;
        const z = Math.sin(this.time) * this.radius;
        this.entity.setPosition(x, 0, z);

        const dx = -Math.sin(this.time);
        const dz = Math.cos(this.time);

        this.entity.lookAt(
            x - dx,
            0,
            z - dz
        );
    }
}
