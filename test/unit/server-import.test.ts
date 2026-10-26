import { describe, expect, it } from 'vitest';

/**
 * Frameworks that render pages on a server - Next.js, Nuxt, SvelteKit - evaluate a component's
 * imports there too, where there is no DOM. Importing the library must not throw there, and must
 * leave the DOM globals alone: other code on the server tells a browser apart by them.
 */
describe('importing the library without a DOM', () => {
    it('runs where HTMLElement and customElements do not exist', () => {
        // Without this, an environment change could make the import below pass vacuously
        expect(typeof globalThis.HTMLElement).toBe('undefined');
        expect(typeof globalThis.customElements).toBe('undefined');
    });

    it('does not throw, and exports every element class and function', async () => {
        // Threw "HTMLElement is not defined" from the first class that extended it
        const library = await import('../../src/index');

        for (const [name, value] of Object.entries(library)) {
            expect(value, name).toBeTypeOf('function');
        }
        expect(library.AppElement.prototype).toBeInstanceOf(library.AsyncElement);
    });

    it('defines no DOM globals of its own', async () => {
        await import('../../src/index');
        expect(typeof globalThis.HTMLElement).toBe('undefined');
        expect(typeof globalThis.customElements).toBe('undefined');
    });
});
