import { Script, Vec3 } from 'playcanvas';

export class PlanetaryCamera extends Script {
    initialize() {
        // Camera offsets: X is sunward offset, Y and Z provide viewing angle
        this.cameraOffsets = new Map([
            ['sun', new Vec3(0, 75, 150)],
            ['mercury', new Vec3(-3, 2, 2)],      // Much closer to Mercury
            ['venus', new Vec3(-20, 10, 10)],     
            ['earth', new Vec3(-20, 10, 10)],     
            ['mars', new Vec3(-12, 6, 6)],        
            ['jupiter', new Vec3(-90, 60, 60)],   
            ['saturn', new Vec3(-80, 55, 55)],    
            ['uranus', new Vec3(-40, 30, 30)],    
            ['neptune', new Vec3(-40, 30, 30)]    
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
        
        // Calculate direction from sun to planet
        const sunwardDir = new Vec3();
        if (this.currentTarget !== 'sun') {
            // Normalize the planet's position to get the direction from sun (at origin) to planet
            sunwardDir.copy(planetPos).normalize();
            
            // Get the base offset values
            const offset = this.cameraOffsets.get(this.currentTarget);
            
            // Calculate camera position relative to planet's position around orbit
            // We want to stay on the sunward side, so we use the sunward direction
            this.targetPosition.set(
                planetPos.x + (sunwardDir.x * offset.x),
                planetPos.y + offset.y,
                planetPos.z + (sunwardDir.z * offset.x)
            );
        } else {
            // Sun doesn't orbit, use static offset
            const offset = this.cameraOffsets.get('sun');
            this.targetPosition.copy(planetPos).add(offset);
        }

        // Smoothly move camera to new position
        const currentPos = this.entity.getPosition();
        const t = 1.0 - Math.pow(1.0 - this.lerpFactor, dt * 60);
        
        currentPos.lerp(currentPos, this.targetPosition, t);
        this.entity.setPosition(currentPos);

        // Make camera look at the planet
        this.entity.lookAt(planetPos);
    }
}
