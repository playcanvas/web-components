import type { ElementComponent, ScrollbarComponent } from 'playcanvas';
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

    describe('dragging', () => {
        it('moves the handle with the pointer on a screen-space screen', async () => {
            const { app } = await bootApp(`
                <pc-entity name="screen">
                    <pc-screen screen-space></pc-screen>
                    <pc-entity name="track">
                        <pc-element width="20" height="400"></pc-element>
                        <pc-scrollbar orientation="vertical" handle-size="0.5" handle="handle"></pc-scrollbar>
                        <pc-entity name="handle">
                            <pc-element anchor="0 1 1 1" pivot="1 1" use-input></pc-element>
                        </pc-entity>
                    </pc-entity>
                </pc-entity>
            `);
            const scrollbar = (app.root.findByName('track') as Entity).scrollbar!;
            const handle = (app.root.findByName('handle') as Entity).element as ElementComponent;

            // Fired on the handle's element as the element input would, in CSS pixels. The engine
            // maps them onto the screen by the graphics device's maxPixelRatio, so this relies on
            // pc-app handing the device the ratio in effect: its uncapped default of Infinity would
            // turn every position into NaN, and the drag would never start.
            handle.fire('mousedown', { x: 10, y: 100 });
            handle.fire('mousemove', { x: 10, y: 200 });

            // 100px down the 200px the half-size handle can travel on a 1x display
            expect(scrollbar.value).toBeCloseTo(0.5);
        });
    });
});
