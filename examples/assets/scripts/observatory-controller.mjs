import { KeyboardMouseSource } from 'playcanvas';

import { ThirdPersonController } from '../../../node_modules/playcanvas/scripts/esm/third-person-controller.mjs';

// Preserve a key tap that begins and ends between two rendered frames. In particular,
// a quick jump press should not disappear just because the frame sampled after key-up.
export class TapAwareKeyboardSource extends KeyboardMouseSource {
    _taps = new Set();
    _spaceDown = false;

    _onBlur = () => {
        this._taps.clear();
        this._spaceDown = false;
        // Retain previous keys so the next read emits releases to the controller.
        this._keyNow.fill(0);
        if (this._element?.hasPointerCapture(this._pointerId)) {
            this._element.releasePointerCapture(this._pointerId);
        }
        this._movementState.up({ pointerId: this._pointerId });
        this._pointerId = -1;
        this._clearButtons();
        this.deltas.button.append(this._button);
        this.deltas.mouse.read();
        this.deltas.wheel.read();
    };

    attach(element) {
        super.attach(element);
        window.addEventListener('blur', this._onBlur);
    }

    _onKeyDown(event) {
        if (this._pointerLock && document.pointerLockElement !== this._element) return;
        if (event.code === 'Space') {
            if (event.repeat || this._spaceDown) return;
            this._spaceDown = true;
        }
        super._onKeyDown(event);
        const index = this._keyMap.get(event.code);
        if (index !== undefined) this._taps.add(index);
    }

    _onKeyUp(event) {
        if (event.code === 'Space') this._spaceDown = false;
        super._onKeyUp(event);
    }

    read() {
        const released = [];
        for (const index of this._taps) {
            if (!this._keyNow[index]) {
                this._keyNow[index] = 1;
                released.push(index);
            }
        }
        this._taps.clear();
        const result = super.read();
        for (const index of released) this._keyNow[index] = 0;
        // The Engine accumulates key deltas into held state. Release this pulse
        // on the next frame so landing while Space is held cannot jump again.
        this._keyNow[KeyboardMouseSource.keyCode.SPACE] = 0;
        return result;
    }

    detach() {
        window.removeEventListener('blur', this._onBlur);
        this._taps.clear();
        this._spaceDown = false;
        super.detach();
    }
}

// Movement, collision, camera smoothing and input mappings remain Engine-owned.
// Engine 2.22 hardcodes pointer lock in its desktop source. This small adapter also
// supports embedded browsers that reject capture, using the same source's drag mode.
export class ObservatoryController extends ThirdPersonController {
    static scriptName = 'observatoryController';

    /** @attribute @type {boolean} */
    pointerLock = true;

    /** @attribute @type {number} */
    initialYaw = -8;

    initialize() {
        this._desktopInput.destroy();
        this._desktopInput = new TapAwareKeyboardSource({ pointerLock: this.pointerLock });
        super.initialize();
        this.setView({ yaw: this.initialYaw, pitch: this.initialPitch, distance: this.cameraDistance });
    }

    // Keep the controller's continuous angles across pause/resume. Decomposing the
    // camera quaternion into Euler angles would flip the view after a half orbit.
    captureView() {
        return {
            yaw: this._yaw,
            pitch: this._pitch,
            distance: this.cameraDistance,
            effectiveDistance: this._clampedDistance,
            modelYaw: this._modelYaw
        };
    }

    setView({ yaw, pitch, distance, effectiveDistance = distance, modelYaw = yaw + 180 + this.modelYawOffset }) {
        this._yaw = yaw;
        this._pitch = pitch;
        this.cameraDistance = this._targetCameraDistance = distance;
        this._clampedDistance = effectiveDistance;
        this._camInitialized = false;
        this._modelYaw = modelYaw;
        this.characterModel?.setLocalEulerAngles(0, this._modelYaw, 0);
    }
}
