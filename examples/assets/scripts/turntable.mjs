import { Quat, Script } from 'playcanvas';

const yaw = new Quat();

/**
 * Turns its entity about the vertical axis with the pointer, like a turntable: drag sideways to
 * spin it, and let go mid-drag to leave it spinning, slowing to a stop.
 *
 * It listens on the canvas, so a press another script takes first (by stopping it on the window
 * in the capture phase, as jelly-splat.mjs does for a press on its splat) never reaches it. Only
 * the sideways part of a drag turns it, so it can share drags with camera controls whose yaw is
 * locked: dragging up and down still tilts the view.
 */
class Turntable extends Script {
    static scriptName = 'turntable';

    /**
     * How far a drag turns it, in degrees per pixel.
     * @type {number}
     * @attribute
     */
    sensitivity = 0.4;

    /**
     * How quickly a spin slows down once let go, per second.
     * @type {number}
     * @attribute
     */
    friction = 1.5;

    _angle = 0;

    // the spin in degrees per second, from the drag while dragging
    _velocity = 0;

    // the pointer turning it: { id, x, time }
    _drag = null;

    initialize() {
        this._rest = this.entity.getLocalRotation().clone();
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this.app.graphicsDevice.canvas.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('pointercancel', this._onPointerUp);
        this.on('destroy', () => {
            this.app.graphicsDevice.canvas.removeEventListener('pointerdown', this._onPointerDown);
            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            window.removeEventListener('pointercancel', this._onPointerUp);
        });
    }

    /**
     * Stops it and turns it back to where it started.
     */
    reset() {
        this._angle = 0;
        this._velocity = 0;
        this._drag = null;
        this._apply();
    }

    update(dt) {
        if (!this._drag && this._velocity !== 0) {
            this._velocity *= Math.exp(-this.friction * dt);
            if (Math.abs(this._velocity) < 1) {
                this._velocity = 0;
            }
            this._angle += this._velocity * dt;
            this._apply();
        }
    }

    _apply() {
        yaw.setFromEulerAngles(0, this._angle, 0);
        this.entity.setLocalRotation(yaw.mul(this._rest));
    }

    _onPointerDown(e) {
        if (e.button !== 0 || this._drag) {
            return;
        }
        this._drag = { id: e.pointerId, x: e.clientX, time: e.timeStamp };
        this._velocity = 0;
    }

    _onPointerMove(e) {
        const drag = this._drag;
        if (!drag || e.pointerId !== drag.id) {
            return;
        }
        const turn = (e.clientX - drag.x) * this.sensitivity;
        const seconds = (e.timeStamp - drag.time) / 1000;
        this._angle += turn;
        this._apply();
        // the spin to leave behind on release, smoothed over the last few moves
        if (seconds > 0) {
            this._velocity += (turn / seconds - this._velocity) * 0.5;
        }
        drag.x = e.clientX;
        drag.time = e.timeStamp;
    }

    _onPointerUp(e) {
        const drag = this._drag;
        if (!drag || e.pointerId !== drag.id) {
            return;
        }
        // a pointer held still before letting go leaves no spin
        if (e.type === 'pointercancel' || e.timeStamp - drag.time > 100) {
            this._velocity = 0;
        }
        this._drag = null;
    }
}

export { Turntable };
