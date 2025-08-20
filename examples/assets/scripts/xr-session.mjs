import { Color, Quat, Script, Vec3 } from 'playcanvas';

export class XrSession extends Script {
    static scriptName = 'xrSession';

    /**
     * Event name to start the XR session. Payload can be:
     *  - (type: 'immersive-ar' | 'immersive-vr', space?: 'bounded-floor' | 'local' | 'local-floor' | 'unbounded' | 'viewer')
     *  - ({ type?: string, space?: string })
     * If omitted, the script will choose a supported type (AR preferred) and use 'local-floor' space.
     * @type {string}
     * @attribute
     */
    startEvent = 'xr:start';

    /**
     * Event name to end the XR session.
     * @type {string}
     * @attribute
     */
    endEvent = 'xr:end';

    cameraEntity = null;

    cameraRootEntity = null;

    clearColor = new Color();

    originalSkyType = null;

    positionRoot = new Vec3();

    rotationRoot = new Quat();

    positionCamera = new Vec3();

    rotationCamera = new Quat();

    onKeyDownHandler = null;

    initialize() {
        this.cameraEntity = this.entity.findComponent('camera')?.entity || null;
        this.cameraRootEntity = this.entity || null;

        // Listen to global XR lifecycle to mirror example.mjs behavior
        this.app.xr?.on('start', this.onXrStart, this);
        this.app.xr?.on('end', this.onXrEnd, this);

        // Listen for external events to control session
        this.app.on(this.startEvent, this.onStartEvent, this);
        this.app.on(this.endEvent, this.onEndEvent, this);

        // ESC to exit
        this.onKeyDownHandler = (event) => {
            if (event.key === 'Escape' && this.app.xr?.active) {
                this.endSession();
            }
        };
        window.addEventListener('keydown', this.onKeyDownHandler);
    }

    destroy() {
        this.app.xr?.off('start', this.onXrStart, this);
        this.app.xr?.off('end', this.onXrEnd, this);
        this.app.off(this.startEvent, this.onStartEvent, this);
        this.app.off(this.endEvent, this.onEndEvent, this);
        if (this.onKeyDownHandler) {
            window.removeEventListener('keydown', this.onKeyDownHandler);
            this.onKeyDownHandler = null;
        }
    }

    onStartEvent(typeOrOptions, spaceMaybe) {
        // Allow (type, space) or ({ type, space })
        /** @type {string|null} */
        let type = null;
        /** @type {string} */
        let space = 'local-floor';

        if (typeof typeOrOptions === 'string') {
            type = typeOrOptions;
            if (typeof spaceMaybe === 'string') space = spaceMaybe;
        } else if (typeOrOptions && typeof typeOrOptions === 'object') {
            if (typeof typeOrOptions.type === 'string') type = typeOrOptions.type;
            if (typeof typeOrOptions.space === 'string') space = typeOrOptions.space;
        }

        // Choose a sensible default type if not provided
        if (!type) {
            if (this.app.xr?.isAvailable('immersive-ar')) {
                type = 'immersive-ar';
            } else if (this.app.xr?.isAvailable('immersive-vr')) {
                type = 'immersive-vr';
            } else {
                console.warn('XR not available');
                return;
            }
        }

        this.startSession(type, space);
    }

    onEndEvent() {
        this.endSession();
    }

    startSession(type, space) {
        if (!this.cameraEntity.camera) {
            console.error('XrSession: No cameraEntity.camera found on the entity.');
            return;
        }

        // Start XR on the camera component
        this.cameraEntity.camera.startXr(type, space, {
            callback: (err) => {
                if (err) console.error(`WebXR ${type} failed to start: ${err.message}`);
            }
        });
    }

    endSession() {
        if (!this.cameraEntity.camera) return;
        this.cameraEntity.camera.endXr();
    }

    onXrStart() {
        if (!this.cameraEntity || !this.cameraRootEntity) return;

        // Cache original camera rig transforms
        this.positionRoot.copy(this.cameraRootEntity.getPosition());
        this.rotationRoot.copy(this.cameraRootEntity.getRotation());
        this.positionCamera.copy(this.cameraEntity.getPosition());
        this.rotationCamera.copy(this.cameraEntity.getRotation());

        // Place root at camera position/orientation
        this.cameraRootEntity.setPosition(this.positionCamera.x, 0, this.positionCamera.z);
        this.cameraRootEntity.setRotation(this.rotationCamera);

        if (this.app.xr.type === 'immersive-ar') {
            // Make camera background transparent and hide the sky
            this.clearColor.copy(this.cameraEntity.camera.clearColor);
            this.cameraEntity.camera.clearColor = new Color(0, 0, 0, 0);
            this.disableSky();
        }
    }

    onXrEnd() {
        if (!this.cameraEntity || !this.cameraRootEntity) return;

        // Restore original transforms
        this.cameraRootEntity.setPosition(this.positionRoot);
        this.cameraRootEntity.setRotation(this.rotationRoot);
        this.cameraEntity.setPosition(this.positionCamera);
        this.cameraEntity.setRotation(this.rotationCamera);

        if (this.app.xr.type === 'immersive-ar') {
            this.cameraEntity.camera.clearColor = this.clearColor;
            this.restoreSky();
        }
    }

    disableSky() {
        const sky = document.querySelector('pc-sky');
        if (!sky) return;
        if (this.originalSkyType === null) {
            this.originalSkyType = sky.getAttribute('type');
        }
        sky.setAttribute('type', 'none');
    }

    restoreSky() {
        const sky = document.querySelector('pc-sky');
        if (!sky) return;
        if (this.originalSkyType !== null) {
            if (this.originalSkyType) {
                sky.setAttribute('type', this.originalSkyType);
            } else {
                sky.removeAttribute('type');
            }
            this.originalSkyType = null;
        }
    }
}
