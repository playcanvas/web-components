import { Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ModelElement } from '../../src/model';
import { useGuard } from '../helpers/guard';

/**
 * Element-level behavior, with no <pc-app> and therefore no engine. Every setter caches to a
 * private field and only writes through when the host entity exists, so attribute handling is
 * fully observable on a disconnected element. The host-entity attributes mirror <pc-entity>'s;
 * the cases here pin that the shared machinery really is wired into this element.
 */
describe('<pc-model>', () => {
    const { warnings } = useGuard();

    const create = () => document.createElement('pc-model') as ModelElement;

    describe('[asset]', () => {
        it('caches an assignment made while disconnected', () => {
            const element = create();
            element.asset = 'm';
            expect(element.asset).toBe('m');
            expect(element.contentEntity, 'no engine, so nothing instantiates').toBeNull();
        });
    });

    describe('[enabled]', () => {
        it('parses the attribute and restores the default on removal', () => {
            const element = create();
            element.setAttribute('enabled', 'false');
            expect(element.enabled).toBe(false);

            element.removeAttribute('enabled');
            expect(element.enabled).toBe(true);
        });
    });

    describe('[name]', () => {
        it('restores the default entity name on removal', () => {
            const element = create();
            expect(element.name).toBe('Untitled');

            element.setAttribute('name', 'prop');
            expect(element.name).toBe('prop');

            element.removeAttribute('name');
            expect(element.name).toBe('Untitled');
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

    describe('[scale]', () => {
        it('defaults to one rather than zero', () => {
            const element = create();
            expect(element.scale).toEqual(Vec3.ONE);

            element.setAttribute('scale', '2 2 2');
            expect(element.scale).toEqual(new Vec3(2, 2, 2));

            element.removeAttribute('scale');
            expect(element.scale).toEqual(Vec3.ONE);
        });
    });

    describe('[tags]', () => {
        it('parses a comma-separated list and restores the default on removal', () => {
            const element = create();
            element.setAttribute('tags', 'alpha, beta ,gamma');
            expect(element.tags).toEqual(['alpha', 'beta', 'gamma']);

            expect(() => element.removeAttribute('tags')).not.toThrow();
            expect(element.tags).toEqual([]);
        });
    });
});
