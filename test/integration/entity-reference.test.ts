import { describe, expect, it } from 'vitest';

import type { EntityElement } from '../../src/entity';
import { getEntity, resolveEntity } from '../../src/entity-reference';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
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

        it('resolves any selector written behind #, not just a bare id', async () => {
            const { app } = await bootApp('<pc-entity id="wrap"><pc-entity name="inner"></pc-entity></pc-entity>');
            expect(getEntity('#wrap pc-entity')).toBe(app.root.findByName('inner'));
        });

        it('never interprets a bare reference as a selector', async () => {
            await bootApp(markup);
            // Both are valid selectors that would match - a type selector and an attribute
            // selector - but a bare reference is a name and nothing else, so neither can be
            // silently retargeted by elements matching it as a selector.
            expect(getEntity('pc-entity')).toBeNull();
            expect(getEntity('pc-entity[name="Cube"]')).toBeNull();
        });

        it('does not resolve a bare reference that only matches an element id', async () => {
            await bootApp(markup);
            // A bare reference is a name - the element whose id is 'cube-id' is written '#cube-id'
            expect(getEntity('cube-id')).toBeNull();
        });

        it('resolves a name containing a space, which no selector interpretation could', async () => {
            const { app } = await bootApp(markup);
            expect(getEntity('Spaced Name')).toBe(app.root.findByName('Spaced Name'));
        });

        it('resolves a name that is itself a malformed selector', async () => {
            const { app } = await bootApp('<pc-entity name="pc-entity["></pc-entity>');
            // The unclosed attribute selector is escaped safely into the name lookup; the raw
            // reference would make querySelector throw, which the selector fallback absorbs
            // (the warning tests below drive a ref through that catch).
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

        it('resolves a bare reference as a name even when a same-spelled id exists', async () => {
            const { app } = await bootApp(`
                <pc-entity id="target" name="ById"></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            // The two forms never compete: the bare spelling is the name, the '#' spelling the id
            expect(getEntity('target')).toBe(app.root.findByName('target'));
            expect(getEntity('#target')).toBe(app.root.findByName('ById'));
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

        it('suggests the #id form for a bare reference that only matches an element id', async () => {
            await bootApp(markup);
            expect(resolveEntity('cube-id', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target 'cube-id' - nothing in the document matches it - " +
                    "reference ignored. A bare reference is a name - write '#cube-id' to reference " +
                    'the element with that id.'
            );
        });

        it('escapes the suggested #id so it parses as a selector', async () => {
            // getElementById accepts ids no unescaped selector can express - the suggestion must
            // be the form that actually works in one
            await bootApp('<pc-entity id="a:b" name="Colon"></pc-entity>');
            expect(resolveEntity('a:b', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target 'a:b' - nothing in the document matches it - " +
                    "reference ignored. A bare reference is a name - write '#a\\:b' to reference " +
                    'the element with that id.'
            );
        });

        it('keeps the generic advice when the same-spelled id is not entity-fronting', async () => {
            // Suggesting the # form here would only trade this warning for the wrong-target one
            await bootApp('<div id="plain-block"></div>');
            expect(resolveEntity('plain-block', caller(), 'target', 'reference ignored')).toBeNull();
            warnings.expect(
                "pc-test could not resolve target 'plain-block' - nothing in the document matches it - " +
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
                    'reference ignored. Point target at a pc-entity, pc-model or pc-node instead.'
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

        it('resolves a bare reference as a name regardless of a same-spelled document id', async () => {
            const { get } = await bootApp(`<pc-entity id="dup" name="ById"></pc-entity>${DUPLICATES}`);
            const near = get<EntityElement>('pc-entity[name="second"] > pc-entity[name="dup"]');
            const far = get<EntityElement>('pc-entity[name="first"] > pc-entity[name="dup"]');

            // The bare spelling is a name in both phases - the page-level id never competes, so
            // it cannot shadow a prefab's internal wiring (nor divert the unscoped lookup).
            expect(getEntity('dup', get('pc-test'))).toBe(near.entity);
            expect(getEntity('dup')).toBe(far.entity);
        });

        it('resolves a # reference document-wide from inside a scope', async () => {
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

            // The '#' form is document-global by definition - a nearer same-named entity does
            // not enter into it.
            expect(getEntity('#first-dup', get('pc-test'))).toBe(far.entity);
        });

        it('resolves a #id document-wide even when an in-scope entity is named like it', async () => {
            const { get } = await bootApp(`
                <pc-entity id="target" name="ById"></pc-entity>
                <pc-entity name="outer">
                    <pc-entity name="#target"></pc-entity>
                    <pc-test></pc-test>
                </pc-entity>
            `);

            // The '#' form is authoritative: it bypasses the name lookup entirely, so an
            // unusually named entity can never shadow the element with that id.
            expect(getEntity('#target', get('pc-test'))).toBe(get<EntityElement>('#target').entity);
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
            expect(getEntity('Cube', document.createElement('div')), 'a disconnected one').toBe(cube);
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
