import assert from 'node:assert/strict';

import { KeyboardMouseSource } from 'playcanvas';
import { afterEach, beforeEach, test } from 'vitest';

import { TapAwareKeyboardSource } from '../../../examples/assets/scripts/observatory-controller.mjs';

let source;
let canvas;
const key = (type, code, repeat = false) => {
    const event = new Event(type);
    Object.defineProperty(event, 'code', { value: code });
    Object.defineProperty(event, 'repeat', { value: repeat });
    globalThis.window.dispatchEvent(event);
};

beforeEach(() => {
    globalThis.window = new EventTarget();
    globalThis.document = { pointerLockElement: null };
    canvas = new EventTarget();
    canvas.hasPointerCapture = () => false;
    source = new TapAwareKeyboardSource({ pointerLock: false });
    source.attach(canvas);
});
afterEach(() => {
    source.destroy();
    delete globalThis.window;
    delete globalThis.document;
});

test('a complete jump tap between frames produces one press and one release', () => {
    const index = KeyboardMouseSource.keyCode.SPACE;
    key('keydown', 'Space');
    key('keyup', 'Space');
    assert.equal(source.read().key[index], 1);
    assert.equal(source.read().key[index], -1);
    assert.equal(source.read().key[index], 0);
});

test('held movement and keyboard repeat retain the Engine delta contract', () => {
    const index = KeyboardMouseSource.keyCode.W;
    key('keydown', 'KeyW');
    assert.equal(source.read().key[index], 1);
    key('keydown', 'KeyW');
    assert.equal(source.read().key[index], 0);
    assert.equal(source.read().key[index], 0);
    key('keyup', 'KeyW');
    assert.equal(source.read().key[index], -1);
});

test('holding Space produces one jump pulse and ignores repeat keydowns through landing', () => {
    const index = KeyboardMouseSource.keyCode.SPACE;
    key('keydown', 'Space');
    let held = 0,
        jumpFrames = 0;
    for (let frame = 0; frame < 180; frame++) {
        if (frame > 0) key('keydown', 'Space', true);
        held += source.read().key[index];
        jumpFrames += held;
    }
    assert.equal(jumpFrames, 1, 'held Space must not stay active after the press frame');
    assert.equal(held, 0);
    key('keydown', 'Space');
    assert.equal(source.read().key[index], 0, 'duplicate keydown is not a fresh physical press');
    key('keyup', 'Space');
    assert.equal(source.read().key[index], 0);
    key('keydown', 'Space');
    assert.equal(source.read().key[index], 1, 'release and press re-arms jumping');
});

test('Space repeat cannot start a jump after focus loss or controller recreation', () => {
    const index = KeyboardMouseSource.keyCode.SPACE;
    key('keydown', 'Space');
    source.read();
    globalThis.window.dispatchEvent(new Event('blur'));
    assert.equal(source.read().key[index], -1);
    key('keydown', 'Space', true);
    assert.equal(source.read().key[index], 0);
    source.destroy();
    source = new TapAwareKeyboardSource({ pointerLock: false });
    source.attach(canvas);
    key('keydown', 'Space', true);
    assert.equal(source.read().key[index], 0);
    key('keyup', 'Space');
    key('keydown', 'Space');
    assert.equal(source.read().key[index], 1);
});

test('simultaneous sprint and movement taps survive the same frame', () => {
    key('keydown', 'ShiftLeft');
    key('keydown', 'KeyW');
    key('keyup', 'KeyW');
    key('keyup', 'ShiftLeft');
    const input = source.read();
    assert.equal(input.key[KeyboardMouseSource.keyCode.W], 1);
    assert.equal(input.key[KeyboardMouseSource.keyCode.SHIFT], 1);
});

test('pointer-lock mode ignores keys until its own canvas has capture', () => {
    source.destroy();
    source = new TapAwareKeyboardSource({ pointerLock: true });
    source.attach(canvas);
    key('keydown', 'Space');
    assert.equal(source.read().key[KeyboardMouseSource.keyCode.SPACE], 0);
    globalThis.document.pointerLockElement = canvas;
    key('keydown', 'Space');
    assert.equal(source.read().key[KeyboardMouseSource.keyCode.SPACE], 1);
});

test('destroy removes keyboard listeners and clears pending input', () => {
    key('keydown', 'KeyW');
    source.destroy();
    key('keydown', 'Space');
    assert.ok(source.read().key.every((value) => value === 0));
});

test('focus loss releases held movement and sprint without requiring key-up', () => {
    key('keydown', 'KeyW');
    key('keydown', 'ShiftLeft');
    source.read();
    globalThis.window.dispatchEvent(new Event('blur'));
    const input = source.read();
    assert.equal(input.key[KeyboardMouseSource.keyCode.W], -1);
    assert.equal(input.key[KeyboardMouseSource.keyCode.SHIFT], -1);
    globalThis.window.dispatchEvent(new Event('blur'));
    assert.ok(source.read().key.every((value) => value === 0));
    key('keydown', 'KeyW');
    assert.equal(source.read().key[KeyboardMouseSource.keyCode.W], 1);
});

test('focus loss discards a pending jump and releases a captured camera drag', () => {
    let captured = false;
    canvas.setPointerCapture = () => {
        captured = true;
    };
    canvas.hasPointerCapture = () => captured;
    canvas.releasePointerCapture = () => {
        captured = false;
    };
    source._onPointerDown({ pointerId: 1, pointerType: 'mouse', button: 0, screenX: 10, screenY: 10 });
    assert.equal(source.read().button[0], 1);
    key('keydown', 'Space');
    globalThis.window.dispatchEvent(new Event('blur'));
    const input = source.read();
    assert.equal(input.key[KeyboardMouseSource.keyCode.SPACE], 0);
    assert.equal(input.button[0], -1);
    assert.equal(captured, false);
    assert.equal(source._pointerId, -1);
});
