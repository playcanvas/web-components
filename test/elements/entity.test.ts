import { Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';

/**
 * Element-level behavior, with no <pc-app> and therefore no engine. Every setter caches to a
 * private field and only writes through when `this.entity` exists, so attribute handling is fully
 * observable on a disconnected element.
 */
describe('<pc-entity>', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('pc-entity') as EntityElement;

    describe('[tags]', () => {
        it('parses a comma-separated list, trimming each entry', () => {
            const element = create();
            element.setAttribute('tags', 'alpha, beta ,gamma');
            expect(element.tags).toEqual(['alpha', 'beta', 'gamma']);
        });

        it('restores the default when the attribute is removed', () => {
            // Regression test for #309. attributeChangedCallback receives null on removal, and
            // this case used to call newValue.split(',') unguarded - which threw a TypeError
            // synchronously out of removeAttribute, because attribute reactions run in the
            // caller's stack for an upgraded element.
            const element = create();
            element.setAttribute('tags', 'alpha,beta');
            expect(element.tags).toEqual(['alpha', 'beta']);

            expect(() => element.removeAttribute('tags')).not.toThrow();
            expect(element.tags).toEqual([]);
        });

        it.for(['', '   ', ',', 'enemy,', ',enemy', 'enemy,,flying'])('discards empty names in %o', (value) => {
            // Both tags call sites now route through parseTags, which drops empty names. Before
            // that, `tags=""` set the element property to [''] - a single blank tag - while
            // _createEntity's `if (tags)` truthiness check skipped it entirely, so the element and
            // its backing entity disagreed. See the integration test for the agreement assertion.
            const element = create();
            element.setAttribute('tags', value);
            expect(element.tags).not.toContain('');
        });

        it('does not warn for any tags value, valid or not', () => {
            const element = create();
            element.setAttribute('tags', 'alpha');
            element.removeAttribute('tags');
            expect(warnings.seen).toEqual([]);
        });
    });

    describe('[position]', () => {
        it('round-trips a valid value and restores the default on removal', () => {
            const element = create();
            element.setAttribute('position', '1 2 3');
            expect(element.position).toEqual(new Vec3(1, 2, 3));

            element.removeAttribute('position');
            expect(element.position).toEqual(Vec3.ZERO);
        });

        it('warns and falls back for a malformed value', () => {
            const element = create();
            element.setAttribute('position', '1 2');
            expect(element.position).toEqual(Vec3.ZERO);
            warnings.expect("Invalid value '1 2' for attribute 'position'. Expected 3 space-separated numbers.");
        });
    });

    describe('#closestEntity', () => {
        // Deliberately no <pc-app> here: this tier must not create an engine, and closestEntity
        // does not need one. The equivalent closestApp assertions live in the integration tier,
        // where bootApp() can settle the tree properly.
        it('resolves an ancestor entity through an intervening element', () => {
            const handle = mount(`
                <pc-entity name="outer">
                    <div>
                        <pc-entity name="inner"></pc-entity>
                    </div>
                </pc-entity>
            `);

            // Connecting an entity with no pc-app ancestor warns. Not the point of this test.
            warnings.allow(/must be a descendant of pc-app/);

            const [outer, inner] = handle.all<EntityElement>('pc-entity');

            // Both getters start from parentElement, so an element never matches itself, and the
            // lookup uses closest(), so a wrapper element does not break the relationship - which
            // is what lets markup nest entities inside layout elements.
            expect(inner.closestEntity).toBe(outer);
            expect(outer.closestEntity).toBeNull();
        });

        it('is null when there is no app ancestor', () => {
            const handle = mount('<pc-entity name="stray"></pc-entity>');

            // Connecting an entity with no pc-app ancestor warns. Not the point of this test.
            warnings.allow(/must be a descendant of pc-app/);

            expect(handle.get<EntityElement>('pc-entity').closestApp).toBeNull();
        });
    });
});
