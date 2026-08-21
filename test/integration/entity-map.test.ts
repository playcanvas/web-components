import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * A macrotask turn, so disconnect callbacks and suspended awaits run to completion.
 *
 * @returns A promise that settles once queued work has run.
 */
const settleTask = () =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

/** The smallest valid glTF, for the pc-model host registration cases. Loads from a data: URI. */
const MODEL_ASSET_TAG = `<pc-asset id="map-m" type="container" src="data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'map-root' }]
    })
)}"></pc-asset>`;

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

    it('registers a pc-model host, never its instantiated content', async () => {
        const { appElement, get } = await bootApp(`${MODEL_ASSET_TAG}<pc-model asset="map-m"></pc-model>`);
        const model = get('pc-model');

        expect(appElement.elementFromEntity(model.entity!), 'the host resolves to the element').toBe(model);
        expect(appElement.elementFromEntity(model.contentEntity!),
            'content nodes stay unregistered, so picks fall through to the host').toBeNull();
    });

    it('resets a pc-model when a user script destroys its host', async () => {
        const { appElement, get } = await bootApp(`${MODEL_ASSET_TAG}<pc-model asset="map-m"></pc-model>`);
        const model = get('pc-model');
        const host = model.entity!;

        host.destroy();

        expect(appElement.elementFromEntity(host)).toBeNull();
        expect(model.entity, 'the element no longer references the destroyed host').toBeNull();
        expect(model.contentEntity, 'the content died with the host subtree').toBeNull();
    });

    it('registers a fresh host when a pc-model is removed and re-added', async () => {
        const { appElement, get } = await bootApp(`${MODEL_ASSET_TAG}<pc-model asset="map-m"></pc-model>`);
        const model = get('pc-model');
        const container = model.parentElement!;
        const oldHost = model.entity!;

        model.remove();
        await settleTask();
        expect(appElement.elementFromEntity(oldHost), 'the destroyed host is unregistered').toBeNull();

        container.appendChild(model);
        await readyWithin(model);

        expect(model.entity, 'a fresh host was created').not.toBe(oldHost);
        expect(appElement.elementFromEntity(model.entity!)).toBe(model);
        expect(model.contentEntity!.parent, 'the content was re-instantiated beneath it').toBe(model.entity);
        expect(uncaught.seen).toEqual([]);
    });
});
