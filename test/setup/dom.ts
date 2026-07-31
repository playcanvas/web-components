import { afterEach } from 'vitest';

/**
 * jsdom has no layout engine, so every element reports a clientWidth/clientHeight of 0 and an
 * all-zero bounding rect. Those are constant getters in jsdom's own Element-impl - `clientWidth`
 * and `clientHeight` are literally `return 0` - so no dependency choice can fix them. In
 * particular the `canvas` npm package does not help: it implements the 2D drawing surface
 * (getContext('2d'), toDataURL, pixel operations), not layout, and NullGraphicsDevice never asks
 * for a context at all.
 *
 * For <pc-app> this is not cosmetic:
 *
 * - AppElement calls app.setCanvasResolution(RESOLUTION_AUTO), which reads canvas.clientWidth and
 *   hands it to GraphicsDevice.resizeCanvas, leaving graphicsDevice.width/height at 0.
 * - CameraComponent then derives aspectRatio as width / height, i.e. 0 / 0 = NaN, poisoning every
 *   projection matrix built from it.
 * - AppElement._pickerCreate() constructs `new Picker(app, 0, 0)` and allocates 0x0 textures.
 * - AppElement._getPickerCoordinates() divides by canvasRect.width.
 *
 * Measured: without these accessors a <pc-app backend="null"> reports a 0x0 device and a camera
 * aspectRatio of NaN; with them, 800x600 and 1.3333.
 *
 * The engine's own suite does exactly this where it needs real dimensions - see
 * engine/test/platform/graphics/graphics-device.test.mjs, which assigns
 * `canvas.getBoundingClientRect = () => ({ width: 640, height: 480 })`. The only difference here
 * is placement: those tests own the canvas, whereas AppElement creates its canvas internally
 * inside connectedCallback, so no test can get a handle on it before the read happens. Hence the
 * prototype.
 *
 * Note that canvas.style.width IS set correctly by FILLMODE_FILL_WINDOW (jsdom's window is
 * 1024x768) - it is only the layout read-back that is dead, so the stubs go on the layout
 * accessors and not on style.
 */
interface Viewport {
    width: number;
    height: number;
}

const DEFAULT_VIEWPORT: Readonly<Viewport> = Object.freeze({ width: 800, height: 600 });

let viewport: Viewport = { ...DEFAULT_VIEWPORT };

/**
 * Overrides the size every canvas reports, for the remainder of the current test. Reset
 * automatically in afterEach.
 *
 * @param width - The width in CSS pixels.
 * @param height - The height in CSS pixels.
 */
export const setViewportSize = (width: number, height: number) => {
    viewport = { width, height };
};

const layoutAccessor = (read: () => number) => ({ configurable: true, get: read });

Object.defineProperties(HTMLCanvasElement.prototype, {
    clientWidth: layoutAccessor(() => viewport.width),
    clientHeight: layoutAccessor(() => viewport.height),
    offsetWidth: layoutAccessor(() => viewport.width),
    offsetHeight: layoutAccessor(() => viewport.height)
});

HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const { width, height } = viewport;
    const rect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
    return { ...rect, toJSON: () => rect } as DOMRect;
};

/**
 * jsdom's getContext() returns null AND routes a "Not implemented" error to the virtual console,
 * which Vitest then prints. backend="null" never reaches it, so this exists purely so that a test
 * which forgets backend="null" fails with one legible error instead of that plus jsdom noise.
 *
 * @returns Always `null`, matching jsdom's own unimplemented behaviour.
 */
HTMLCanvasElement.prototype.getContext = function getContext() {
    return null;
};

/**
 * jsdom already reports 1, but AppElement maps the `high-resolution` attribute straight onto
 * device.maxPixelRatio, so tests need to be able to move it.
 */
Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    writable: true,
    value: 1
});

// Deliberately NOT polyfilled:
//
// - ResizeObserver: zero occurrences in the engine source and zero in src/. @playcanvas/react
//   mocks it because its own Application component uses it; nothing here does.
// - navigator.xr: absent means XrManager reports supported === false, which is the correct
//   headless answer. A truthy stub would push it down paths jsdom cannot honour.
// - AudioContext: absent means SoundManager's lazy context getter returns null. Verified that
//   <pc-sounds>/<pc-sound> still create slots via addSlot() with no context.

afterEach(() => {
    viewport = { ...DEFAULT_VIEWPORT };
    // Spies and stubbed globals are restored by restoreMocks/unstubGlobals in vitest.config.ts.
    // DOM teardown belongs to test/helpers/dom.ts, which owns what it mounted.
});
