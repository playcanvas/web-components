import { Script, Vec3 } from 'playcanvas';

export class PlanetaryCamera extends Script {
    initialize() {
        // Camera positions relative to each planet
        this.cameraOffsets = new Map([
            ['sun', new Vec3(0, 75, 150)],
            ['mercury', new Vec3(0, 8, 15)],
            ['venus', new Vec3(0, 12, 25)],
            ['earth', new Vec3(0, 12, 25)],
            ['mars', new Vec3(0, 8, 15)],
            ['jupiter', new Vec3(0, 40, 80)],
            ['saturn', new Vec3(0, 35, 70)],
            ['uranus', new Vec3(0, 18, 35)],
            ['neptune', new Vec3(0, 18, 35)]
        ]);

        this.currentTarget = 'sun';
        this.targetPosition = new Vec3();
        this.lerpFactor = 0.05; // Adjust for smoother/faster transitions

        // Listen for zoom events
        this.app.on('zoom', this.onZoom, this);
    }

    onZoom(planetName) {
        this.currentTarget = planetName;
    }

    postUpdate(dt) {
        // Get the current target planet
        const targetPlanet = this.app.root.findByName(this.currentTarget);
        if (!targetPlanet) return;

        // Get planet's world position
        const planetPos = targetPlanet.getPosition();
        const offset = this.cameraOffsets.get(this.currentTarget);

        // Calculate desired camera position
        this.targetPosition.copy(planetPos).add(offset);

        // Smoothly move camera to new position
        const currentPos = this.entity.getPosition();
        const t = 1.0 - Math.pow(1.0 - this.lerpFactor, dt * 60);
        
        currentPos.lerp(currentPos, this.targetPosition, t);
        this.entity.setPosition(currentPos);

        // Make camera look at the planet
        this.entity.lookAt(planetPos);
    }
}
