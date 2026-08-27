import { describe, expect, it } from 'vitest';

import { AsyncElement, ComponentElement, EntityBaseElement } from '../../src/index';
import { COMPONENT_TAGS, componentTagId, ENTITY_TAGS, READY_TAGS, TAGS } from '../helpers/tags';

/**
 * The runtime twin of validate.mjs's manifest checks. It catches a case the manifest cannot see: an
 * element defined under src/ but omitted from src/index.ts's dependency-ordered import list. The
 * analyzer reads source files, so such an element still appears in the manifest while never being
 * registered in a browser.
 */
describe('customElements registration', () => {
    it('defines every tag in the golden list', () => {
        const missing = TAGS.filter((tag) => !customElements.get(tag));
        expect(missing).toEqual([]);
    });

    it('defines nothing outside the golden list', () => {
        // The library only ever defines pc-* tags, so this is the observable surface to police.
        const defined = TAGS.filter((tag) => customElements.get(tag));
        expect(defined.sort()).toEqual([...TAGS].sort());
    });

    it.for(READY_TAGS)('%s extends AsyncElement, so it has a ready promise', (tag) => {
        expect(document.createElement(tag)).toBeInstanceOf(AsyncElement);
    });

    it('pc-material extends HTMLElement directly, so it never becomes ready', () => {
        const element = document.createElement('pc-material');
        expect(element).toBeInstanceOf(HTMLElement);
        expect(element).not.toBeInstanceOf(AsyncElement);
    });

    it.for(COMPONENT_TAGS)('%s extends ComponentElement', (tag) => {
        expect(document.createElement(tag)).toBeInstanceOf(ComponentElement);
    });

    it.for(ENTITY_TAGS)('%s extends EntityBaseElement, so it fronts an entity', (tag) => {
        expect(document.createElement(tag)).toBeInstanceOf(EntityBaseElement);
    });

    it.for(ENTITY_TAGS)('%s observes the inline event handler attributes', (tag) => {
        const observed = (customElements.get(tag) as unknown as { observedAttributes?: string[] })?.observedAttributes;
        expect(observed).toContain('onpointerdown');
        expect(observed).toContain('onpointerenter');
        expect(observed).toContain('onclick');
    });

    it.for(COMPONENT_TAGS)('%s inherits the enabled attribute from ComponentElement', (tag) => {
        const observed = (customElements.get(tag) as unknown as { observedAttributes?: string[] })?.observedAttributes;
        expect(observed).toContain('enabled');
    });

    // The naming rule stated in utils/cem/tags.mjs, made load-bearing. A component tag has to
    // spell the engine component id it adds, so that an author who knows either spelling can
    // derive the other without a lookup table. `_componentName` is TypeScript-private, not
    // runtime-private, and is what the element actually passes to `entity.addComponent`.
    it.for(COMPONENT_TAGS)('%s states its engine component id', (tag) => {
        const element = document.createElement(tag) as unknown as { _componentName: string };
        expect(element._componentName).toBe(componentTagId(tag));
    });
});
