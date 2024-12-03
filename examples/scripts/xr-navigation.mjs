import { Color, Vec3, Script } from 'playcanvas';

export class XrNavigation extends Script {
    inputSources = new Set();

    // Reusable objects to avoid garbage collection
    hitPoint = new Vec3();

    validColor = new Color(0, 1, 0);    // Green for valid teleport

    invalidColor = new Color(1, 0, 0);   // Red for invalid teleport

    initialize() {
        this.app.xr.input.on('add', (inputSource) => {
            inputSource.on('selectend', () => {
                console.log('selectend');
                // Find the other input source (for teleporting to where it points)
                const otherSource = Array.from(this.inputSources).find(source => source !== inputSource);
                if (otherSource) {
                    this.tryTeleport(otherSource);
                }
            });
            this.inputSources.add(inputSource);
        });

        this.app.xr.input.on('remove', (inputSource) => {
            inputSource.off('selectend');
            this.inputSources.delete(inputSource);
        });
    }

    findPlaneIntersection(origin, direction) {
        // Find intersection with y=0 plane
        if (Math.abs(direction.y) < 0.00001) return null;  // Ray is parallel to plane

        const t = -origin.y / direction.y;
        if (t < 0) return null;  // Intersection is behind the ray

        return new Vec3(
            origin.x + direction.x * t,
            0,
            origin.z + direction.z * t
        );
    }

    tryTeleport(inputSource) {
        const origin = inputSource.getOrigin();
        const direction = inputSource.getDirection();

        const hitPoint = this.findPlaneIntersection(origin, direction);
        if (hitPoint) {
            // Get the camera's current height to maintain it after teleport
            const cameraY = this.entity.getPosition().y;
            hitPoint.y = cameraY;  // Maintain camera height
            this.entity.setPosition(hitPoint);
        }
    }

    update() {
        for (const inputSource of this.inputSources) {
            const start = inputSource.getOrigin();
            const direction = inputSource.getDirection();

            const hitPoint = this.findPlaneIntersection(start, direction);

            if (hitPoint) {
                // Draw line to intersection point
                this.app.drawLine(start, hitPoint, this.validColor);
                this.drawTeleportIndicator(hitPoint);
            } else {
                // Draw full length ray if no intersection
                const end = start.clone().add(
                    direction.clone().mulScalar(100)
                );
                this.app.drawLine(start, end, this.invalidColor);
            }
        }
    }

    drawTeleportIndicator(point) {
        // Draw a circle at the teleport point
        const segments = 32;
        const radius = 0.2;

        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2;
            const angle2 = ((i + 1) / segments) * Math.PI * 2;

            const x1 = point.x + Math.cos(angle1) * radius;
            const z1 = point.z + Math.sin(angle1) * radius;
            const x2 = point.x + Math.cos(angle2) * radius;
            const z2 = point.z + Math.sin(angle2) * radius;

            this.app.drawLine(
                new Vec3(x1, 0.01, z1),  // Slightly above ground to avoid z-fighting
                new Vec3(x2, 0.01, z2),
                this.validColor
            );
        }
    }
}
