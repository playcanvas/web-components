import { Script } from 'playcanvas';

export class Orbit extends Script { 
    radius = 10;

    time = 0;

    update(dt) {
        this.time += dt;
        const x = Math.cos(this.time) * this.radius;
        const y = 0;
        const z = Math.sin(this.time) * this.radius;
        this.entity.setPosition(x, y, z);
    }
}
