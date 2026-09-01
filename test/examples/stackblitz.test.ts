/// <reference types="vite/client" />

import { describe, expect, it, test } from 'vitest';

import { collectPackages, collectSources, stripSiteChrome, transformSource } from '../../examples/js/stackblitz.mjs';

const DEPLOYED = 'https://playcanvas.github.io/web-components/examples/';

describe('stripSiteChrome', () => {
    it('removes the chrome tag and its line, leaving the rest of the page untouched', () => {
        const html = [
            '        <pc-app></pc-app>',
            '        <script type="module" src="js/example.mjs"></script>',
            '    </body>'
        ].join('\n');

        expect(stripSiteChrome(html)).toBe('        <pc-app></pc-app>\n    </body>');
    });

    /** The deployed site serves LF; the working tree is CRLF. */
    it('removes the line whichever way it is terminated', () => {
        const crlf = '<body>\r\n        <script type="module" src="js/example.mjs"></script>\r\n</body>';

        expect(stripSiteChrome(crlf)).toBe('<body>\r\n</body>');
    });

    /**
     * js/product-viewer.mjs sits in the same directory and is loaded the same way, but it is the
     * example's own page glue - the panel the example is about - not chrome.
     */
    it('leaves an example page module of its own alone', () => {
        const html = '        <script type="module" src="js/product-viewer.mjs"></script>';

        expect(stripSiteChrome(html)).toBe(html);
    });

    it('is a no-op on the two pages that never loaded the chrome', () => {
        const html = '<pc-app><pc-asset src="assets/scripts/solar-system.mjs"></pc-asset></pc-app>';

        expect(stripSiteChrome(html)).toBe(html);
    });
});

describe('transformSource', () => {
    it('points the library build at the installed package', () => {
        const html = '<script type="module" src="../dist/pwc.mjs"></script>';

        expect(transformSource(html, 'index.html')).toBe(
            '<script type="module" src="/node_modules/@playcanvas/web-components/dist/pwc.mjs"></script>'
        );
    });

    it('points repo-relative node_modules at the project root', () => {
        const html = '"playcanvas": "../node_modules/playcanvas/build/playcanvas.mjs"';

        expect(transformSource(html, 'index.html')).toBe(
            '"playcanvas": "/node_modules/playcanvas/build/playcanvas.mjs"'
        );
    });

    it('sends resources the project does not carry to the deployed site', () => {
        const html = [
            '<pc-asset src="assets/models/star.glb"></pc-asset>',
            '<pc-wasm glue="modules/ammo/ammo.wasm.js"></pc-wasm>',
            '<img src="img/playcanvas.png">'
        ].join('\n');

        expect(transformSource(html, 'index.html')).toBe(
            [
                `<pc-asset src="${DEPLOYED}assets/models/star.glb"></pc-asset>`,
                `<pc-wasm glue="${DEPLOYED}modules/ammo/ammo.wasm.js"></pc-wasm>`,
                `<img src="${DEPLOYED}img/playcanvas.png">`
            ].join('\n')
        );
    });

    /**
     * The point of the whole exercise: a packaged file keeps its original path, so the reference to
     * it is the one thing that must NOT be rewritten - otherwise the project carries a copy nothing
     * loads, and still runs the deployed site's code.
     */
    it('leaves references to packaged files as written', () => {
        const html = [
            '<link rel="stylesheet" href="css/example.css">',
            '<pc-asset src="assets/scripts/rotate.mjs"></pc-asset>',
            '<script type="module" src="js/example.mjs"></script>'
        ].join('\n');
        const packaged = new Set(['css/example.css', 'assets/scripts/rotate.mjs', 'js/example.mjs']);

        expect(transformSource(html, 'index.html', packaged)).toBe(html);
    });

    /**
     * A stylesheet resolves url() against itself, not the page, so packaging css/example.css moves
     * what '../img/' means. Only the leading segments are resolved; the rest is copied through.
     */
    it('resolves a stylesheet url() against the stylesheet', () => {
        const css = '.icon-ar { mask-image: url("../img/ar.svg"); }';

        expect(transformSource(css, 'css/example.css')).toBe(`.icon-ar { mask-image: url("${DEPLOYED}img/ar.svg"); }`);
    });

    /**
     * Rewriting by prefix rather than by URL is what keeps this working: `new URL()` would
     * percent-encode the braces and leave the example fetching a literal '$%7Bname%7D'.
     */
    it('keeps a template literal interpolation intact', () => {
        const source = 'await fetch(`assets/sounds/optic-${name}.mp3`);';

        expect(transformSource(source, 'assets/scripts/optic-blast-visuals.mjs')).toBe(
            `await fetch(\`${DEPLOYED}assets/sounds/optic-\${name}.mp3\`);`
        );
    });

    /**
     * stackblitz.mjs reads the repo's package.json from above examples/, and the project has a
     * package.json of its own at exactly that spot - so the honest thing is to leave it be.
     */
    it('leaves a path that climbs above examples/ alone', () => {
        const source = "fetch('../package.json')";

        expect(transformSource(source, 'js/stackblitz.mjs')).toBe(source);
    });

    /**
     * An import specifier resolves against the importing module, and both ends of a relative one
     * are packaged at their original paths - so it already resolves, and rewriting it against the
     * page (the base every other path in a module uses) would break it.
     */
    it('leaves relative import specifiers alone', () => {
        const source = "import { FaceTracking } from './face-tracking.mjs';";

        expect(transformSource(source, 'assets/scripts/optic-blast-tracking.mjs')).toBe(source);
    });
});

describe('collectSources', () => {
    /**
     * A miniature of the real graph: a page that loads a stylesheet, two scripts and the shared
     * example chrome; chrome that imports a second module; two scripts that share a third; and one
     * binary asset that must stay on the deployed site.
     */
    const TREE: Record<string, string> = {
        'index.html': [
            '<link rel="stylesheet" href="css/example.css">',
            '<pc-asset src="assets/models/star.glb"></pc-asset>',
            '<pc-asset src="assets/scripts/a.mjs"></pc-asset>',
            '<pc-asset src="assets/scripts/b.mjs"></pc-asset>',
            '<script type="module" src="js/example.mjs"></script>'
        ].join('\n'),
        'css/example.css': '.icon { mask-image: url("../img/ar.svg"); }',
        'js/example.mjs': "import { openInStackBlitz } from './stackblitz.mjs';",
        'js/stackblitz.mjs': 'export const openInStackBlitz = () => {};',
        'assets/scripts/a.mjs': "import { shared } from './shared.mjs';",
        'assets/scripts/b.mjs': "import { shared } from './shared.mjs';",
        'assets/scripts/shared.mjs': 'export const shared = 1;'
    };

    /** Reads from TREE, recording every path asked for - including ones that are not in it. */
    const reader = (tree: Record<string, string> = TREE) => {
        const reads: string[] = [];
        return {
            reads,
            read: (path: string) => {
                reads.push(path);
                return Promise.resolve(path in tree ? tree[path] : null);
            }
        };
    };

    it('reads the stylesheets and modules the page loads', async () => {
        const { read } = reader();

        const sources = await collectSources(TREE['index.html'], read);

        expect(Object.keys(sources).sort()).toEqual([
            'assets/scripts/a.mjs',
            'assets/scripts/b.mjs',
            'assets/scripts/shared.mjs',
            'css/example.css',
            'js/example.mjs',
            'js/stackblitz.mjs'
        ]);
    });

    /**
     * The graph is recursive in practice, not just in principle: every page loads js/example.mjs,
     * which imports js/stackblitz.mjs. A one-level walk would package the chrome and leave it
     * importing a module that is not there.
     */
    it('follows imports of imports', async () => {
        const { read } = reader();

        const sources = await collectSources(TREE['index.html'], read);

        expect(sources['js/stackblitz.mjs']).toBe(TREE['js/stackblitz.mjs']);
    });

    it('resolves an import specifier against the importing module', async () => {
        const { read } = reader();

        const sources = await collectSources(TREE['index.html'], read);

        expect(sources['assets/scripts/shared.mjs']).toBe(TREE['assets/scripts/shared.mjs']);
    });

    it('reads each file once, however many modules reach it', async () => {
        const { reads, read } = reader();

        await collectSources(TREE['index.html'], read);

        expect(reads).toEqual([...new Set(reads)]);
    });

    it('leaves binary resources to the deployed site', async () => {
        const { reads, read } = reader();

        await collectSources(TREE['index.html'], read);

        expect(reads).not.toContain('assets/models/star.glb');
        expect(reads).not.toContain('img/ar.svg');
    });

    /**
     * A file that cannot be read is left out rather than packaged empty, which is what makes the
     * fallback work: transformSource sends every reference outside the packaged set to the site.
     */
    it('skips a file it cannot read, leaving the reference to the deployed site', async () => {
        const html = '<pc-asset src="assets/scripts/missing.mjs"></pc-asset>';
        const { read } = reader({});

        const sources = await collectSources(html, read);
        const packaged = new Set(Object.keys(sources));

        expect(packaged.size).toBe(0);
        expect(transformSource(html, 'index.html', packaged)).toBe(
            `<pc-asset src="${DEPLOYED}assets/scripts/missing.mjs"></pc-asset>`
        );
    });
});

describe('collectPackages', () => {
    it('reads scoped and unscoped package names off /node_modules/ paths', () => {
        const source = [
            '"@mediapipe/tasks-vision": "/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"',
            '"playcanvas": "/node_modules/playcanvas/build/playcanvas.mjs"',
            '"opentype.js": "/node_modules/opentype.js/dist/opentype.module.js"'
        ].join('\n');

        expect([...collectPackages(source)].sort()).toEqual(['@mediapipe/tasks-vision', 'opentype.js', 'playcanvas']);
    });

    it('ignores bare specifiers, which the import map resolves', () => {
        expect(collectPackages("import { Script } from 'playcanvas';").size).toBe(0);
    });
});

/**
 * The pipeline run against the real examples, with the sources read out of the repo instead of over
 * the network. Everything above tests a rule; this tests that the rules cover the corpus.
 */
describe('examples/*.html', () => {
    /**
     * Every page, and every source file a page could reach, inlined by Vite as text - the same glob
     * the other two Examples-tier suites use, and for the same reason: the repo carries no
     * @types/node.
     */
    const files: Record<string, string> = import.meta.glob('../../examples/**/*.{html,mjs,css}', {
        query: '?raw',
        import: 'default',
        eager: true
    });

    /** The files above, re-keyed on their example-relative paths. */
    const tree = Object.fromEntries(
        Object.entries(files).map(([key, source]) => [key.replace('../../examples/', ''), source])
    );

    const read = (path: string) => Promise.resolve(path in tree ? tree[path] : null);

    /** The one page under examples/ that is not an example: it is the shell that renders the rest. */
    const pages = Object.keys(tree)
        .filter((path) => path.endsWith('.html') && path !== 'index.html')
        .sort();

    /**
     * Builds the project for one page: the same steps openInStackBlitz() takes, minus the
     * package.json, the README and the form post.
     */
    const build = async (page: string) => {
        const html = stripSiteChrome(tree[page]);
        const sources = await collectSources(html, read);
        const packaged = new Set(Object.keys(sources));

        const project: Record<string, string> = {
            'index.html': transformSource(html, 'index.html', packaged)
        };
        for (const [path, source] of Object.entries(sources)) {
            project[path] = transformSource(source, path, packaged);
        }
        return project;
    };

    /**
     * References out of a transformed file: HTML and CSS paths, then import specifiers. Written
     * against the syntax rather than against stackblitz.mjs's own patterns, so that a reference in
     * a form those patterns do not match shows up here as a failure rather than as agreement.
     */
    const referencesIn = (source: string): string[] => [
        ...[...source.matchAll(/(?:src|href)="([^"]+)"/g)].map(([, ref]) => ref),
        ...[...source.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(([, ref]) => ref),
        ...[...source.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(([, ref]) => ref)
    ];

    /**
     * A reference the project has to satisfy itself. Absolute URLs and /node_modules/ paths are
     * served by the site and by npm; anything without a '/' (playcanvas, opentype.js) or starting
     * with '@' is a bare specifier the import map resolves.
     */
    const isLocal = (ref: string): boolean =>
        !/^(?:[a-z]+:)?\/\//.test(ref) &&
        !ref.startsWith('data:') &&
        !ref.startsWith('/node_modules/') &&
        !ref.startsWith('@') &&
        ref.includes('/');

    it('finds every example page', () => {
        expect(pages.length).toBe(42);
    });

    /**
     * The check the packaging exists for. A project whose files reference each other and nothing
     * else local is one a reader can edit; a reference to a path the project does not carry is
     * either a 404 or - worse, because it looks like it works - the deployed site's code running
     * inside an editable project.
     */
    describe('carries every local file its project references', () => {
        test.for(pages)('%s', async (page) => {
            const project = await build(page);
            // build() stops short of the two files openInStackBlitz() writes itself
            const carried = new Set([...Object.keys(project), 'package.json', 'README.md']);

            const missing = Object.entries(project).flatMap(([path, source]) =>
                referencesIn(source)
                    .filter(isLocal)
                    .map((ref) => ({ path, ref, resolved: resolve(ref, path) }))
                    .filter(({ resolved }) => !carried.has(resolved))
            );

            expect(missing).toEqual([]);
        });
    });

    /**
     * Closure alone would also be satisfied by sending every module to the deployed site, so assert
     * the substantive half too: the source a page names is source the project carries.
     */
    describe('packages every module and stylesheet the page loads', () => {
        test.for(pages)('%s', async (page) => {
            const project = await build(page);
            const named = referencesIn(stripSiteChrome(tree[page]))
                .filter((ref) => /\.(?:mjs|css)$/.test(ref))
                // ../dist and ../node_modules are the library and its dependencies, from npm
                .filter((ref) => !ref.startsWith('../'));

            expect(named.length).toBeGreaterThan(0);
            expect(named.filter((ref) => !(ref in project))).toEqual([]);
        });
    });

    /**
     * The chrome is the one thing deliberately left out, and leaving it out has to hold for the
     * whole corpus: neither the module nor js/stackblitz.mjs, which only it imports, may survive
     * into a project - and no page may keep a tag loading either.
     */
    describe('carries none of the examples site chrome', () => {
        test.for(pages)('%s', async (page) => {
            const project = await build(page);

            expect(Object.keys(project)).not.toContain('js/example.mjs');
            expect(Object.keys(project)).not.toContain('js/stackblitz.mjs');
            // The name survives in prose on two pages, whose panels explain why they sit clear of
            // buttons that used to be there - so match the tag, not the string
            expect(project['index.html']).not.toMatch(/<script[^>]*js\/example\.mjs/);
        });
    });
});

/**
 * Resolves a reference the way the file holding it does: an import specifier and a CSS url() go
 * through the file's own directory, and everything else through the page. Kept out of the describe
 * above only because hoisting reads better than a nested const here.
 * @param ref - The reference as written.
 * @param path - The example-relative path of the file holding it.
 * @returns The example-relative path the reference lands on.
 */
function resolve(ref: string, path: string): string {
    const dir = ref.startsWith('.') || path.endsWith('.css') ? path.replace(/[^/]*$/, '') : '';
    return new URL(ref, `https://project.invalid/${dir}`).pathname.slice(1);
}
