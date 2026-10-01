import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/** Where the engine looks for a devtools hook, such as the PlayCanvas Inspector's, to announce to. */
const HOOK = Symbol.for('playcanvas.inspector');

/**
 * <pc-app devtools> against a stand-in devtools hook. The engine announces an application to the
 * hook when it initializes the application and withdraws it when the application is destroyed.
 */
describe('<pc-app> devtools', () => {
    const { warnings } = useGuard();

    let hook: { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        hook = { register: vi.fn(), unregister: vi.fn() };
        (globalThis as Record<symbol, unknown>)[HOOK] = hook;
    });

    afterEach(() => {
        delete (globalThis as Record<symbol, unknown>)[HOOK];
    });

    it('announces the application to developer tools by default', async () => {
        const { app } = await bootApp();

        expect(hook.register).toHaveBeenCalledOnce();
        expect(hook.register.mock.calls[0][0]).toBe(app);
    });

    it('withdraws the application when the element is removed', async () => {
        const { app, appElement } = await bootApp();

        appElement.remove();

        expect(hook.unregister).toHaveBeenCalledOnce();
        expect(hook.unregister.mock.calls[0][0]).toBe(app);
    });

    it('keeps the application from developer tools when false', async () => {
        const { get } = await bootApp('', { appAttributes: 'devtools="false"' });

        expect(get<AppElement>('pc-app').devtools).toBe(false);
        expect(hook.register).not.toHaveBeenCalled();
    });

    it('warns about a write after boot, which leaves the application announced', async () => {
        const { appElement } = await bootApp();

        appElement.setAttribute('devtools', 'false');

        warnings.expect("Attribute 'devtools' on <pc-app> is only read when the application boots");
        expect(hook.register).toHaveBeenCalledOnce();
        expect(hook.unregister).not.toHaveBeenCalled();
    });

    it('has no effect when written while the graphics device is being created', async () => {
        const handle = mount('<pc-app backend="null"></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');

        // The canvas is appended just before the boot options are read and device creation
        // starts, so this observer runs while it is in flight - the window the warning covers
        const observer = new MutationObserver(() => {
            observer.disconnect();
            appElement.setAttribute('devtools', 'false');
        });
        observer.observe(appElement, { childList: true });

        await readyWithin(appElement);
        await settle(handle.container);

        warnings.expect("Attribute 'devtools' on <pc-app> is only read when the application boots");
        expect(hook.register).toHaveBeenCalledOnce();
    });
});
