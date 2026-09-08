import type { ScrollbarComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ScrollbarComponentElement } from '../../../src/components/scrollbar-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Only the [handle] entity reference is covered here. The resolution and reporting contract is
 * shared with every reference-resolving element and pinned once in entity-reference.test.ts; these
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
            const { get } = await bootApp(
                '<pc-entity name="track"><pc-scrollbar handle="#nope"></pc-scrollbar></pc-entity>'
            );
            const scrollbar = get<ScrollbarComponentElement>('pc-scrollbar');

            warnings.expect(
                "pc-scrollbar could not resolve handle '#nope' - nothing in the document matches it - reference ignored"
            );
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

    describe('[handle-size]', () => {
        it("defaults to the engine's zero-length handle", async () => {
            const { app, get } = await bootApp('<pc-entity name="sb"><pc-scrollbar></pc-scrollbar></pc-entity>');
            const component = get<ScrollbarComponentElement>('pc-scrollbar').component!;

            // The engine's default is degenerate - no handle until the page sizes one - but it is
            // the engine's; it used to be 0.5 here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('scrollbar') as ScrollbarComponent;

            expect(component.handleSize).toBe(0);
            expect(component.handleSize).toBe(engine.handleSize);
        });

        it('writes through and restores the default on removal', async () => {
            const { get } = await bootApp('<pc-entity name="sb"><pc-scrollbar></pc-scrollbar></pc-entity>');
            const scrollbar = get<ScrollbarComponentElement>('pc-scrollbar');

            scrollbar.setAttribute('handle-size', '0.5');
            expect(scrollbar.component!.handleSize).toBe(0.5);

            scrollbar.removeAttribute('handle-size');
            expect(scrollbar.component!.handleSize).toBe(0);
        });
    });
});
