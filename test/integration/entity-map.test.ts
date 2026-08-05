import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * A macrotask turn, so disconnect callbacks and suspended awaits run to completion.
 *
 * @returns A promise that settles once queued work has run.
 */
const settleTask = () =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

/**
 * The entity map is what joins engine scene nodes back to their owning elements by identity.
 * Picking resolves hits through it, and pc-node (#297) will register bound entities into it, so
 * its bookkeeping - registration at creation, removal on destruction, whoever triggers it - is
 * behavior in its own right.
 */
describe('pc-app entity map', () => {
    const { uncaught } = useGuard();

    it('elementFromEntity returns the element that created each entity', async () => {
        const { appElement, all } = await bootApp(
            '<pc-entity name="parent"><pc-entity name="child"></pc-entity></pc-entity>'
        );
        const elements = Array.from(all<EntityElement>('pc-entity'));

        expect(elements).toHaveLength(2);
        for (const element of elements) {
            expect(element.entity).not.toBeNull();
            expect(appElement.elementFromEntity(element.entity!)).toBe(element);
        }
    });

    it('returns null for an entity no element created', async () => {
        const { appElement, app } = await bootApp('<pc-entity name="e"></pc-entity>');

        // app.root is a real entity of this application, but no element owns it
        expect(appElement.elementFromEntity(app.root)).toBeNull();
    });

    it('resets the element and its registration when a user script destroys the entity', async () => {
        const { appElement, get } = await bootApp('<pc-entity name="e"></pc-entity>');
        const element = get<EntityElement>('pc-entity');
        const entity = element.entity!;

        entity.destroy();

        expect(appElement.elementFromEntity(entity)).toBeNull();
        expect(element.entity, 'the element no longer references the destroyed entity').toBeNull();
    });

    it('is emptied when the application is torn down', async () => {
        const { appElement, get, unmount } = await bootApp('<pc-entity name="e"></pc-entity>');
        const entity = get<EntityElement>('pc-entity').entity!;

        unmount();
        await settleTask();

        expect(appElement.elementFromEntity(entity)).toBeNull();
        expect(uncaught.seen).toEqual([]);
    });

    it('registers the fresh entity when a subtree is removed and re-added', async () => {
        const { appElement, all } = await bootApp(
            '<pc-entity name="parent"><pc-entity name="child"></pc-entity></pc-entity>'
        );
        const parentElement = all<EntityElement>('pc-entity')[0];
        const container = parentElement.parentElement!;
        const oldEntity = parentElement.entity!;

        parentElement.remove();
        await settleTask();
        expect(appElement.elementFromEntity(oldEntity), 'the destroyed entity is unregistered').toBeNull();

        container.appendChild(parentElement);
        await settleTask();

        const fresh = parentElement.entity;
        expect(fresh, 'a fresh entity was created').not.toBeNull();
        expect(fresh).not.toBe(oldEntity);
        expect(appElement.elementFromEntity(fresh!)).toBe(parentElement);
        expect(uncaught.seen).toEqual([]);
    });
});
