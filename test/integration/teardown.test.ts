import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * Teardown is where this library is most fragile, because a <pc-app> disconnects BEFORE its
 * children - so a child's disconnectedCallback runs against an application that is already
 * destroyed, and any connectedCallback still suspended on an await resumes into the same state.
 * Three source files carry explicit guards for this: src/components/component.ts,
 * src/components/sound-slot.ts and src/sky.ts.
 *
 * These tests rely on the console guard, which asserts from a cleanup returned by beforeEach and
 * therefore runs AFTER the DOM has been torn down. An unclaimed warning or unhandled rejection
 * produced during teardown fails the test.
 */
describe('teardown', () => {
    const { warnings, uncaught } = useGuard();

    // A macrotask turn, so suspended callbacks resume and rejections are delivered.
    const settleTask = () =>
        new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

    it('destroys the application and removes the canvas when pc-app is removed', async () => {
        const { appElement, app, unmount } = await bootApp('<pc-entity name="e"></pc-entity>');
        const destroy = vi.spyOn(app, 'destroy');

        expect(appElement.querySelector('canvas')).toBeTruthy();

        unmount();
        await settleTask();

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(appElement.app).toBeNull();
        expect(appElement.querySelector('canvas')).toBeNull();
    });

    it('tears down a full tree of component elements without throwing', async () => {
        // Every element type that carries a teardown guard, in one tree.
        const { unmount } = await bootApp(`
            <pc-scene></pc-scene>
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="light"><pc-light type="directional"></pc-light></pc-entity>
            <pc-entity name="box">
                <pc-render type="box"></pc-render>
                <pc-sounds><pc-sound name="blip"></pc-sound></pc-sounds>
            </pc-entity>
        `);

        unmount();
        await settleTask();

        expect(uncaught.seen).toEqual([]);
        expect(warnings.seen).toEqual([]);
    });

    it('survives repeated mount and teardown cycles', async () => {
        // Repetition is what surfaces state that outlives a teardown. Each cycle asserts nothing
        // escaped, so a leak is attributed to the cycle that caused it rather than to the suite.
        const cycle = async () => {
            const { unmount } = await bootApp(`
                <pc-entity name="e">
                    <pc-camera></pc-camera>
                    <pc-sounds><pc-sound name="blip"></pc-sound></pc-sounds>
                </pc-entity>
            `);
            unmount();
            await settleTask();
            expect(uncaught.seen).toEqual([]);
        };

        await cycle();
        await cycle();
        await cycle();
    });

    it('does not throw when a pc-sound is added and removed within the same task', async () => {
        // Regression test for #310. SoundSlotElement.connectedCallback awaits its parent's ready
        // promise and then used to dereference `soundElement!.component!` with no re-check, so a
        // slot removed while that await was pending resumed against a null component and threw
        // "Cannot read properties of null (reading 'addSlot')" as an unhandled rejection.
        const { get } = await bootApp('<pc-entity name="e"><pc-sounds></pc-sounds></pc-entity>');
        const sounds = get('pc-sounds');

        const slot = document.createElement('pc-sound');
        slot.setAttribute('name', 'blip');
        sounds.appendChild(slot);
        slot.remove();

        await settleTask();

        expect(uncaught.seen).toEqual([]);
    });

    it('does not throw when the whole app is removed while a pc-sound is connecting', async () => {
        // The wider version of #310: the slot itself stays put, but the <pc-app> above it is torn
        // down while the slot's connectedCallback is still suspended.
        const { get, unmount } = await bootApp('<pc-entity name="e"><pc-sounds></pc-sounds></pc-entity>');
        const sounds = get('pc-sounds');

        const slot = document.createElement('pc-sound');
        slot.setAttribute('name', 'blip');
        sounds.appendChild(slot);
        unmount();

        await settleTask();

        expect(uncaught.seen).toEqual([]);
    });

    it('removes the slot from the component when a pc-sound is removed', async () => {
        // The bug this covers was found by the test above: disconnectedCallback used to rediscover
        // its parent through the warning getter, but parentElement is already null by then - so
        // removeSlot was never called (the slot leaked on a still-live component) and an ordinary
        // removal emitted a misleading "must be a direct child of a pc-sounds element" warning.
        const { get } = await bootApp(
            '<pc-entity name="e"><pc-sounds><pc-sound name="blip"></pc-sound></pc-sounds></pc-entity>'
        );
        const soundsElement = get('pc-sounds');
        const slot = get('pc-sound');
        const component = (soundsElement as { component?: { slots: Record<string, unknown> } }).component!;

        expect(Object.keys(component.slots)).toContain('blip');

        slot.remove();
        await settleTask();

        expect(Object.keys(component.slots)).not.toContain('blip');
        expect(warnings.seen).toEqual([]);
    });

    it('recreates the hierarchy when a pc-entity subtree is removed and re-added', async () => {
        const { app, all } = await bootApp('<pc-entity name="parent"><pc-entity name="child"></pc-entity></pc-entity>');
        // Two pc-entity elements in this tree, so get() - which asserts a single match - is not
        // the right accessor here.
        const parentElement = all('pc-entity')[0];
        const container = parentElement.parentElement as AppElement;

        expect(app.root.findByName('child')).toBeTruthy();

        parentElement.remove();
        await settleTask();
        expect(app.root.findByName('parent')).toBeNull();
        expect(app.root.findByName('child')).toBeNull();

        container.appendChild(parentElement);
        await settleTask();

        expect(app.root.findByName('parent')).toBeTruthy();
        expect(uncaught.seen).toEqual([]);

        // The nested entity comes back too, and is re-parented rather than merely recreated.
        // disconnectedCallback resets _built alongside _entity on every descendant, so
        // _buildHierarchy no longer bails on a stale _built and leaves the child orphaned -
        // created, never parented, and never ready again.
        const parentEntity = app.root.findByName('parent');
        const childEntity = app.root.findByName('child');
        const childElement = all<EntityElement>('pc-entity')[1];

        expect(childEntity, 'the child is attached to the hierarchy').toBeTruthy();
        expect(childElement.entity, "and is the element's own entity").toBe(childEntity);
        expect(childEntity?.parent, 'parented under the parent entity, not the root').toBe(parentEntity);
    });

    it('restores every level when a three-deep pc-entity subtree is removed and re-added', async () => {
        // The two-level case above cannot distinguish "descendants are reset" from "the first
        // descendant is reset". This also pins _buildHierarchy's dependence on document order:
        // connectedCallback builds the querySelectorAll result in sequence, so each level has to be
        // parented before the level below it looks up closestEntity.
        const { app, all } = await bootApp(`
            <pc-entity name="a">
                <pc-entity name="b">
                    <pc-entity name="c"></pc-entity>
                </pc-entity>
            </pc-entity>
        `);
        const root = all<EntityElement>('pc-entity')[0];
        const container = root.parentElement as AppElement;

        root.remove();
        await settleTask();
        expect(app.root.findByName('c')).toBeNull();

        container.appendChild(root);
        await settleTask();

        const a = app.root.findByName('a');
        const b = app.root.findByName('b');
        const c = app.root.findByName('c');

        expect([a, b, c].every(Boolean), 'all three levels are back').toBe(true);
        expect(b?.parent, 'b under a').toBe(a);
        expect(c?.parent, 'c under b').toBe(b);
        expect(uncaught.seen).toEqual([]);
    });
});
