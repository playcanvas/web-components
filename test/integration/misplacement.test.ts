import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { AsyncElement } from '../../src/async-element';
import type { ComponentElement } from '../../src/components/component';
import type { SceneElement } from '../../src/scene';
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

    it('warns and never becomes ready for a pc-entity with no pc-app ancestor', async () => {
        const handle = mount('<pc-entity name="stray"></pc-entity>');
        const entity = handle.get<AsyncElement>('pc-entity');

        warnings.expect('pc-entity \'stray\' must be a descendant of pc-app - entity not created');
        await expectNeverReady(entity);
    });

    it('omits the label when an unnamed pc-entity has no pc-app ancestor', async () => {
        const handle = mount('<pc-entity></pc-entity>');

        warnings.expect('pc-entity must be a descendant of pc-app - entity not created');
        await expectNeverReady(handle.get<AsyncElement>('pc-entity'));
    });

    // Both cases below are only testable because <pc-scene> warns and returns rather than throwing.
    // A throw inside an async connectedCallback becomes an unhandled rejection, and Vitest fails the
    // whole file on any of those, whether or not a test claims it.
    it('warns and never becomes ready for a pc-scene with no pc-app ancestor', async () => {
        const handle = mount('<pc-scene fog="linear"></pc-scene>');
        const scene = handle.get<AsyncElement>('pc-scene');

        warnings.expect('pc-scene must be a descendant of pc-app - scene settings not applied');
        await expectNeverReady(scene);
    });

    it('applies settings to a pc-scene nested inside a wrapper element', async () => {
        // pc-scene requires a descendant relationship, not a direct child. pc-asset and pc-material
        // require a direct child because app.ts collects them with `:scope > `; nothing queries
        // pc-scene, so there is no mechanical reason to restrict it.
        const { get, appElement } = await bootUnsettled('<div><pc-scene fog="exp2" gravity="0 -5 0"></pc-scene></div>');
        const scene = get<SceneElement>('pc-scene');

        await readyWithin(scene);

        expect(scene.scene?.fog.type).toBe('exp2');
        expect(appElement.app?.systems.rigidbody?.gravity.y).toBe(-5);
    });

    it('configures nothing when a pc-scene is removed while the app is still booting', async () => {
        // connectedCallback captures its pc-app, then awaits readiness. Removing the element inside
        // that window used to leave it configuring - and becoming ready against - an app it was no
        // longer attached to. The guard also covers the re-parent case, where taking the Scene from
        // the captured app while _applyGravity resolved the new one would split the two.
        const handle = mount('<pc-app backend="null"><pc-scene fog="exp2" gravity="0 -5 0"></pc-scene></pc-app>');
        const appElement = handle.get<AppElement>('pc-app');
        const scene = handle.get<SceneElement>('pc-scene');

        // Synchronous, so the app has not resolved its ready promise yet
        scene.remove();

        await readyWithin(appElement);
        await expectNeverReady(scene);

        expect(scene.scene, 'no Scene is captured').toBeNull();
        expect(appElement.app?.scene.fog.type, 'fog is left at its default').toBe('none');
        expect(appElement.app?.systems.rigidbody?.gravity.y, 'gravity is left at its default').toBeCloseTo(-9.81);
    });
});
