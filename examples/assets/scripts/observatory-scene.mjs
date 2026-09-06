import { Script, Vec3 } from 'playcanvas';

/** @import { Entity } from 'playcanvas' */

const STATES = ['Idle', 'Walk', 'Run', 'JumpStart', 'FallLoop', 'Land'];
const SPAWNS = {
    arrival: { position: [0, 1.001, 17], yaw: -8 },
    ascent: { position: [-6, 1.001, 12], yaw: 45 },
    colonnade: { position: [18, 4.001, -9], yaw: 170 },
    overlook: { position: [8, 4.001, -15], yaw: 0 },
    crossing: { position: [-16, 4.001, -16], yaw: -90 }
};

export class ObservatoryScene extends Script {
    static scriptName = 'observatoryScene';

    /** @attribute @type {Entity} */
    player;
    /** @attribute @type {Entity} */
    camera;
    /** @attribute @type {Entity} */
    environment;

    initialize() {
        // Retain the Engine's 0.1 s hitch cap so 20–30 fps devices keep real-time movement.
        this.app.graphicsDevice.canvas.tabIndex = 0;
        this.state = 'loading';
        this._recoveryTime = 0;
        this._airTime = 0;
        this._landTime = 0;
        this._jumpTime = 0;
        this._speedBucket = 0;
        this._wasGrounded = true;
        this._animState = -1;
        this._groundEnd = new Vec3();
        this._rayOptions = { filterCallback: (entity) => entity !== this.player };
        this._listeners = new AbortController();
        this._ui = document.querySelector('.observatory-ui');
        this._resume = document.getElementById('observatory-resume');
        this._hint = document.getElementById('observatory-hint');
        this._place = document.getElementById('observatory-place');
        this._fade = document.getElementById('observatory-fade');
        this._animation = document.getElementById('explorer-animation');
        this._controllerElement = document.getElementById('explorer-controller');
        this._controllerTemplate = this._controllerElement.cloneNode(true);
        this._controllerParent = this._controllerElement.parentElement;
        const query = new URLSearchParams(location.search);
        this._spawn = SPAWNS[query.get('view')] ?? SPAWNS.arrival;
        this._initialView = true;

        // Hide only render components: disabling the collision root would remove its physics.
        this.entity.findComponents('render').forEach((render) => {
            render.entity.addComponent('collision', { type: 'mesh', renderAsset: render.asset });
            render.entity.addComponent('rigidbody', { type: 'static', friction: 0.5 });
            render.enabled = false;
        });

        this._bindUI();
        this._lowQuality = matchMedia('(pointer: coarse)').matches;
        this._applyQuality();
        this.player.rigidbody.teleport(...this._spawn.position);
        this.camera.setEulerAngles(0, this._spawn.yaw, 0);
        // Start once the declarative controller has positioned the first camera frame.
        this._waitingForReady = true;
        this.on('destroy', this._destroy, this);
    }

    _bindUI() {
        const options = { signal: this._listeners.signal };
        this._resume.addEventListener('click', () => this.resume(), options);
        document.getElementById('observatory-pause').addEventListener('click', () => this.pause(), options);
        document.getElementById('observatory-reset').addEventListener('click', () => this.reset(), options);
        document.getElementById('observatory-quality').addEventListener(
            'click',
            () => {
                this._lowQuality = !this._lowQuality;
                this._applyQuality();
                if (this.state === 'playing') this.app.graphicsDevice.canvas.focus();
            },
            options
        );
        // Embedded browsers can lose focus when the pointer leaves the canvas.
        // Pause only when the page is hidden, or when the user explicitly pauses.
        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden) this.pause();
            },
            options
        );
        window.addEventListener(
            'keydown',
            (event) => {
                if (event.code === 'Escape') this.pause();
                if (event.code === 'KeyR' && !event.repeat && this.state === 'playing') this.reset();
            },
            options
        );
    }

    _applyQuality() {
        // Architectural AO is baked into the GLB. Both quality modes retain real sun
        // shadows for the explorer and moving monument, without an SSAO depth pass.
        const sun = this.app.root.findByName('sun')?.light;
        if (sun) {
            sun.shadowResolution = this._lowQuality ? 1024 : 2048;
            sun.shadowDistance = this._lowQuality ? 35 : 55;
        }
        this.app.graphicsDevice.maxPixelRatio = Math.min(devicePixelRatio, this._lowQuality ? 1 : 2);
        this.app.resizeCanvas();
        document.getElementById('observatory-quality').textContent = `Quality: ${this._lowQuality ? 'light' : 'high'}`;
    }

    _listenController() {
        const controller = this._controllerElement?.isConnected ? this._controllerElement.script : null;
        if (!controller || controller === this._controller) return;
        this._controller = controller;
        if (this._pendingView) {
            controller.setView(this._pendingView);
            this._pendingView = null;
        } else if (this._initialView) {
            controller.setView({ ...controller.captureView(), yaw: this._spawn.yaw });
            this._initialView = false;
        }
        controller.on('speed', (bucket) => {
            this._speedBucket = bucket;
        });
        controller.on('jump', () => {
            this._jumpTime = 0.28;
            this._airTime = 0;
        });
    }

    _suspendController() {
        if (this._controller) {
            this._resumeView = this._controller.captureView();
        }
        // Engine 2.22 detaches input on destroy, not disable. Remount through PWC
        // so its lifecycle owns the script and all of its input sources.
        this._controllerElement?.remove();
        this._controller = null;
    }

    _restoreController(reset = false) {
        this._pendingView = reset ? null : this._resumeView;
        const element = this._controllerTemplate.cloneNode(true);
        if (!reset && this._resumeView) {
            element.setAttribute('initial-pitch', String(this._resumeView.pitch));
            element.setAttribute('initial-yaw', String(this._resumeView.yaw));
            element.setAttribute('camera-distance', String(this._resumeView.distance));
        }
        this._controllerParent.appendChild(element);
        this._controllerElement = element;
    }

    _setState(state) {
        this.state = state;
        this._ui.dataset.state = state;
        this.app.timeScale = state === 'playing' || state === 'loading' ? 1 : 0;
        this._resume.hidden = state !== 'paused';
        this._resume.textContent = 'Continue exploring →';
        this._hint.textContent =
            state === 'paused' ? 'A moment of stillness. Click to return.' : 'Loading the explorer and its world';
    }

    resume() {
        if (this.state !== 'ready' && this.state !== 'paused') return;
        this._play();
    }

    _play() {
        if (this._disposed || (this.state !== 'ready' && this.state !== 'paused')) return;
        if (!this._controller) this._restoreController();
        this._setState('playing');
        this.app.graphicsDevice.canvas.focus();
    }

    pause() {
        if (this.state !== 'playing') return;
        this._setState('paused');
        this._fade.classList.remove('visible');
        this._suspendController();
        this._resume.focus({ preventScroll: true });
    }

    reset() {
        this._recoveryTime = 0;
        this._fade.classList.remove('visible');
        this._place.textContent = '01 / ARRIVAL COURT';
        this._setState('ready');
        this._suspendController();
        this.environment.anim.baseLayer.play('Observatory_Loop');
        this._airTime = this._landTime = this._jumpTime = this._speedBucket = 0;
        this._wasGrounded = true;
        this.player.rigidbody.teleport(...SPAWNS.arrival.position);
        this.player.rigidbody.linearVelocity = Vec3.ZERO;
        this.player.rigidbody.angularVelocity = Vec3.ZERO;
        this.camera.setEulerAngles(0, SPAWNS.arrival.yaw, 0);
        this._animation.play('Idle');
        this._animation.speed = 1;
        this._animState = 0;
        this._restoreController(true);
        this._waitingForReady = true;
        this._setState('loading');
    }

    update(dt) {
        this._listenController();
        if (this._waitingForReady && this._controller) {
            this._waitingForReady = false;
            this.app.once('postrender', () => this._completeLoading());
        }
        if (this.state !== 'playing') return;
        const pos = this.player.getPosition();
        const velocity = this.player.rigidbody.linearVelocity;
        const speed = Math.hypot(velocity.x, velocity.z);
        this._groundEnd.copy(pos).y -= 1.12;
        const grounded = !!this.app.systems.rigidbody.raycastFirst(pos, this._groundEnd, this._rayOptions);
        this._airTime = grounded ? 0 : this._airTime + dt;
        this._jumpTime = Math.max(0, this._jumpTime - dt);
        this._landTime = Math.max(0, this._landTime - dt);
        if (grounded && !this._wasGrounded && velocity.y < 1) this._landTime = 0.18;
        this._wasGrounded = grounded;
        const motion =
            this._jumpTime > 0 ? 3 : this._airTime > 0.08 ? 4 : this._landTime > 0 && speed < 1 ? 5 : this._speedBucket;
        if (motion !== this._animState) {
            this._animState = motion;
            this._animation.transition(STATES[motion], motion === 5 ? 0.06 : undefined);
        }
        // Approximate source travel speeds in m/s; the controller supplies world motion.
        this._animation.speed =
            motion === 1 ? Math.max(0.3, speed / 0.98) : motion === 2 ? Math.max(0.35, speed / 5.36) : 1;
        const place =
            pos.z > 6
                ? '01 / ARRIVAL COURT'
                : pos.x < -12
                  ? '02 / TERRACED ASCENT'
                  : pos.z < -15 && pos.x < 0
                    ? '03 / BROKEN CROSSING'
                    : pos.x > 14
                      ? '04 / COLONNADE'
                      : pos.z < -11
                        ? '05 / RING OVERLOOK'
                        : null;
        if (place && pos.y > 0 && this._place.textContent !== place) this._place.textContent = place;
        if (pos.y < -10) {
            this._fade.classList.add('visible');
            // Simulation time freezes with pause, including a fall already fading out.
            this._recoveryTime += dt;
            if (this._recoveryTime >= 0.23) this.reset();
        }
    }

    _completeLoading() {
        if (this._disposed || this.state !== 'loading') return;
        this._setState('ready');
        if (document.hidden) {
            this._setState('paused');
            this._suspendController();
        } else {
            this._play();
        }
    }

    _destroy() {
        this._disposed = true;
        this._listeners.abort();
        this._controller?.off('speed');
        this._controller?.off('jump');
    }
}
