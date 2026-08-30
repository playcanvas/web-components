import { Mat4, Quat, Vec3 } from 'playcanvas';

import { FaceTracking } from './face-tracking.mjs';

/**
 * Face tracking with the world anchored to the room instead of the head: the camera stays
 * pinned at the origin of MediaPipe's camera space (the webcam), and the tracked head pose
 * drives the `head` entity instead. Everything else in the scene lives in a frame that stays
 * put when the user moves - so world-simulated physics can be dodged by moving your head,
 * where the base class's head-locked frame would drag it along with the face.
 *
 * The `faceTracking` base class maintains the smoothed camera-in-face-space pose either way;
 * this subclass simply applies its inverse (the head pose in camera space) to the head entity
 * each frame. In `?sim` and no-camera fallback modes the synthetic orbit moves the head in
 * front of the fixed camera, so the scene stays dodge-able there too.
 *
 * Everything head-locked (occluders, shadow catchers, hats) should be parented under the head
 * entity. Scene units remain centimeters, with the head roughly 30-60 in front of the camera
 * at negative Z.
 */
export class TrackedHead extends FaceTracking {
    static scriptName = 'trackedHead';

    /**
     * The entity driven with the tracked head pose.
     * @type {import('playcanvas').Entity}
     * @attribute
     */
    head = null;

    /**
     * The base class maintains the smoothed pose; this subclass applies it to the head
     * entity instead of the camera.
     * @protected
     */
    _drivesEntityTransform = false;

    /** @private */
    _seen = false;

    /** @private */
    _invRot = new Quat();

    /** @private */
    _invPos = new Vec3();

    /** @private */
    _simMat = new Mat4();

    /** @private */
    _simCamPos = new Vec3();

    /** @private */
    _simTarget = new Vec3();

    /** @private */
    _anchorWorld = new Vec3();

    /** @private */
    _desired = new Vec3();

    /** @private */
    _corrected = new Vec3();

    /**
     * @param {number} _dt - The delta time in seconds.
     * @protected
     */
    _onUpdated(_dt) {
        if (this._facePresent) this._seen = true;
        if (!this._seen || !this.head?.setPosition) return;

        // The head pose in camera space is the inverse of the smoothed camera pose the
        // base class maintains in face space
        this._invRot.copy(this._rot).invert();
        this._invRot.transformVector(this._pos, this._invPos).mulScalar(-1);
        this.head.setPosition(this._invPos);
        this.head.setRotation(this._invRot);

        // Pin the pose: shift the head so the canonical anchor point projects exactly onto
        // the observed nose bridge landmark - the same correction the base class applies to
        // its face-locked camera. The matrix alone drifts sideways on head turns, and the
        // drift reads as a horizontal offset once the head (rather than the camera) moves.
        if (this.anchorCorrection && this._facePresent && this._bridge.seeded && this.entity.camera) {
            const bridge = this._bridge;
            bridge.smooth.x += (bridge.raw.x - bridge.smooth.x) * this._k;
            bridge.smooth.y += (bridge.raw.y - bridge.smooth.y) * this._k;
            this._toScreen(bridge.smooth, this._tmpScreen);

            // screenToWorld's distance is measured along the pixel ray, so use the radial
            // camera-to-anchor distance (the camera sits at the origin): the shift then
            // preserves that distance and a single pass pins the anchor to the pixel
            this._invRot.transformVector(this.anchorPoint, this._anchorWorld).add(this._invPos);
            const depth = this._anchorWorld.length();
            if (depth > 5) {
                this.entity.camera.screenToWorld(this._tmpScreen.x, this._tmpScreen.y, depth, this._desired);
                this._corrected.copy(this._invPos).add(this._desired).sub(this._anchorWorld);
                this.head.setPosition(this._corrected);
            }
        }
    }

    /**
     * The synthetic orbit of the sim and fallback modes, flipped: the camera stays pinned
     * at the origin and the head flies the inverse orbit in front of it.
     * @param {number} t - The animation time in seconds.
     * @protected
     */
    _orbitCamera(t) {
        this.entity.setPosition(0, 0, 0);
        this.entity.setEulerAngles(0, 0, 0);

        if (!this.head?.setPosition) return;

        const yaw = Math.sin(t * 0.5) * 30 * (Math.PI / 180);
        const pitch = Math.sin(t * 0.31) * 9 * (Math.PI / 180);
        const dist = 46;
        const eyeY = 2.5;

        this._simCamPos.set(
            Math.sin(yaw) * Math.cos(pitch) * dist,
            eyeY + Math.sin(pitch) * dist,
            Math.cos(yaw) * Math.cos(pitch) * dist
        );
        this._simMat.setLookAt(this._simCamPos, this._simTarget.set(0, eyeY, 0), Vec3.UP).invert();
        this._simMat.getTranslation(this._invPos);
        this._invRot.setFromMat4(this._simMat);

        // The base orbit looks at the head, so its inverse only turns the head in place.
        // A real user also leans and bobs - add that, so the synthetic modes show throws
        // being dodged as well
        this._invPos.x += Math.sin(t * 0.8) * 10;
        this._invPos.y += Math.sin(t * 1.1) * 3;
        this._invPos.z += Math.sin(t * 0.5) * 5;

        this.head.setPosition(this._invPos);
        this.head.setRotation(this._invRot);
    }
}
