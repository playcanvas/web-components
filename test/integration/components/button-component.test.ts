import { describe, expect, it } from 'vitest';

import type { ButtonComponentElement } from '../../../src/components/button-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Only the [image] entity reference is covered here. The resolution and reporting contract is
 * shared with every reference-resolving element and pinned once in get-entity.test.ts; these
 * tests pin this element's wiring - which attribute resolves, the own-entity default, and what
 * an unresolved reference leaves behind.
 */
describe('<pc-button>', () => {
    const { warnings } = useGuard();

    describe('[image]', () => {
        it('defaults the image entity to the button\'s own entity', async () => {
            const { app, get } = await bootApp('<pc-entity name="btn"><pc-button></pc-button></pc-entity>');
            const button = get<ButtonComponentElement>('pc-button');

            expect(button.component!.imageEntity).toBe(app.root.findByName('btn'));
        });

        it('resolves an explicit reference', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="btn"><pc-button image="#target-id"></pc-button></pc-entity>
                <pc-entity id="target-id" name="target"></pc-entity>
            `);
            const button = get<ButtonComponentElement>('pc-button');

            expect(button.component!.imageEntity).toBe(app.root.findByName('target'));
        });

        it('warns when the reference does not resolve, leaving the image entity unset', async () => {
            const { get } = await bootApp('<pc-entity name="btn"><pc-button image="#nope"></pc-button></pc-entity>');
            const button = get<ButtonComponentElement>('pc-button');

            warnings.expect("pc-button could not resolve image '#nope' - nothing in the document matches it - reference ignored");
            expect(button.component!.imageEntity).toBeNull();
        });

        it('keeps the current image entity when a reassigned reference does not resolve', async () => {
            const { app, get } = await bootApp(`
                <pc-entity name="btn"><pc-button image="#target-id"></pc-button></pc-entity>
                <pc-entity id="target-id" name="target"></pc-entity>
            `);
            const button = get<ButtonComponentElement>('pc-button');

            button.setAttribute('image', '#still-nope');

            warnings.expect("pc-button could not resolve image '#still-nope'");
            expect(button.image).toBe('#still-nope');
            expect(button.component!.imageEntity).toBe(app.root.findByName('target'));
        });
    });
});
