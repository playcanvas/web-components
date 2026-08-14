import { Entity, Script, Vec3 } from 'playcanvas';

import { MaterialElement } from '@playcanvas/web-components';

/**
 * @import { CameraComponent } from 'playcanvas';
 */

/**
 * Restores every rigid body below this entity - the robot's parts and the chain it hangs from - to
 * the pose it was authored in.
 *
 * The rest pose is captured from the bodies themselves rather than hard-coded, so it always agrees
 * with the glTF the joints were authored against. It cannot be captured in `initialize`, because the
 * robot's bodies belong to the model's glTF nodes and `pc-node` only decorates those once the
 * container asset has loaded.
 *
 * Listens for `ragdoll:reset` on the application, so the page's button never reaches into the
 * script.
 */
export class Ragdoll extends Script {
    static scriptName = 'ragdoll';

    initialize() {
        /** @type {{ entity: Entity, position: Vec3, rotation: import('playcanvas').Quat }[] | null} */
        this._rest = null;
        this._seen = 0;

        this.app.on('ragdoll:reset', this.reset, this);
        this.app.on('ragdoll:wake', this.wake, this);
        this.on('destroy', () => {
            this.app.off('ragdoll:reset', this.reset, this);
            this.app.off('ragdoll:wake', this.wake, this);
        });
    }

    update() {
        if (this._rest) {
            return;
        }
        // The bodies do not all appear on the same frame - the chain's are declared inline while the
        // robot's wait on the container asset - so the capture holds off until the count stops
        // growing. Capturing early would leave the rest of the rig with nowhere to be put back to.
        const bodies = this.entity.findComponents('rigidbody');
        const count = bodies.length;
        if (count === 0 || count !== this._seen) {
            this._seen = count;
            return;
        }
        this._rest = bodies.map(({ entity }) => ({
            entity,
            position: entity.getPosition().clone(),
            rotation: entity.getRotation().clone()
        }));
    }

    /**
     * Teleports every body back to its rest transform and stops it dead.
     *
     * The joints need no attention: each constraint is expressed in the local space of the two
     * bodies it holds, so putting every body back at once puts the joints back with them.
     */
    reset() {
        for (const { entity, position, rotation } of this._rest ?? []) {
            const { rigidbody } = entity;
            rigidbody.teleport(position, rotation);
            rigidbody.linearVelocity = Vec3.ZERO;
            rigidbody.angularVelocity = Vec3.ZERO;
        }
        this.wake();
    }

    /**
     * Wakes every body in the rig.
     *
     * Hanging plumb, the ragdoll settles completely and the simulation deactivates it to save the
     * work - which means removing the hook constraint on its own would leave the parts frozen in
     * mid-air, because nothing has touched them. Anything that changes the rig out from under the
     * solver has to wake it up again.
     */
    wake() {
        for (const { entity } of this._rest ?? []) {
            entity.rigidbody.activate();
        }
    }
}

/**
 * Fires a heavy ball from the camera towards wherever the pointer was tapped, for knocking the
 * ragdoll around. Only taps fire: a press that wanders is the camera controls orbiting, and a press
 * that lands on the page's chrome is not aimed at the scene at all.
 *
 * Attach to the camera entity.
 */
export class BallLauncher extends Script {
    static scriptName = 'ballLauncher';

    /**
     * The id of the `pc-material` to skin each ball with.
     *
     * @attribute
     * @type {string}
     */
    material = '';

    /**
     * The radius of each ball, in meters.
     *
     * @attribute
     * @type {number}
     */
    radius = 0.12;

    /**
     * The mass of each ball, in kilograms. Heavy enough to shift a limb, light enough not to
     * launch the whole ragdoll off screen.
     *
     * @attribute
     * @type {number}
     */
    mass = 9;

    /**
     * The speed each ball is fired at, in meters per second.
     *
     * @attribute
     * @type {number}
     */
    speed = 22;

    /**
     * How many balls stay in the scene. Firing past this destroys the oldest, so the scene never
     * fills up.
     *
     * @attribute
     * @type {number}
     */
    maxBalls = 12;

    /**
     * How far a press may wander and still count as a tap, in CSS pixels.
     *
     * @attribute
     * @type {number}
     */
    tapSlop = 10;

    initialize() {
        /** @type {Entity[]} */
        this._balls = [];
        this._pointerId = null;
        this._startX = 0;
        this._startY = 0;

        const canvas = this.app.graphicsDevice.canvas;
        const onDown = (event) => {
            // A press on the page's chrome is not aimed at the scene
            if (event.target !== canvas) {
                return;
            }
            this._pointerId = event.pointerId;
            this._startX = event.clientX;
            this._startY = event.clientY;
        };
        const onUp = (event) => {
            if (event.pointerId !== this._pointerId) {
                return;
            }
            this._pointerId = null;
            const wander = Math.hypot(event.clientX - this._startX, event.clientY - this._startY);
            if (wander <= this.tapSlop) {
                this.launch(event.clientX, event.clientY);
            }
        };

        window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
        window.addEventListener('pointerup', onUp, { capture: true, passive: true });

        this.on('destroy', () => {
            window.removeEventListener('pointerdown', onDown, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            this._balls.forEach(ball => ball.destroy());
        });
    }

    /**
     * Launches one ball from the camera through the given point on the canvas. Not named `fire`:
     * `Script` extends `EventHandler`, so that would shadow the event emitter the engine itself
     * calls when the script is enabled.
     *
     * @param {number} clientX - The horizontal canvas coordinate to aim through.
     * @param {number} clientY - The vertical canvas coordinate to aim through.
     */
    launch(clientX, clientY) {
        /** @type {CameraComponent} */
        const camera = this.entity.camera;
        if (!camera) {
            return;
        }

        const origin = this.entity.getPosition();
        // Any depth past the near plane gives the same ray through the pointer
        const direction = camera.screenToWorld(clientX, clientY, 10).sub(origin).normalize();

        const ball = new Entity('ball', this.app);
        ball.addComponent('render', {
            type: 'sphere',
            material: MaterialElement.get(this.material)
        });
        ball.addComponent('collision', { type: 'sphere', radius: this.radius });
        ball.addComponent('rigidbody', {
            type: 'dynamic',
            mass: this.mass,
            restitution: 0.4,
            friction: 0.6
        });
        // The render primitive is a unit-diameter sphere, so the diameter is the scale
        ball.setLocalScale(this.radius * 2, this.radius * 2, this.radius * 2);
        // Clear of the near plane, so a ball is never spawned inside the camera
        ball.setPosition(origin.clone().add(direction.clone().mulScalar(0.5)));

        this.app.root.addChild(ball);

        // At this speed a ball covers several times its own diameter in one physics step, so
        // discrete collision detection samples straight past the robot's thinner plates and the
        // shot registers no contact at all - heavier, faster balls actually did *less*. Continuous
        // collision detection sweeps the gap between steps. The engine does not surface it, so it
        // is set on the Ammo body directly.
        const body = ball.rigidbody.body;
        body.setCcdMotionThreshold(this.radius);
        body.setCcdSweptSphereRadius(this.radius * 0.8);

        ball.rigidbody.linearVelocity = direction.mulScalar(this.speed);

        this._balls.push(ball);
        while (this._balls.length > this.maxBalls) {
            this._balls.shift().destroy();
        }
    }
}
