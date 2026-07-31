import { describe, expect, it } from 'vitest';

import { getEntity } from '../../src/utils';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * getEntity is the one export in src/utils.ts that touches the DOM, so it is covered here against a
 * real hierarchy rather than in the pure-unit tier.
 */
describe('getEntity', () => {
    useGuard();

    const markup = `
        <pc-entity id="cube-id" name="Cube"></pc-entity>
        <pc-entity name="Spaced Name"></pc-entity>
    `;

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
});
