import { describe, expect, it } from 'vitest';

import { getEntity, resolveEntity } from '../../src/parse';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * getEntity and resolveEntity resolve references against the DOM (through findEntityElement), so
 * they are covered here against a real hierarchy rather than in the pure-unit tier. resolveEntity
 * is the reporting wrapper every element resolves references through, so its message contract -
 * the two causes, the caller-supplied meaning, the silence of an empty reference - is pinned here
 * once rather than per element.
 */
describe('entity references', () => {
    const { warnings } = useGuard();

    const markup = `
        <pc-entity id="cube-id" name="Cube"></pc-entity>
        <pc-entity name="Spaced Name"></pc-entity>
    `;

    describe('getEntity', () => {
        it('resolves a CSS id selector', async () => {
            const { app } = await bootApp(markup);
            expect(getEntity('#cube-id')).toBe(app.root.findByName('Cube'));
        });

        it('resolves an attribute selector', async () => {
            const { app } = await bootApp(markup);
            expect(getEntity('pc-entity[name="Cube"]')).toBe(app.root.findByName('Cube'));
        });

        it('resolves a bare element id', async () => {
            const { app } = await bootApp(markup);
            expect(getEntity('cube-id')).toBe(app.root.findByName('Cube'));
        });

        it('falls back to a name lookup for a valid selector that matches nothing', async () => {
            const { app } = await bootApp(markup);
            // 'Spaced Name' is a *valid* descendant selector, so querySelector returns null rather
            // than throwing, and the id/name fallback is what resolves it. This path does not
            // exercise the try/catch - see the malformed-selector test below for that.
            expect(getEntity('Spaced Name')).toBe(app.root.findByName('Spaced Name'));
        });

        it('falls back to a name lookup for a malformed selector, exercising the try/catch', async () => {
            const { app } = await bootApp('<pc-entity name="pc-entity["></pc-entity>');
            // An unclosed attribute selector makes querySelector throw, which is the only way into
            // getEntity's catch block.
            expect(getEntity('pc-entity[')).toBe(app.root.findByName('pc-entity['));
        });

        it('returns null for an empty reference', async () => {
            await bootApp(markup);
            expect(getEntity('')).toBeNull();
        });

        it('returns null when nothing matches', async () => {
            await bootApp(markup);
            expect(getEntity('#nope')).toBeNull();
        });

        it('returns null when the match is not a pc-entity', async () => {
            await bootApp('<div id="plain"></div>');
            expect(getEntity('#plain')).toBeNull();
        });

        it('prefers an id match over a name match', async () => {
            const { app } = await bootApp(`
                <pc-entity id="target" name="ById"></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            expect(getEntity('target')).toBe(app.root.findByName('ById'));
        });

        it('resolves a name containing a quote through the escaped fallback selector', async () => {
            const { app } = await bootApp(`<pc-entity name='say "hi"'></pc-entity>`);
            expect(getEntity('say "hi"')).toBe(app.root.findByName('say "hi"'));
        });
    });

    describe('resolveEntity', () => {
        it('returns the entity silently when the reference resolves', async () => {
            const { app } = await bootApp(markup);
            expect(resolveEntity('#cube-id', 'pc-test', 'target', 'reference ignored')).toBe(
                app.root.findByName('Cube')
            );
        });

        it('returns null silently for an empty reference', async () => {
            await bootApp(markup);
            expect(resolveEntity('', 'pc-test', 'target', 'reference ignored')).toBeNull();
        });

        it('warns with the caller-supplied meaning when nothing matches', async () => {
            await bootApp(markup);
            expect(resolveEntity('#nope', 'pc-test', 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target '#nope' - nothing in the document matches it - " +
                    'reference ignored. Assign target again once the entity exists.'
            );
        });

        it('warns with the timing cause when the matched element is not backing an entity yet', async () => {
            await bootApp(markup);

            // A misplaced pc-entity never creates an entity - to the resolver, the same state a
            // pc-node presents until its container asset loads: entity-capable, but backing
            // nothing. Placed outside the pc-app so the state holds at the moment of resolution.
            const pending = document.createElement('pc-entity');
            pending.id = 'pending';
            document.body.appendChild(pending);
            try {
                warnings.expect('pc-entity must be a descendant of pc-app - entity not created');

                expect(resolveEntity('#pending', 'pc-test', 'target', 'reference ignored')).toBeNull();
                warnings.expect(
                    "pc-test could not resolve target '#pending' - <pc-entity> matches it but is not backing " +
                        'an entity yet - reference ignored. Assign target again once the entity exists.'
                );
            } finally {
                pending.remove();
            }
        });

        it('warns with the wrong-target cause and advice when the match cannot back an entity', async () => {
            await bootApp('<div id="plain"></div>');
            expect(resolveEntity('#plain', 'pc-test', 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target '#plain' - <div> matches it but cannot back an entity - " +
                    'reference ignored. Point target at a pc-entity instead.'
            );
        });

        it('warns rather than throwing for a reference the fallback selector cannot parse', async () => {
            await bootApp(markup);

            // A quote is escaped into the name selector; a newline cannot be, and must be
            // absorbed - the null-and-warn contract holds for arbitrary references
            expect(resolveEntity('bad"name', 'pc-test', 'target', 'reference ignored')).toBeNull();
            warnings.expect(`pc-test could not resolve target 'bad"name' - nothing in the document matches it`);

            expect(resolveEntity('bad\nname', 'pc-test', 'target', 'reference ignored')).toBeNull();
            warnings.expect("pc-test could not resolve target 'bad\nname' - nothing in the document matches it");
        });
    });
});
