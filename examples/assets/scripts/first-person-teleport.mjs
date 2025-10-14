import {
    BLEND_NORMAL,
    Color,
    CULLFACE_NONE,
    Entity,
    PIXELFORMAT_RGBA8,
    Script,
    StandardMaterial,
    Texture,
    Vec3
} from 'playcanvas';

// Constants
const EPSILON = 1e-6;
const MIN_MOVE_DISTANCE = 1e-3;
const MARKER_TEXTURE_SIZE = 256;
const MARKER_HOVER_HEIGHT = 0.001;
const DRAG_THRESHOLD_PIXELS = 5;

// Helper functions
function lerpAngleDeg(a, b, t) {
    const delta = ((b - a + 540) % 360) - 180;
    return a + delta * t;
}

function radToDeg(radians) {
    return radians * (180 / Math.PI);
}

function normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
}

function cubicEaseInOut(t) {
    return (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * First-person teleport controller with look controls and visual teleport marker.
 *
 * Features:
 * - Click/tap to teleport to a location with smooth tweening
 * - Click-and-drag to look around (yaw and pitch rotation)
 * - Visual ground marker showing valid teleport locations
 * - Range limiting and standoff distance
 * - Works with mouse, touch, and pen inputs via Pointer Events
 */
export class FirstPersonTeleport extends Script {
    static scriptName = 'firstPersonTeleport';

    /**
     * The height of the camera above the ground in meters.
     * @attribute
     */
    eyeHeight = 1.7;

    /**
     * Movement speed in meters per second.
     * @attribute
     */
    speed = 6.0;

    /**
     * Minimum distance to maintain from the target position in meters.
     * @attribute
     */
    standoff = 0.5;

    /**
     * Maximum range in meters for the teleport marker to be active. Set to 0 for unlimited range.
     * @attribute
     */
    maxRange = 15.0;

    /**
     * Size of the teleport marker in meters.
     * @attribute
     */
    markerSize = 0.6;

    /**
     * Color of the teleport marker.
     * @attribute
     */
    markerColor = new Color(1, 0.62, 0.11);

    /**
     * Opacity of the teleport marker.
     * @attribute
     * @range [0, 1]
     */
    markerOpacity = 0.55;

    /**
     * Mouse drag sensitivity for look controls.
     * @attribute
     */
    lookSensitivity = 0.05;

    /**
     * Minimum pitch angle in degrees (looking up).
     * @attribute
     */
    minPitch = -60;

    /**
     * Maximum pitch angle in degrees (looking down).
     * @attribute
     */
    maxPitch = 60;

    initialize() {
        // Camera source (this entity or one tagged 'camera')
        this.cameraEntity = this.entity.camera ? this.entity : (this.app.root.findByTag('camera')[0] || this.entity);

        // Movement state
        this.moving = false;
        this.elapsed = 0;
        this.duration = 0;

        // Look state
        this.isLooking = false;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.clickStartX = 0;
        this.clickStartY = 0;

        // Initialize current rotation from entity
        const euler = this.entity.getEulerAngles();
        this.currentYaw = euler.y;
        this.currentPitch = euler.x;

        // Reused vectors
        this.startPos = new Vec3();
        this.targetPos = new Vec3();
        this.tmpNear = new Vec3();
        this.tmpFar = new Vec3();

        // Create marker entity (a small transparent plane on the ground)
        this._createGroundMarker();

        // Input - use pointer events for unified mouse/touch/pen support
        const canvas = this.app.graphicsDevice.canvas;

        // Store bound handlers for cleanup
        this._boundPointerMove = this.onPointerMove.bind(this);
        this._boundPointerDown = this.onPointerDown.bind(this);
        this._boundPointerUp = this.onPointerUp.bind(this);
        this._boundPointerLeave = this.onPointerLeave.bind(this);

        canvas.addEventListener('pointermove', this._boundPointerMove);
        canvas.addEventListener('pointerdown', this._boundPointerDown);
        canvas.addEventListener('pointerup', this._boundPointerUp);
        canvas.addEventListener('pointerleave', this._boundPointerLeave);
    }

    destroy() {
        const canvas = this.app.graphicsDevice.canvas;
        if (canvas) {
            canvas.removeEventListener('pointermove', this._boundPointerMove);
            canvas.removeEventListener('pointerdown', this._boundPointerDown);
            canvas.removeEventListener('pointerup', this._boundPointerUp);
            canvas.removeEventListener('pointerleave', this._boundPointerLeave);
        }
        if (this.marker) this.marker.destroy();
    }

    _createGroundMarker() {
        // Create marker entity
        this.marker = new Entity('moveMarker');
        this.marker.addComponent('render', { type: 'plane' });

        // Create canvas for marker texture
        const texture = this._createMarkerTexture();

        // Create and configure material
        const mat = new StandardMaterial();
        mat.diffuseMap = texture;
        mat.opacityMap = texture;
        mat.emissiveMap = texture;
        mat.emissive = new Color(1, 1, 1);
        mat.opacity = 1.0;
        mat.blendType = BLEND_NORMAL;
        mat.depthWrite = false;
        mat.cull = CULLFACE_NONE;
        mat.useLighting = false;
        mat.update();

        // Apply material and add to scene
        this.marker.render.material = mat;
        this.marker.setLocalScale(this.markerSize, this.markerSize, this.markerSize);
        this.app.root.addChild(this.marker);

        this.marker.enabled = false;
    }

    _createMarkerTexture() {
        const size = MARKER_TEXTURE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        const centerX = size / 2;
        const centerY = size / 2;
        const colorStr = `rgba(${Math.round(this.markerColor.r * 255)}, ${Math.round(this.markerColor.g * 255)}, ${Math.round(this.markerColor.b * 255)}, ${this.markerOpacity})`;

        // Draw outer ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * 0.45, 0, Math.PI * 2);
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = size * 0.08;
        ctx.stroke();

        // Draw inner circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * 0.20, 0, Math.PI * 2);
        ctx.fillStyle = colorStr;
        ctx.fill();

        // Create and upload texture
        const texture = new Texture(this.app.graphicsDevice, {
            width: size,
            height: size,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false
        });
        texture.setSource(canvas);
        texture.upload();

        return texture;
    }

    _getCanvasCoords(e) {
        const canvas = this.app.graphicsDevice.canvas;
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    _getHorizontalDistance(x1, z1, x2, z2) {
        return Math.hypot(x2 - x1, z2 - z1);
    }

    onPointerMove(e) {
        const coords = this._getCanvasCoords(e);

        if (this.isLooking) {
            // Calculate pointer delta
            const deltaX = coords.x - this.lastPointerX;
            const deltaY = coords.y - this.lastPointerY;

            // Apply rotation based on pointer movement
            this._applyLook(deltaX, deltaY);

            this.lastPointerX = coords.x;
            this.lastPointerY = coords.y;
        } else if (!this.moving) {
            // Only show movement marker when not transitioning
            const hit = this._rayGroundHit(coords.x, coords.y);
            if (hit) {
                this._placeMarker(hit);
            } else if (this.marker) {
                this.marker.enabled = false;
            }
        }
    }

    onPointerDown(e) {
        // Primary button only (left mouse button or first touch)
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        const coords = this._getCanvasCoords(e);
        this.clickStartX = coords.x;
        this.clickStartY = coords.y;
        this.lastPointerX = coords.x;
        this.lastPointerY = coords.y;
        this.isLooking = true;

        // Hide marker while looking around
        if (this.marker) {
            this.marker.enabled = false;
        }

        // Current pitch and yaw are already being tracked
    }

    onPointerUp(e) {
        // Primary button only (left mouse button or first touch)
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        this.isLooking = false;

        const coords = this._getCanvasCoords(e);
        const dragDistance = Math.hypot(
            coords.x - this.clickStartX,
            coords.y - this.clickStartY
        );

        // If drag distance is small, treat as click-to-move
        if (dragDistance < DRAG_THRESHOLD_PIXELS) {
            const hit = this._rayGroundHit(coords.x, coords.y);
            if (hit) {
                this._placeMarker(hit);
                this._startMove(hit);
            }
        }
    }

    onPointerLeave() {
        if (this.marker) {
            this.marker.enabled = false;
        }
        this.isLooking = false;
    }

    _rayGroundHit(sx, sy) {
        const cam = this.cameraEntity.camera;
        if (!cam) return null;

        cam.screenToWorld(sx, sy, 0, this.tmpNear);
        cam.screenToWorld(sx, sy, 1, this.tmpFar);

        const ro = this.tmpNear.clone();
        const rd = this.tmpFar.sub(this.tmpNear).normalize();

        // Intersect ray with y=0 plane
        if (Math.abs(rd.y) < EPSILON) return null;
        const t = -ro.y / rd.y;
        if (t <= 0) return null;

        return ro.add(rd.scale(t));
    }

    _placeMarker(hit) {
        if (!this.marker) return;

        // Check if hit is within max range
        if (this.maxRange > 0) {
            const camPos = this.entity.getPosition();
            const distance = this._getHorizontalDistance(camPos.x, camPos.z, hit.x, hit.z);

            if (distance > this.maxRange) {
                this.marker.enabled = false;
                return;
            }
        }

        this.marker.enabled = true;
        this.marker.setPosition(hit.x, MARKER_HOVER_HEIGHT, hit.z);
    }

    _applyLook(deltaX, deltaY) {
        if (!this.entity) return;

        // Update tracked yaw and pitch
        this.currentYaw += deltaX * this.lookSensitivity;
        this.currentPitch += deltaY * this.lookSensitivity;

        // Normalize yaw angle
        this.currentYaw = normalizeAngle(this.currentYaw);

        // Clamp pitch to prevent gimbal lock
        this.currentPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.currentPitch));

        this.entity.setEulerAngles(this.currentPitch, this.currentYaw, 0);
    }

    _startMove(hit) {
        // Set start and target positions
        const start = this.entity.getPosition();
        this.startPos.copy(start);
        this.targetPos.set(hit.x, this.eyeHeight, hit.z);

        // Calculate horizontal distance
        const dist = this._getHorizontalDistance(
            this.startPos.x, this.startPos.z,
            this.targetPos.x, this.targetPos.z
        );

        if (dist < MIN_MOVE_DISTANCE) return;
        if (this.maxRange > 0 && dist > this.maxRange) return;

        // Apply standoff distance
        if (this.standoff > 0) {
            const k = Math.max(0, (dist - this.standoff) / dist);
            const dx = this.targetPos.x - this.startPos.x;
            const dz = this.targetPos.z - this.startPos.z;
            this.targetPos.x = this.startPos.x + dx * k;
            this.targetPos.z = this.startPos.z + dz * k;
        }

        // Calculate target yaw to face movement direction
        this.startYaw = this.currentYaw;
        const dx = this.targetPos.x - this.startPos.x;
        const dz = this.targetPos.z - this.startPos.z;
        const yawRad = Math.atan2(-dx, -dz);
        this.targetYaw = radToDeg(yawRad);

        // Calculate movement duration
        const moveDistance = this._getHorizontalDistance(
            this.startPos.x, this.startPos.z,
            this.targetPos.x, this.targetPos.z
        );
        this.duration = moveDistance / Math.max(this.speed, EPSILON);
        this.elapsed = 0;
        this.moving = true;

        // Hide marker during transition
        if (this.marker) {
            this.marker.enabled = false;
        }
    }

    update(dt) {
        if (!this.moving) return;

        this.elapsed += dt;
        const normalizedTime = Math.min(1, this.elapsed / Math.max(this.duration, EPSILON));
        const easedTime = cubicEaseInOut(normalizedTime);

        // Update position
        const newPos = new Vec3().lerp(this.startPos, this.targetPos, easedTime);
        newPos.y = this.eyeHeight;
        this.entity.setPosition(newPos);

        // Update yaw rotation
        this.currentYaw = lerpAngleDeg(this.startYaw, this.targetYaw, easedTime);
        this.entity.setEulerAngles(this.currentPitch, this.currentYaw, 0);

        if (normalizedTime === 1) {
            this.moving = false;
        }
    }
}
