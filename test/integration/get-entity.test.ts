import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
import { getEntity, resolveEntity } from '../../src/parse';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/** A meshless glTF with a single named node, for the `<pc-model>`/`<pc-node>` name cases. */
const STAGE_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'Podium' }]
    })
)}`;

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

        it('resolves the name of a pc-model and of a bound pc-node', async () => {
            const { get } = await bootApp(`
                <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
                <pc-model name="Rig" asset="stage">
                    <pc-node name="Podium"></pc-node>
                </pc-model>
            `);

            // Names resolve to any entity-fronting element, not just pc-entity - what lets a
            // joint reference a model's own skeleton nodes by name.
            expect(getEntity('Rig')).toBe(get<ModelElement>('pc-model').entity);
            expect(getEntity('Podium')).toBe(get<NodeElement>('pc-node').entity);
        });
    });

    describe('resolveEntity', () => {
        // A disconnected caller has no enclosing scopes, so resolution stays document-wide - the
        // path these messages were pinned against. Its tag names the warning.
        const caller = () => document.createElement('pc-test');

        it('returns the entity silently when the reference resolves', async () => {
            const { app } = await bootApp(markup);
            expect(resolveEntity('#cube-id', caller(), 'target', 'reference ignored')).toBe(
                app.root.findByName('Cube')
            );
        });

        it('returns null silently for an empty reference', async () => {
            await bootApp(markup);
            expect(resolveEntity('', caller(), 'target', 'reference ignored')).toBeNull();
        });

        it('warns with the caller-supplied meaning when nothing matches', async () => {
            await bootApp(markup);
            expect(resolveEntity('#nope', caller(), 'target', 'reference ignored')).toBeNull();
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

                expect(resolveEntity('#pending', caller(), 'target', 'reference ignored')).toBeNull();
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
            expect(resolveEntity('#plain', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target '#plain' - <div> matches it but cannot back an entity - " +
                    'reference ignored. Point target at a pc-entity instead.'
            );
        });

        it('warns with the timing cause for a pc-node matched by name before it binds', async () => {
            const { get } = await bootApp(`
                <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
                <pc-model asset="stage"></pc-model>
            `);

            // A node name the model does not contain: the element exists but never backs an
            // entity - to a name reference, the same state a pc-node presents until its
            // container asset loads.
            const ghost = document.createElement('pc-node');
            ghost.setAttribute('name', 'Ghost');
            get<ModelElement>('pc-model').appendChild(ghost);
            try {
                warnings.expect("pc-node 'Ghost' not found in");

                expect(resolveEntity('Ghost', caller(), 'target', 'reference ignored')).toBeNull();
                warnings.expect(
                    "pc-test could not resolve target 'Ghost' - <pc-node> matches it but is not backing " +
                        'an entity yet - reference ignored. Assign target again once the entity exists.'
                );
            } finally {
                ghost.remove();
            }
        });

        it('warns rather than throwing for a reference the fallback selector cannot parse', async () => {
            await bootApp(markup);

            // A quote is escaped into the name selector; a newline cannot be, and must be
            // absorbed - the null-and-warn contract holds for arbitrary references
            expect(resolveEntity('bad"name', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect(`pc-test could not resolve target 'bad"name' - nothing in the document matches it`);

            expect(resolveEntity('bad\nname', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect("pc-test could not resolve target 'bad\nname' - nothing in the document matches it");
        });
    });

    describe('scoped resolution', () => {
        /**
         * Two same-named subtrees, with the <pc-test> probe (an unregistered element - inert, and
         * its tag names resolveEntity's messages) inside the second: an exact entity-name match
         * must resolve through the probe's enclosing entities, never first-in-document. This is
         * what lets a cloned <template> prefab reference its own entities.
         */
        const DUPLICATES = `
            <pc-entity name="first">
                <pc-entity name="dup"></pc-entity>
            </pc-entity>
            <pc-entity name="second">
                <pc-entity name="dup"></pc-entity>
                <pc-test></pc-test>
            </pc-entity>
        `;

        it('resolves a duplicated bare name to the nearest enclosing entity scope', async () => {
            const { get } = await bootApp(DUPLICATES);
            const near = get<EntityElement>('pc-entity[name="second"] > pc-entity[name="dup"]');

            expect(getEntity('dup', get('pc-test')), 'scoped, the enclosing subtree wins').toBe(near.entity);

            const far = get<EntityElement>('pc-entity[name="first"] > pc-entity[name="dup"]');
            expect(getEntity('dup'), 'unscoped, document order still wins').toBe(far.entity);
        });

        it('resolves the enclosing entity itself, so a clone can name its own root', async () => {
            const { get } = await bootApp(`
                <pc-entity name="chassis"></pc-entity>
                <pc-entity id="own" name="chassis"><pc-test></pc-test></pc-entity>
            `);

            expect(getEntity('chassis', get('pc-test'))).toBe(get<EntityElement>('#own').entity);
        });

        it('climbs past the entity chain to the containing application before the document', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="roof"></pc-entity>
                <pc-entity name="host"><pc-test></pc-test></pc-entity>
            `);

            // A same-named pc-entity outside the application, placed ahead of it in document
            // order. It backs no entity (and warns so), which is what tells the two paths apart:
            // the application scope resolves the live entity, while the document-wide name lookup
            // finds the entity-less outsider first and yields nothing.
            const outside = document.createElement('pc-entity');
            outside.setAttribute('name', 'roof');
            document.body.insertBefore(outside, document.body.firstChild);
            try {
                warnings.expect("pc-entity 'roof' must be a descendant of pc-app - entity not created");

                expect(getEntity('roof', get('pc-test'))).toBe(app.root.findByName('roof'));
                expect(getEntity('roof')).toBeNull();
            } finally {
                outside.remove();
            }
        });

        it('prefers an in-scope entity name over a document id match', async () => {
            const { app, get } = await bootApp(`<pc-entity id="dup" name="ById"></pc-entity>${DUPLICATES}`);
            const near = get<EntityElement>('pc-entity[name="second"] > pc-entity[name="dup"]');

            // Unscoped, the id lookup wins (pinned above); scoped, the lexical name phase runs
            // first, so a page-level id cannot shadow a prefab's internal wiring.
            expect(getEntity('dup')).toBe(app.root.findByName('ById'));
            expect(getEntity('dup', get('pc-test'))).toBe(near.entity);
        });

        it('resolves selector and id references document-wide from inside a scope', async () => {
            const { get } = await bootApp(`
                <pc-entity name="first">
                    <pc-entity id="first-dup" name="dup"></pc-entity>
                </pc-entity>
                <pc-entity name="second">
                    <pc-entity name="dup"></pc-entity>
                    <pc-test></pc-test>
                </pc-entity>
            `);
            const far = get<EntityElement>('#first-dup');

            // No entity is *named* the reference text, so the lexical phase misses and the
            // document resolver interprets the reference - selectors and ids keep their
            // document-wide meaning even from inside a scope.
            expect(getEntity('pc-entity[name="dup"]', get('pc-test'))).toBe(far.entity);
            expect(getEntity('#first-dup', get('pc-test'))).toBe(far.entity);
        });

        it('does not skip a nearer name match that backs no entity yet', async () => {
            const { get } = await bootApp(`
                <pc-entity name="dup"></pc-entity>
                <pc-entity name="outer">
                    <pc-entity id="near" name="dup"></pc-entity>
                    <pc-test></pc-test>
                </pc-entity>
            `);

            // The nearest name match is what the author meant: with its entity destroyed it
            // reports the timing cause rather than silently deferring to the farther live one.
            get<EntityElement>('#near').entity!.destroy();

            expect(resolveEntity('dup', get('pc-test'), 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target 'dup' - <pc-entity> matches it but is not backing " +
                    'an entity yet - reference ignored. Assign target again once the entity exists.'
            );
        });

        it('falls back to the document when nothing in scope matches', async () => {
            const { app, get } = await bootApp(`
                <pc-entity id="cube-id" name="Cube"></pc-entity>
                <pc-entity name="host"><pc-test></pc-test></pc-entity>
            `);
            const cube = app.root.findByName('Cube');

            expect(getEntity('#cube-id', get('pc-test')), 'a connected caller').toBe(cube);
            expect(getEntity('cube-id', document.createElement('div')), 'a disconnected one').toBe(cube);
        });

        it('warns without throwing for a reference no CSS string can express, from inside a scope', async () => {
            const { get } = await bootApp('<pc-entity name="host"><pc-test></pc-test></pc-entity>');

            // Quote/backslash escaping cannot express a newline, so every scope's lookup must
            // absorb the invalid selector rather than throw.
            expect(resolveEntity('bad\nname', get('pc-test'), 'target', 'reference ignored')).toBeNull();
            warnings.expect("pc-test could not resolve target 'bad\nname' - nothing in the document matches it");
        });

        it('scopes a name to a nearer pc-node ahead of a farther pc-entity', async () => {
            const { get } = await bootApp(`
                <pc-asset id="stage" type="container" src="${STAGE_SRC}"></pc-asset>
                <pc-entity name="Podium"></pc-entity>
                <pc-model asset="stage">
                    <pc-node name="Podium"></pc-node>
                    <pc-test></pc-test>
                </pc-model>
            `);

            // Every entity-fronting kind participates in the lexical phase: from inside the
            // model, its own node wins over the document-first pc-entity.
            expect(getEntity('Podium', get('pc-test'))).toBe(get<NodeElement>('pc-node').entity);
            expect(getEntity('Podium')).toBe(get<EntityElement>('pc-entity[name="Podium"]').entity);
        });

        it('resolves a name the scoped selector must escape', async () => {
            const { get } = await bootApp(`
                <pc-entity name="host">
                    <pc-entity name="pc-entity["></pc-entity>
                    <pc-test></pc-test>
                </pc-entity>
            `);

            expect(getEntity('pc-entity[', get('pc-test'))).toBe(
                get<EntityElement>('pc-entity[name="pc-entity["]').entity
            );
        });
    });
});
