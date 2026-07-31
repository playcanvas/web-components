import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { AsyncElement } from '../../src/async-element';
import type { ComponentElement } from '../../src/components/component';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';


/**
 * Misplaced elements are this library's entire negative-path surface, and none of them throws or
 * rejects: each logs a console.warn naming the parent it requires and then does nothing, leaving a
 * ready promise that never settles.
 *
 * These tests deliberately do NOT use bootApp(), which settles every AsyncElement in the tree - a
 * misplaced element never settles, so it would time out. They mount directly and await only the
 * <pc-app>.
 */
describe('misplaced elements', () => {
    const { warnings } = useGuard();

    /**
     * Mounts markup and waits for the `<pc-app>` alone to become ready.
     *
     * @param html - The markup to place inside the `<pc-app>`.
     * @returns The mount handle, plus the app element.
     */
    const bootUnsettled = async (html: string) => {
        const handle = mount(`<pc-app backend="null">${html}</pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');
        await readyWithin(appElement);
        return { ...handle, appElement };
    };

    it('warns and skips the component when a component element is outside pc-entity', async () => {
        const { get } = await bootUnsettled('<pc-camera></pc-camera>');
        const camera = get<ComponentElement>('pc-camera');

        // The documented exception to the never-settles rule: a component element outside a
        // pc-entity still becomes ready, but with a null component.
        await readyWithin(camera);
        expect(camera.component).toBeNull();
        warnings.expect('pc-camera must be a descendant of pc-entity - component not added');
    });

    it('includes the element id in the warning when one is set', async () => {
        const { get } = await bootUnsettled('<pc-camera id="main"></pc-camera>');
        await readyWithin(get<ComponentElement>('pc-camera'));
        warnings.expect('pc-camera \'main\' must be a descendant of pc-entity - component not added');
    });

    it('warns and never becomes ready when pc-asset is not a direct child of pc-app', async () => {
        const { get } = await bootUnsettled('<div><pc-asset id="tex" src="/x.png"></pc-asset></div>');

        warnings.expect('pc-asset \'tex\' must be a direct child of pc-app - asset not created');
        await expectNeverReady(get<AsyncElement>('pc-asset'));
    });

    it('warns when pc-material is not a direct child of pc-app', async () => {
        await bootUnsettled('<div><pc-material id="red" diffuse="red"></pc-material></div>');

        // pc-material extends HTMLElement rather than AsyncElement, so there is no readiness to
        // assert - only the warning.
        warnings.expect('pc-material \'red\' must be a direct child of pc-app - material not created');
    });

    it('warns and never becomes ready when pc-script is not a direct child of pc-scripts', async () => {
        const { get } = await bootUnsettled(`
            <pc-entity name="e">
                <pc-scripts>
                    <div><pc-script name="rotate"></pc-script></div>
                </pc-scripts>
            </pc-entity>
        `);

        warnings.expect('pc-script \'rotate\' must be a direct child of pc-scripts - script not created');
        await expectNeverReady(get<AsyncElement>('pc-script'));
    });

    it('warns and never becomes ready when pc-sound is not a direct child of pc-sounds', async () => {
        const { get } = await bootUnsettled(`
            <pc-entity name="e">
                <pc-sounds>
                    <div><pc-sound name="blip"></pc-sound></div>
                </pc-sounds>
            </pc-entity>
        `);

        warnings.expect('pc-sound must be a direct child of a pc-sounds element');
        await expectNeverReady(get<AsyncElement>('pc-sound'));
    });

    it('never becomes ready and logs NOTHING for a pc-entity with no pc-app ancestor', async () => {
        // KNOWN BUG (#314): every other misplacement names the parent it requires. This one is
        // silent, so `await whenReady(...)` hangs with a completely clean console and the
        // documented debugging route - "check the warning" - is a dead end.
        const handle = mount('<pc-entity name="stray"></pc-entity>');
        const entity = handle.get<AsyncElement>('pc-entity');

        await expectNeverReady(entity);
        expect(warnings.seen, 'no warning is emitted - this is the bug').toEqual([]);
    });

    it.todo('warns that a pc-entity must be a descendant of pc-app');

    // KNOWN BUG (#313): a misplaced <pc-scene> throws instead of warning, because
    // updateSceneSettings reads this.parentElement while connectedCallback in the same file uses
    // closestApp - so a wrapper element makes it dereference `undefined.app`.
    //
    // This is deliberately NOT pinned with an executable test. The throw happens inside an async
    // connectedCallback, so it becomes an unhandled rejection, and Vitest fails the whole file on
    // any unhandled rejection regardless of whether a test claims it. There is no way to mount a
    // misplaced <pc-scene> and still have the file pass, and the bug cannot be reached
    // synchronously either: updateSceneSettings only gets past its `if (this.scene)` guard once
    // connectedCallback has run, and re-parenting an already-connected element just triggers the
    // async path again.
    //
    // Once #313 is fixed the todo below becomes a normal warning assertion, matching the other
    // cases in this file.
    it.todo('warns and does nothing when pc-scene is not a direct child of pc-app');
});
