import type { AppBase } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { EntityOwnerElement } from '../../src/index';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * EntityOwnerElement is exported, so a class outside the library can extend it directly, as
 * pc-entity and pc-model do. Whatever it declares has to work on such a class: the properties, the
 * defaults they start from and the entity they write through to.
 *
 * `enabled` and `name` once had their accessors installed on pc-entity and pc-model alone, which
 * left the base class with two declarations and nothing behind them - a direct subclass read
 * `undefined` for both and created an entity named `undefined`.
 */
class Owner extends EntityOwnerElement {}

customElements.define('test-owner', Owner);

describe('EntityOwnerElement', () => {
    useGuard();

    const owner = () => document.createElement('test-owner') as Owner;

    /**
     * Creates the element's entity and parents it under the application root, as pc-entity does
     * when it connects. An entity outside the hierarchy reports itself disabled whatever it was
     * given, so `enabled` can only be read back from one that is in it.
     *
     * @param element - The element.
     * @param app - The application.
     * @returns The entity.
     */
    const build = (element: Owner, app: AppBase) => {
        element._createEntity(app);
        element._buildHierarchy(app);
        if (!element.entity) {
            throw new Error('the element created no entity');
        }
        return element.entity;
    };

    describe('a class that extends it directly', () => {
        it('has the properties as accessors of the base class', () => {
            for (const property of ['enabled', 'name', 'position', 'rotation', 'scale', 'tags']) {
                const accessor = Object.getOwnPropertyDescriptor(EntityOwnerElement.prototype, property);
                expect.soft(accessor?.set, property).toBeTypeOf('function');
            }
        });

        it('starts from the defaults', () => {
            const element = owner();

            expect(element.enabled).toBe(true);
            expect(element.name).toBe('Untitled');
        });

        it('creates its entity with the defaults', async () => {
            const { app } = await bootApp();

            const entity = build(owner(), app);

            expect(entity.name).toBe('Untitled');
            expect(entity.enabled).toBe(true);
        });

        it('creates its entity with what was assigned before there was one', async () => {
            const { app } = await bootApp();
            const element = owner();
            element.enabled = false;
            element.name = 'owned';

            const entity = build(element, app);

            expect(entity.name).toBe('owned');
            expect(entity.enabled).toBe(false);
        });

        it('writes enabled and name through to its entity', async () => {
            const { app } = await bootApp();
            const element = owner();
            const entity = build(element, app);

            element.enabled = false;
            element.name = 'renamed';

            expect(entity.enabled).toBe(false);
            expect(entity.name).toBe('renamed');

            element.enabled = true;

            expect(entity.enabled).toBe(true);
        });
    });
});
