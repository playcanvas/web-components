import type { ScrollViewComponent } from 'playcanvas';
import { Entity, SCROLLBAR_VISIBILITY_SHOW_ALWAYS, SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ScrollViewComponentElement } from '../../../src/components/scroll-view-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Only the entity references are covered here. The resolution and reporting contract is shared
 * with every reference-resolving element and pinned once in entity-reference.test.ts; these tests pin
 * this element's wiring - all four attributes resolve, and each reports under its own name.
 */
describe('<pc-scroll-view>', () => {
    const { warnings } = useGuard();

    it('resolves all four entity references', async () => {
        const { app, get } = await bootApp(`
            <pc-entity name="sv">
                <pc-scroll-view viewport="#viewport-id" content="#content-id"
                    horizontal-scrollbar="#h-scrollbar-id" vertical-scrollbar="#v-scrollbar-id"></pc-scroll-view>
                <pc-entity id="viewport-id" name="viewport">
                    <pc-entity id="content-id" name="content"></pc-entity>
                </pc-entity>
                <pc-entity id="h-scrollbar-id" name="h-scrollbar"></pc-entity>
                <pc-entity id="v-scrollbar-id" name="v-scrollbar"></pc-entity>
            </pc-entity>
        `);
        const scrollView = get<ScrollViewComponentElement>('pc-scroll-view');

        expect(scrollView.component!.viewportEntity).toBe(app.root.findByName('viewport'));
        expect(scrollView.component!.contentEntity).toBe(app.root.findByName('content'));
        expect(scrollView.component!.horizontalScrollbarEntity).toBe(app.root.findByName('h-scrollbar'));
        expect(scrollView.component!.verticalScrollbarEntity).toBe(app.root.findByName('v-scrollbar'));
    });

    it('warns once per unresolved reference, naming each attribute', async () => {
        await bootApp(`
            <pc-entity name="sv">
                <pc-scroll-view viewport="#v-nope" content="#c-nope"
                    horizontal-scrollbar="#h-nope" vertical-scrollbar="#vs-nope"></pc-scroll-view>
            </pc-entity>
        `);

        warnings.expect("pc-scroll-view could not resolve viewport '#v-nope'");
        warnings.expect("pc-scroll-view could not resolve content '#c-nope'");
        warnings.expect("pc-scroll-view could not resolve horizontal-scrollbar '#h-nope'");
        warnings.expect("pc-scroll-view could not resolve vertical-scrollbar '#vs-nope'");
    });

    it('stays silent when no references are supplied', async () => {
        const { get } = await bootApp('<pc-entity name="sv"><pc-scroll-view></pc-scroll-view></pc-entity>');
        const scrollView = get<ScrollViewComponentElement>('pc-scroll-view');

        // Unset references are the transient authoring state, not a mistake: the guard fails this
        // test if anything warns
        expect(scrollView.component!.viewportEntity).toBeNull();
        expect(scrollView.component!.contentEntity).toBeNull();
    });

    describe('scrollbar visibility', () => {
        const attributes = ['horizontal-scrollbar-visibility', 'vertical-scrollbar-visibility'] as const;
        const properties = ['horizontalScrollbarVisibility', 'verticalScrollbarVisibility'] as const;

        it("defaults both to the engine's, showing the scrollbars always", async () => {
            const { app, get } = await bootApp('<pc-entity name="sv"><pc-scroll-view></pc-scroll-view></pc-entity>');
            const component = get<ScrollViewComponentElement>('pc-scroll-view').component!;

            // The other scroll settings (horizontal, vertical, scroll-mode, bounce-amount,
            // friction) have no engine default at all - a bare engine component leaves them
            // undefined - so these two are the ones a bare component can be held to.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('scrollview') as ScrollViewComponent;

            for (const property of properties) {
                expect.soft(component[property], property).toBe(SCROLLBAR_VISIBILITY_SHOW_ALWAYS);
                expect.soft(component[property], `${property} vs a bare engine scroll view`).toBe(engine[property]);
            }
        });

        it('writes each through and restores the default on removal', async () => {
            const { get } = await bootApp('<pc-entity name="sv"><pc-scroll-view></pc-scroll-view></pc-entity>');
            const scrollView = get<ScrollViewComponentElement>('pc-scroll-view');

            attributes.forEach((attribute, i) => {
                scrollView.setAttribute(attribute, 'when-required');
                expect
                    .soft(scrollView.component![properties[i]], attribute)
                    .toBe(SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED);

                scrollView.removeAttribute(attribute);
                expect
                    .soft(scrollView.component![properties[i]], `${attribute} restored`)
                    .toBe(SCROLLBAR_VISIBILITY_SHOW_ALWAYS);
            });
        });
    });
});
