// @vitest-environment jsdom
/// <reference types="vite/client" />

import { describe, expect, it, test } from 'vitest';

// Registers all 31 custom elements, which is what makes observedAttributes readable below. This is
// the one file in the Examples tier that needs a DOM, hence the environment docblock: the tier is
// otherwise Node, and example-list.test.ts still reads its sources as text.
import '../../src/index';

/**
 * Every page under examples/, inlined by Vite as text - the same glob example-list.test.ts uses, and
 * for the same reason: the repo carries no @types/node.
 */
const pages: Record<string, string> = import.meta.glob('../../examples/*.html', {
    query: '?raw',
    import: 'default',
    eager: true
});

const examplePages = Object.entries(pages)
    .map(([key, html]) => ({ page: key.slice(key.lastIndexOf('/') + 1), html }))
    .sort((a, b) => a.page.localeCompare(b.page));

/** Accepted on any element, from HTML itself or from the library's id-based lookup. */
const GLOBAL_ATTRIBUTES = new Set(['class', 'hidden', 'id', 'slot', 'style', 'title']);

/**
 * Attributes an element reads once in connectedCallback instead of observing, so they never appear
 * in observedAttributes. There is no machine-readable source for these that this tier can use: the
 * generated custom-elements manifest carries them, but it is a build artifact and `npm test` runs
 * without a build.
 *
 * So the list is by hand, and adding a read-once attribute to one of these elements means adding it
 * here too. That friction is deliberate - it is a prompt to ask whether the attribute should be
 * observed instead.
 */
const READ_ONCE_ATTRIBUTES: Record<string, string[]> = {
    'pc-asset': ['atlas', 'data', 'frame-keys', 'pixels-per-unit', 'render-mode', 'src', 'type'],
    'pc-wasm': ['fallback', 'glue', 'name', 'wasm']
};

/**
 * <pc-script-instance> takes one attribute per attribute of the script it names, so its attribute
 * names are open-ended and cannot be checked against the element. They are not unchecked in
 * practice - a name that matches no field on the script logs a warning at runtime.
 */
const OPEN_ENDED_TAGS = new Set(['pc-script-instance']);

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const libraryElements = (doc: Document): Element[] =>
    [...doc.querySelectorAll('*')].filter(el => el.tagName.toLowerCase().startsWith('pc-'));

const allowedAttributes = (tag: string): Set<string> | null => {
    const ctor = customElements.get(tag) as
        | (CustomElementConstructor & { observedAttributes?: string[] })
        | undefined;
    if (!ctor) return null;
    return new Set([
        ...GLOBAL_ATTRIBUTES,
        ...(ctor.observedAttributes ?? []),
        ...(READ_ONCE_ATTRIBUTES[tag] ?? [])
    ]);
};

describe('examples/*.html', () => {
    /**
     * The check that makes the two below meaningful. If a refactor ever moved attribute declarations
     * off observedAttributes, allowedAttributes() would start returning empty sets and every page
     * would pass vacuously - so assert up front that the tags the examples actually use resolve to
     * real, populated sets.
     */
    it('resolves every library tag the examples use to a populated attribute set', () => {
        const tags = [
            ...new Set(
                examplePages.flatMap(({ html }) =>
                    libraryElements(parse(html)).map(el => el.tagName.toLowerCase())
                )
            )
        ].sort();

        expect(tags.length).toBeGreaterThan(20);
        expect(
            tags.filter(tag => !OPEN_ENDED_TAGS.has(tag)).filter(tag => !allowedAttributes(tag)?.size)
        ).toEqual([]);
    });

    /**
     * A start tag that is never closed - `<pc-light a="1"` followed by `</pc-light>` - is not a parse
     * failure. Both Chrome and jsdom recover by folding the `</pc-light` text into attribute names,
     * so the element still gets its intended attributes and the page still works. The only trace is
     * an attribute whose name holds a character no real attribute name can: that is what this looks
     * for, and it is how two such tags in splat-flipbook.html were found.
     */
    describe('is well-formed', () => {
        test.for(examplePages)('$page', ({ html }) => {
            const junk = libraryElements(parse(html)).flatMap(el =>
                [...el.attributes]
                    .map(attr => attr.name)
                    .filter(name => /[<>/]/.test(name))
                    .map(name => `<${el.tagName.toLowerCase()}> has an attribute named "${name}"`)
            );

            expect(junk).toEqual([]);
        });
    });

    /**
     * An attribute the element does not recognise is dropped in silence, so markup that reads
     * correctly can do nothing at all. Three of these had accumulated before this ran: a
     * `tone-mapping` that should have been `tonemap`, and an `intensity` and a `cast-shadows` sitting
     * on <pc-entity> rather than on the component below it.
     */
    describe('uses only attributes its elements accept', () => {
        test.for(examplePages)('$page', ({ html }) => {
            const unknown = libraryElements(parse(html)).flatMap((el) => {
                const tag = el.tagName.toLowerCase();
                if (OPEN_ENDED_TAGS.has(tag)) return [];

                const allowed = allowedAttributes(tag);
                if (!allowed) return [`<${tag}> is not a registered element`];

                return [...el.attributes]
                    .map(attr => attr.name)
                    .filter(
                        name =>
                            !allowed.has(name) &&
                            !name.startsWith('data-') &&
                            !name.startsWith('on') &&
                            !/[<>/]/.test(name) // reported by the well-formedness test instead
                    )
                    .map(name => `<${tag}> does not accept "${name}"`);
            });

            expect(unknown).toEqual([]);
        });
    });
});
