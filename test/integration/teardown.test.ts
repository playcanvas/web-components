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
    const settleTask = () => new Promise((resolve) => {
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

        // The parent comes back, because its own disconnectedCallback reset both _entity and
        // _built.
        expect(app.root.findByName('parent')).toBeTruthy();
        expect(uncaught.seen).toEqual([]);

        // KNOWN BUG (#315): the child does not. src/entity.ts:151-153 nulls _entity on every
        // descendant, but line 158 resets _built only for `this` - and because the parent has
        // already nulled the child's _entity, the child's own disconnectedCallback skips its reset
        // behind the `if (this.entity)` guard. So on re-insertion createEntity() makes a fresh
        // entity while buildHierarchy() bails on the stale _built, leaving it orphaned: created,
        // never parented, and never ready again.
        const childElement = all<EntityElement>('pc-entity')[1];
        expect(childElement.entity, 'the child entity is recreated').toBeTruthy();
        expect(app.root.findByName('child'), 'but never attached to the hierarchy').toBeNull();
        expect(childElement.entity.parent, 'and has no parent').toBeNull();
    });

    it.todo('re-attaches a nested pc-entity when its subtree is removed and re-added');
});
