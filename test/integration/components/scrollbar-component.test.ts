import { describe, expect, it } from 'vitest';

import type { ScrollbarComponentElement } from '../../../src/components/scrollbar-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Only the [handle] entity reference is covered here. The resolution and reporting contract is
 * shared with every reference-resolving element and pinned once in get-entity.test.ts; these
 * tests pin this element's wiring.
 */
describe('<pc-scrollbar>', () => {
    const { warnings } = useGuard();

    describe('[handle]', () => {
        it('resolves the handle reference', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="track">
                    <pc-scrollbar handle="#handle-id"></pc-scrollbar>
                    <pc-entity id="handle-id" name="handle"></pc-entity>
                </pc-entity>
            `);
            const scrollbar = get<ScrollbarComponentElement>('pc-scrollbar');

            expect(scrollbar.component!.handleEntity).toBe(app.root.findByName('handle'));
        });

        it('warns when the reference does not resolve, leaving the handle unset', async () => {
            const { get } = await bootApp('<pc-entity name="track"><pc-scrollbar handle="#nope"></pc-scrollbar></pc-entity>');
            const scrollbar = get<ScrollbarComponentElement>('pc-scrollbar');

            warnings.expect("pc-scrollbar could not resolve handle '#nope' - nothing in the document matches it - reference ignored");
            expect(scrollbar.component!.handleEntity).toBeNull();
        });

        it('keeps the current handle when a reassigned reference does not resolve', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="track">
                    <pc-scrollbar handle="#handle-id"></pc-scrollbar>
                    <pc-entity id="handle-id" name="handle"></pc-entity>
                </pc-entity>
            `);
            const scrollbar = get<ScrollbarComponentElement>('pc-scrollbar');

            scrollbar.setAttribute('handle', '#still-nope');

            warnings.expect("pc-scrollbar could not resolve handle '#still-nope'");
            expect(scrollbar.component!.handleEntity).toBe(app.root.findByName('handle'));
        });
    });
});
