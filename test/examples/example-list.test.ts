/// <reference types="vite/client" />

import { describe, expect, it, test } from 'vitest';

import { examples } from '../../examples/js/example-list.mjs';

/**
 * Every page under examples/, inlined by Vite as text. A glob rather than fs reads because the repo
 * carries no @types/node - and adding it would hand src/ the Node globals too, where a stray
 * `process` in browser code should stay an error.
 *
 * The key set is every page that exists on disk, which is what makes the unlisted-page check below
 * possible at all.
 */
const pages: Record<string, string> = import.meta.glob('../../examples/*.html', {
    query: '?raw',
    import: 'default',
    eager: true
});

/** The one page under examples/ that is not an example: it is the shell that renders the rest. */
const NOT_AN_EXAMPLE = ['index.html'];

const titleOf = (page: string): string | undefined =>
    pages[`../../examples/${page}`]?.match(/<title>([^<]*)<\/title>/)?.[1];

describe('example-list.mjs', () => {
    it('lists every example page, so none is unreachable from the sidebar', () => {
        const onDisk = Object.keys(pages)
            .map((key) => key.slice(key.lastIndexOf('/') + 1))
            .filter((page) => !NOT_AN_EXAMPLE.includes(page))
            .sort();
        const listed = examples.map((example) => example.path).sort();

        expect(listed).toEqual(onDisk);
    });

    it('lists each page once', () => {
        const paths = examples.map((example) => example.path);
        expect(paths).toEqual([...new Set(paths)]);
    });

    it('gives each example a distinct name, since the name is all the sidebar shows', () => {
        const names = examples.map((example) => example.name);
        expect(names).toEqual([...new Set(names)]);
    });

    /**
     * The browser groups by category into a Map keyed on the category string, so a category listed
     * in two separate blocks silently merges into one sidebar section - and the within-category
     * "simplest first" order the catalogue documents stops describing what a reader sees.
     */
    it('keeps each category in one contiguous block', () => {
        const blocks = examples
            .map((example) => example.category)
            .filter((category, index, all) => category !== all[index - 1]);

        expect(blocks).toEqual([...new Set(blocks)]);
    });

    describe('<title>', () => {
        test.for(examples)('$name', ({ name, path: page }) => {
            expect(titleOf(page)).toBe(`PlayCanvas Web Components - ${name}`);
        });
    });
});
