import { Script, Vec3 } from 'playcanvas';

export class PlanetaryCamera extends Script {
    static scriptName = 'planetaryCamera';

    initialize() {
        // Camera offsets: X is sunward offset, Y and Z provide viewing angle
        this.cameraOffsets = new Map([
            ['sun', new Vec3(0, 75, 150)],
            ['mercury', new Vec3(-3, 2, 2)],      // Much closer to Mercury
            ['venus', new Vec3(-20, 10, 10)],
            ['earth', new Vec3(-20, 10, 10)],
            ['mars', new Vec3(-12, 6, 6)],
            ['jupiter', new Vec3(-90, 30, 60)],
            ['saturn', new Vec3(-80, 35, 55)],
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

export class PlanetaryMotion extends Script {
    static scriptName = 'planetaryMotion';

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
            ['mercury', sunRadius + minSpacing],            // 390 units
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
            'jupiter', 'saturn', 'uranus', 'neptune'].forEach((name) => {
            this.planets.set(name, this.entity.findByName(name));
        });

        // Initialize orbital angles
        this.orbitalAngles = new Map();
        for (const planet of this.orbitalDistances.keys()) {
            this.orbitalAngles.set(planet, Math.random() * Math.PI * 2);
        }
    }

    update(dt) {
        const sun = this.planets.get('sun');
        const render = sun.findComponent('render');
        if (render) {
            const material = render.meshInstances[0].material;
            material.emissiveIntensity = 100;
        }

        // Update each planet's position and rotation
        for (const [planet, entity] of this.planets) {
            // Don't move the sun, but rotate it
            if (planet === 'sun') {
                entity.rotate(0, this.rotationSpeeds.get(planet) * dt * 30, 0);
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

            // Special case for Saturn to keep rings tilted correctly
            if (planet === 'saturn') {
                // Set rotation so rings always tilt up relative to the sun
                const tiltAngle = Math.PI / 12; // 30-degree tilt
                entity.setLocalEulerAngles(
                    tiltAngle * 180 / Math.PI,  // Convert to degrees
                    (this.rotationSpeeds.get(planet) * dt * 30) + (angle * 180 / Math.PI),
                    0
                );
            } else {
                // Normal rotation for other planets
                entity.rotate(0, this.rotationSpeeds.get(planet) * dt * 30, 0);
            }
        }
    }
}
