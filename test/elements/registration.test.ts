import { describe, expect, it } from 'vitest';

import { AsyncElement, ComponentElement } from '../../src/index';
import { COMPONENT_TAGS, READY_TAGS, TAGS } from '../helpers/tags';

/**
 * The runtime twin of validate.mjs's manifest checks. It catches a case the manifest cannot see: an
 * element defined under src/ but omitted from src/index.ts's dependency-ordered import list. The
 * analyzer reads source files, so such an element still appears in the manifest while never being
 * registered in a browser.
 */
describe('customElements registration', () => {
    it('defines every tag in the golden list', () => {
        const missing = TAGS.filter(tag => !customElements.get(tag));
        expect(missing).toEqual([]);
    });

    it('defines nothing outside the golden list', () => {
        // The library only ever defines pc-* tags, so this is the observable surface to police.
        const defined = TAGS.filter(tag => customElements.get(tag));
        expect(defined.sort()).toEqual([...TAGS].sort());
    });

    it.for(READY_TAGS)('%s extends AsyncElement, so it has a ready promise', (tag) => {
        expect(document.createElement(tag)).toBeInstanceOf(AsyncElement);
    });

    it.for(['pc-material', 'pc-module'])('%s extends HTMLElement directly, so it never becomes ready', (tag) => {
        const element = document.createElement(tag);
        expect(element).toBeInstanceOf(HTMLElement);
        expect(element).not.toBeInstanceOf(AsyncElement);
    });

    it.for(COMPONENT_TAGS)('%s extends ComponentElement', (tag) => {
        expect(document.createElement(tag)).toBeInstanceOf(ComponentElement);
    });

    it.for(COMPONENT_TAGS)('%s inherits the enabled attribute from ComponentElement', (tag) => {
        const observed = (customElements.get(tag) as unknown as { observedAttributes?: string[] })?.observedAttributes;
        expect(observed).toContain('enabled');
    });
});
