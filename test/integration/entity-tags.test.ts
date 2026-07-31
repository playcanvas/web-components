import type { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * `tags` is set from two independent places - createEntity, which runs when the app builds the
 * hierarchy, and attributeChangedCallback, which runs on upgrade and on every later change. Both now
 * route through parseTags, so these tests assert the thing that actually matters: that the element's
 * `tags` property and the backing entity's tags agree, whichever path produced them.
 *
 * Before parseTags they disagreed for any value containing an empty name. `tags=""` set the element
 * property to [''] - one blank tag - while createEntity's `if (tags)` truthiness check skipped the
 * value entirely, leaving the entity with none.
 */
describe('<pc-entity> tags', () => {
    useGuard();

    const tagsOf = (element: EntityElement) => (element.entity as Entity).tags.list().sort();

    describe('at boot time', () => {
        it.for([
            ['enemy', ['enemy']],
            ['enemy,flying', ['enemy', 'flying']],
            ['enemy, flying ,boss', ['boss', 'enemy', 'flying']],
            // The cases that used to diverge
            ['', []],
            ['   ', []],
            ['enemy,', ['enemy']],
            ['enemy,,flying', ['enemy', 'flying']]
        ] as [string, string[]][])('applies %o to the entity as %o', async ([value, expected]) => {
            const { all } = await bootApp(`<pc-entity name="e" tags="${value}"></pc-entity>`);
            const element = all<EntityElement>('pc-entity')[0];

            expect(tagsOf(element)).toEqual(expected);
            // The element property and the engine object must agree.
            expect([...element.tags].sort()).toEqual(expected);
        });
    });

    describe('inserted at runtime', () => {
        it('applies tags through the same path as boot', async () => {
            const { appElement, app } = await bootApp();

            const element = document.createElement('pc-entity') as EntityElement;
            element.setAttribute('name', 'runtime');
            element.setAttribute('tags', 'enemy, flying,');
            appElement.appendChild(element);

            await readyWithin(element);

            expect(tagsOf(element)).toEqual(['enemy', 'flying']);
            expect(app.root.findByTag('enemy')).toHaveLength(1);
        });
    });

    describe('changed after boot', () => {
        it('replaces the entity tags when the attribute changes', async () => {
            const { all } = await bootApp('<pc-entity name="e" tags="enemy"></pc-entity>');
            const element = all<EntityElement>('pc-entity')[0];

            element.setAttribute('tags', 'boss,flying');

            // The setter clears before adding, so this is a replacement rather than a merge.
            expect(tagsOf(element)).toEqual(['boss', 'flying']);
        });

        it('clears the entity tags when the attribute is removed', async () => {
            const { all } = await bootApp('<pc-entity name="e" tags="enemy,flying"></pc-entity>');
            const element = all<EntityElement>('pc-entity')[0];

            element.removeAttribute('tags');

            expect(element.tags).toEqual([]);
            expect(tagsOf(element)).toEqual([]);
        });

        it('is findable through the engine registry', async () => {
            const { app, all } = await bootApp(`
                <pc-entity name="a" tags="enemy"></pc-entity>
                <pc-entity name="b" tags="enemy,boss"></pc-entity>
                <pc-entity name="c" tags="friendly"></pc-entity>
            `);

            expect(app.root.findByTag('enemy')).toHaveLength(2);
            expect(app.root.findByTag('boss')).toHaveLength(1);

            all<EntityElement>('pc-entity')[2].setAttribute('tags', 'enemy');
            expect(app.root.findByTag('enemy')).toHaveLength(3);
        });
    });
});
