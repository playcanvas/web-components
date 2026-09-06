import assert from 'node:assert/strict';

import { AppBase, EventHandler, Vec3 } from 'playcanvas';
import { test, vi } from 'vitest';

import { ObservatoryScene } from '../../../examples/assets/scripts/observatory-scene.mjs';

const setup = (t, hidden = false) => {
    const previousDocument = globalThis.document;
    globalThis.document = { hidden };
    t.onTestFinished(() => {
        globalThis.document = previousDocument;
    });
    let restores = 0,
        removes = 0,
        focuses = 0;
    const makeElement = () => ({
        setAttribute() {
            /* Declarative attributes are exercised in the browser. */
        },
        remove() {
            removes++;
        }
    });
    const view = { yaw: 43, pitch: -12, distance: 6 };
    const controller = { captureView: () => view };
    const app = Object.assign(new EventHandler(), {
        timeScale: 0,
        graphicsDevice: {
            canvas: {
                focus() {
                    focuses++;
                }
            }
        }
    });
    const scene = Object.assign(Object.create(ObservatoryScene.prototype), {
        app,
        state: 'loading',
        _recoveryTime: 0,
        _controller: controller,
        _ui: { dataset: {} },
        _resume: {
            focus() {
                /* Fake DOM button. */
            }
        },
        _hint: {},
        _place: {},
        _controllerElement: makeElement(),
        _controllerTemplate: { cloneNode: makeElement },
        _controllerParent: {
            appendChild() {
                restores++;
            }
        },
        _fade: {
            classList: {
                add() {
                    /* Fake fade overlay. */
                },
                remove() {
                    /* Fake fade overlay. */
                }
            }
        },
        environment: {
            anim: {
                baseLayer: {
                    play(name) {
                        scene.environmentClip = name;
                    }
                }
            }
        },
        player: {
            rigidbody: {
                teleport(...position) {
                    scene.position = position;
                }
            }
        },
        camera: {
            setEulerAngles(...rotation) {
                scene.rotation = rotation;
            }
        },
        _animation: {
            play(name) {
                scene.clip = name;
            },
            transition(name) {
                scene.clip = name;
            }
        }
    });
    return { scene, controller, view, counts: () => ({ restores, removes, focuses }) };
};

const enableUpdate = (scene, position = new Vec3(0, -11, 0)) => {
    scene._listenController = () => {
        /* Input lifecycle is tested separately. */
    };
    scene._groundEnd = new Vec3();
    scene._airTime = scene._landTime = scene._jumpTime = scene._speedBucket = 0;
    scene.app.systems = { rigidbody: { raycastFirst: () => null } };
    scene.player.getPosition = () => position;
    scene.player.rigidbody.linearVelocity = new Vec3();
};

test('initializing the scene preserves real-time Engine ticks at 20 fps and starts touch devices in light quality', (t) => {
    const { scene } = setup(t);
    const app = new AppBase({ id: 'observatory-clock-test' });
    app.graphicsDevice = { canvas: {} };
    // Keep the real Engine tick, replacing rendering and device I/O only.
    app.stats = { updateBasic: vi.fn(), updateDetailed: vi.fn(), frameEnd: vi.fn() };
    app.autoRender = false;
    app.requestAnimationFrame = vi.fn();
    app.update = vi.fn();
    scene.app = app;
    scene.entity = { findComponents: () => [] };
    scene.on = vi.fn();
    scene._bindUI = vi.fn();
    scene._applyQuality = vi.fn();
    const controllerElement = { cloneNode: () => ({}), parentElement: {} };
    vi.stubGlobal('document', {
        querySelector: () => scene._ui,
        getElementById: (id) => (id === 'explorer-controller' ? controllerElement : {})
    });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    scene.initialize();
    assert.equal(scene._lowQuality, true);
    for (let frame = 0; frame <= 20; frame++) app.tick(100000 + frame * 50);
    const elapsed = app.update.mock.calls.slice(1).reduce((sum, [dt]) => sum + dt, 0);
    assert.ok(Math.abs(elapsed - 1) < 1e-6, `20 fps advanced only ${elapsed} seconds`);
    // A long hitch is still bounded.
    app.tick(105000);
    assert.ok(app.update.mock.lastCall[0] <= 0.1);
    t.onTestFinished(() => {
        delete AppBase._applications['observatory-clock-test'];
    });
});

test('first frame starts immediately and keeps the existing controller', (t) => {
    const { scene, controller, counts } = setup(t);
    scene._completeLoading();
    assert.equal(scene.state, 'playing');
    assert.equal(scene.app.timeScale, 1);
    assert.equal(scene._resume.hidden, true);
    assert.equal(scene._controller, controller);
    scene._completeLoading();
    assert.deepEqual(counts(), { restores: 0, removes: 0, focuses: 1 });
});

test('window blur keeps playing, while hiding the tab still pauses', (t) => {
    const { scene } = setup(t);
    const previousWindow = globalThis.window;
    globalThis.window = new EventTarget();
    globalThis.document = Object.assign(new EventTarget(), {
        hidden: false,
        getElementById: () => new EventTarget()
    });
    scene._resume = Object.assign(new EventTarget(), {
        focus() {
            /* Fake resume button. */
        }
    });
    scene._listeners = new AbortController();
    t.onTestFinished(() => {
        scene._listeners.abort();
        globalThis.window = previousWindow;
    });
    scene._bindUI();
    scene._completeLoading();
    globalThis.window.dispatchEvent(new Event('blur'));
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(scene.state, 'playing');
    assert.equal(scene.app.timeScale, 1);
    globalThis.document.hidden = true;
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(scene.state, 'paused');
    assert.equal(scene.app.timeScale, 0);
});

test('loading in a hidden tab pauses without capturing focus', (t) => {
    const { scene, counts } = setup(t, true);
    scene._completeLoading();
    assert.equal(scene.state, 'paused');
    assert.equal(scene.app.timeScale, 0);
    assert.equal(scene._resume.hidden, false);
    assert.deepEqual(counts(), { restores: 0, removes: 1, focuses: 0 });
});

test('pause freezes simulation and resume restores input once with the saved camera', (t) => {
    const { scene, view, counts } = setup(t);
    scene._completeLoading();
    scene.pause();
    scene.pause();
    assert.equal(scene.app.timeScale, 0);
    assert.equal(scene._resume.hidden, false);
    scene.resume();
    scene.resume();
    assert.equal(scene.state, 'playing');
    assert.equal(scene.app.timeScale, 1);
    assert.deepEqual(scene._pendingView, view);
    assert.deepEqual(counts(), { restores: 1, removes: 1, focuses: 2 });
});

test('an update between DOM removal and observer teardown cannot reattach the old controller', (t) => {
    const { scene, controller, counts } = setup(t);
    scene.player.script = { observatoryController: controller };
    scene._controllerElement.isConnected = false;
    scene._controllerElement.script = controller;
    scene._completeLoading();
    scene.pause();
    scene._listenController();
    assert.equal(scene._controller, null);
    scene.resume();
    assert.equal(counts().restores, 1);
});

test('reset restores the arrival state and automatically returns to play after the first frame', (t) => {
    const { scene, counts } = setup(t);
    scene._completeLoading();
    scene.reset();
    assert.equal(scene.state, 'loading');
    assert.equal(scene._waitingForReady, true);
    assert.equal(scene._recoveryTime, 0);
    assert.equal(scene.environmentClip, 'Observatory_Loop');
    assert.equal(scene.clip, 'Idle');
    assert.deepEqual(scene.position, [0, 1.001, 17]);
    assert.deepEqual(scene.rotation, [0, -8, 0]);
    assert.equal(scene.player.rigidbody.linearVelocity, Vec3.ZERO);
    // PWC attaches the replacement before the scene observes its first frame.
    scene._controller = { captureView: () => ({}) };
    scene._completeLoading();
    assert.equal(scene.state, 'playing');
    assert.equal(scene._resume.hidden, true);
    assert.deepEqual(counts(), { restores: 1, removes: 1, focuses: 2 });
});

test('fall recovery stays paused until explicitly resumed, even after a long wait', (t) => {
    const { scene } = setup(t);
    enableUpdate(scene);
    scene._completeLoading();
    scene.update(0.1);
    scene.pause();
    for (let frame = 0; frame < 600; frame++) scene.update(1 / 60);
    assert.equal(scene.state, 'paused');
    assert.equal(scene._recoveryTime, 0.1);
    assert.equal(scene.app.timeScale, 0);
    scene.resume();
    scene.update(0.1);
    assert.equal(scene.state, 'playing');
    scene.update(0.05);
    assert.equal(scene.state, 'loading');
    assert.deepEqual(scene.position, [0, 1.001, 17]);
    scene._controller = { captureView: () => ({}) };
    scene._completeLoading();
    assert.equal(scene.state, 'playing');
});

test('fall recovery takes the same elapsed time at 20, 30 and 60 fps', (t) => {
    for (const fps of [20, 30, 60]) {
        const { scene } = setup(t);
        enableUpdate(scene);
        scene._completeLoading();
        let elapsed = 0;
        while (scene.state === 'playing' && elapsed < 1) {
            scene.update(1 / fps);
            elapsed += 1 / fps;
        }
        assert.equal(scene.state, 'loading');
        assert.ok(elapsed >= 0.23 && elapsed < 0.23 + 1 / fps, `${fps} fps: ${elapsed}s`);
    }
});

test('location text is updated only when the displayed region changes', (t) => {
    const { scene } = setup(t);
    const position = new Vec3(0, 1, 17);
    enableUpdate(scene, position);
    let writes = 0;
    let label;
    scene._place = {
        get textContent() {
            return label;
        },
        set textContent(value) {
            label = value;
            writes++;
        }
    };
    scene._completeLoading();
    for (let frame = 0; frame < 60; frame++) scene.update(1 / 60);
    assert.equal(writes, 1);
    position.set(-16, 4, 0);
    scene.update(1 / 60);
    assert.equal(writes, 2);
    assert.equal(label, '02 / TERRACED ASCENT');
});
