import { Script, Vec3 } from 'playcanvas';

export class PlanetaryMotion extends Script {
    initialize() {
        // Planet radii (for scale reference)
        this.planetSizes = new Map([
            ['sun', 90],
            ['mercury', 6],
            ['venus', 14],
            ['earth', 15],
            ['mars', 8],
            ['jupiter', 45],
            ['saturn', 38],
            ['uranus', 20],
            ['neptune', 19]
        ]);

        // Base distances (will be scaled up to account for sun's size)
        const sunRadius = this.planetSizes.get('sun');
        const minSpacing = 300; // Increased from 30 to 300 for larger orbits

        this.orbitalDistances = new Map([
            ['mercury', sunRadius + minSpacing],             // 390 units
            ['venus', sunRadius + minSpacing * 2],          // 690 units
            ['earth', sunRadius + minSpacing * 3],          // 990 units
            ['mars', sunRadius + minSpacing * 4],           // 1290 units
            ['jupiter', sunRadius + minSpacing * 6],        // 1890 units
            ['saturn', sunRadius + minSpacing * 8],         // 2490 units
            ['uranus', sunRadius + minSpacing * 10],        // 3090 units
            ['neptune', sunRadius + minSpacing * 12]        // 3690 units
        ]);

        // Orbital periods in Earth years (we'll speed these up)
        this.orbitalPeriods = new Map([
            ['mercury', 0.24],
            ['venus', 0.62],
            ['earth', 1],
            ['mars', 1.88],
            ['jupiter', 11.86],
            ['saturn', 29.46],
            ['uranus', 84.01],
            ['neptune', 164.79]
        ]);

        // Rotation speeds (arbitrary values for visualization)
        this.rotationSpeeds = new Map([
            ['sun', 0.1],
            ['mercury', 0.08],
            ['venus', -0.07],    // Venus rotates backwards!
            ['earth', 0.15],
            ['mars', 0.14],
            ['jupiter', 0.32],   // Gas giants spin faster
            ['saturn', 0.28],
            ['uranus', 0.25],
            ['neptune', 0.22]
        ]);

        // Scale factors - adjusted for planet sizes
        this.distanceScale = 3;     // Base scale for distances
        this.timeScale = 0.1;       // Speed up the orbital periods
        
        // Get references to all planets
        this.planets = new Map();
        ['sun', 'mercury', 'venus', 'earth', 'mars', 
         'jupiter', 'saturn', 'uranus', 'neptune'].forEach(name => {
            this.planets.set(name, this.entity.findByName(name));
        });

        // Initialize orbital angles
        this.orbitalAngles = new Map();
        for (const planet of this.orbitalDistances.keys()) {
            this.orbitalAngles.set(planet, Math.random() * Math.PI * 2);
        }
    }

    update(dt) {
        // Update each planet's position and rotation
        for (const [planet, entity] of this.planets) {
            // Don't move the sun, but rotate it
            if (planet === 'sun') {
                entity.rotate(0, this.rotationSpeeds.get(planet) * dt * 60, 0);
                continue;
            }

            // Update orbital position
            const currentAngle = this.orbitalAngles.get(planet);
            this.orbitalAngles.set(
                planet, 
                currentAngle + (dt * this.timeScale / this.orbitalPeriods.get(planet))
            );
            
            // Calculate orbital position
            const distance = this.orbitalDistances.get(planet);
            const angle = this.orbitalAngles.get(planet);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            
            entity.setLocalPosition(x, 0, z);
            entity.rotate(0, this.rotationSpeeds.get(planet) * dt * 60, 0);
        }
    }
}
