import type { AppBase } from 'playcanvas';
import { expect } from 'vitest';

import { mount, type Mounted } from './dom';
import { describeElement, readyWithin, READY_TIMEOUT } from './ready';
// Importing the barrel is deliberate: it runs all 27 customElements.define() calls in the
// dependency order the library itself relies on, and gives us AsyncElement as a value for the
// instanceof check in settle().
import type { AppElement } from '../../src/app';
import { AsyncElement } from '../../src/index';


export interface BootedApp extends Mounted {
    readonly appElement: AppElement;
    readonly app: AppBase;
    /** Advances one simulation frame without rendering. */
    step(dt?: number): void;
    /** Renders one frame. Only for tests that specifically need the render path. */
    render(): void;
}

export interface BootOptions {
    /** Extra attributes for the `<pc-app>` element, for example `high-resolution="false"`. */
    appAttributes?: string;
    /** Per-element ready deadline in milliseconds. */
    timeout?: number;
}

/**
 * Waits for every AsyncElement under `root` to become ready, throwing a message that names the
 * offenders if any of them do not.
 *
 * This is load bearing rather than convenient. <pc-app> resolves its own ready promise from inside
 * the app.preload() callback, which is BEFORE its descendants' async connectedCallbacks have run to
 * completion. Tearing the tree down in that window makes ComponentElement.addComponent()
 * dereference an entity that is already null, and SoundSlotElement.connectedCallback() dereference
 * a component that is already null - both surfacing as unhandled rejections that fail the whole
 * file. Measured: removing the tree immediately after `await appElement.ready()` produces 2-3 such
 * rejections; settling first produces none across repeated mount/teardown cycles.
 *
 * @param root - The subtree to settle.
 * @param timeout - Per-element deadline in milliseconds.
 */
export const settle = async (root: ParentNode = document.body, timeout = READY_TIMEOUT) => {
    const pending = Array.from(root.querySelectorAll('*'))
    .filter((element): element is AsyncElement => element instanceof AsyncElement);

    const stuck = (await Promise.all(pending.map(async (element) => {
        try {
            await readyWithin(element, timeout);
            return null;
        } catch {
            return describeElement(element);
        }
    }))).filter(description => description !== null);

    if (stuck.length > 0) {
        throw new Error(`settle: ${stuck.length} element(s) never became ready: ${stuck.join(', ')}. ` +
            'A ready promise that never settles means the element is misplaced - check the ' +
            'console.warn output for the parent it requires.');
    }
};

/**
 * Mounts `<pc-app backend="null">` around `html` and returns once the whole tree has settled.
 *
 * @param html - The markup to place inside the `<pc-app>`.
 * @param options - Boot options.
 * @returns The booted app handle.
 */
export const bootApp = async (html = '', options: BootOptions = {}): Promise<BootedApp> => {
    const attributes = options.appAttributes ? ` ${options.appAttributes}` : '';
    const handle = mount(`<pc-app backend="null"${attributes}>${html}</pc-app>`);
    const appElement = handle.get<AppElement>('pc-app');

    await readyWithin(appElement, options.timeout);
    await settle(handle.container, options.timeout);

    const app = appElement.app;
    expect(app, 'pc-app became ready without an application').toBeTruthy();
    expect(app.graphicsDevice.isNull, 'expected the null graphics device').toBe(true);

    // app.start() has already requested a frame. Frames are stepped explicitly from here so that
    // one test's simulation cannot bleed into the next, and so no test depends on wall-clock time.
    app.autoRender = false;

    return Object.assign(handle, {
        appElement,
        app,
        step: (dt = 1 / 60) => app.update(dt),
        render: () => app.render()
    });
};
