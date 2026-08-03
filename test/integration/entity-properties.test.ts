import { Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * The imperative construction path: a scene assembled with document.createElement and property
 * assignments rather than markup, which is what examples/spinning-cube-api.html demonstrates.
 *
 * createEntity used to seed the entity by reading the attributes back, so anything assigned through
 * the property API before the entity existed was silently discarded - every value below came out as
 * its default. It now reads the cached fields, which hold the parsed attribute value and the
 * property value alike, since attributeChangedCallback routes attributes through the same setters.
 */
describe('<pc-entity> pre-boot property values', () => {
    useGuard();

    /**
     * Builds a detached pc-app around a pc-entity, letting the caller configure it before boot.
     *
     * @param configure - Applies properties to the entity element while it is still detached.
     * @returns The app and entity elements, both ready.
     */
    const bootWith = async (configure: (element: EntityElement) => void) => {
        const { container } = mount('');

        const appElement = document.createElement('pc-app') as AppElement;
        appElement.setAttribute('backend', 'null');

        const element = document.createElement('pc-entity') as EntityElement;
        configure(element);

        appElement.appendChild(element);
        container.appendChild(appElement);

        await readyWithin(appElement);
        await readyWithin(element);

        return { appElement, element };
    };

    it('carries every property assigned before boot onto the entity', async () => {
        const { element } = await bootWith((entity) => {
            entity.name = 'imperative';
            entity.position = new Vec3(1, 2, 3);
            entity.rotation = new Vec3(0, 90, 0);
            entity.scale = new Vec3(2, 2, 2);
            entity.enabled = false;
            entity.tags = ['alpha', 'beta'];
        });

        const entity = element.entity!;
        expect(entity.name).toBe('imperative');
        expect(entity.getLocalPosition().equals(new Vec3(1, 2, 3))).toBe(true);
        expect(entity.getLocalEulerAngles().y).toBeCloseTo(90);
        expect(entity.getLocalScale().equals(new Vec3(2, 2, 2))).toBe(true);
        expect(entity.enabled).toBe(false);
        expect(entity.tags.list().sort()).toEqual(['alpha', 'beta']);
    });

    it('lets a property assigned before boot override the attribute it shadows', async () => {
        // The sharpest form of the defect: with an attribute present, re-reading it in createEntity
        // beat the later property assignment, so the entity silently used the stale markup value.
        const { element } = await bootWith((entity) => {
            entity.setAttribute('position', '1 1 1');
            entity.position = new Vec3(9, 9, 9);
        });

        expect(element.position.equals(new Vec3(9, 9, 9)), 'the element property').toBe(true);
        expect(element.entity!.getLocalPosition().equals(new Vec3(9, 9, 9)), 'and the entity').toBe(true);
    });

    it('carries properties set before append onto an entity inserted at runtime', async () => {
        const { appElement, app } = await bootApp();

        const element = document.createElement('pc-entity') as EntityElement;
        element.name = 'runtime';
        element.position = new Vec3(4, 5, 6);
        appElement.appendChild(element);

        await readyWithin(element);

        expect(app.root.findByName('runtime')).toBe(element.entity);
        expect(element.entity!.getLocalPosition().equals(new Vec3(4, 5, 6))).toBe(true);
    });
});
