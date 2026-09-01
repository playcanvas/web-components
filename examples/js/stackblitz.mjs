const EXAMPLES_BASE = 'https://playcanvas.github.io/web-components/examples/';

// Matches the package name in a /node_modules/ URL, e.g. 'playcanvas' or '@mediapipe/tasks-vision'
const PACKAGE_REGEX = /\/node_modules\/((?:@[\w.-]+\/)?[\w.-]+)/g;

/**
 * Matches a path into one of the five directories holding an example's own resources, wherever it
 * appears: an HTML attribute, a CSS url(), or a JS string - including a template literal like
 * assets/sounds/optic-${name}.mp3, whose interpolation survives the rewrite below because only the
 * leading directory segments are ever resolved.
 *
 * Requiring one of those directory names is also what keeps relative import specifiers out of this
 * pattern: nothing is imported through one of those directories, so a specifier such as
 * ./stackblitz.mjs never matches here. Specifiers resolve against a different base - see baseOf().
 *
 * Being a text scan, this reads comments as readily as code. A quoted path in a comment is
 * therefore rewritten like any other, and one naming a module or stylesheet packages that file -
 * harmless either way, which is why no attempt is made to tell the two apart. Paths in the
 * comments below are deliberately left unquoted so they stay out of it.
 */
const RESOURCE_REGEX = /(["'`(])((?:\.\.\/)*(?:assets|css|img|js|modules)\/[^"'`)\s]*)/g;

/**
 * Matches the specifier of a relative import, re-export or dynamic import (and, incidentally, of a
 * CSS @import, which resolves the same way). Bare specifiers are left to the page's import map.
 */
const IMPORT_REGEX = /\b(?:from|import)\s*\(?\s*(["'])(\.{1,2}\/[^"']*)\1/g;

/** Matches the tag that loads the examples site's shared chrome - see stripSiteChrome(). */
const CHROME_SCRIPT_REGEX = /^[ \t]*<script type="module" src="js\/example\.mjs"><\/script>\r?\n?/gm;

/**
 * The extensions of the files packaged into the project rather than loaded from the deployed site:
 * the source a reader would want to read and edit. Binary resources - models, textures, sounds, and
 * the wasm modules under modules/ - stay on the site.
 */
const SOURCE_EXTENSIONS = ['.css', '.mjs'];

/** The directory part of an example-relative path: assets/scripts/rotate.mjs -> assets/scripts. */
function dirOf(path) {
    const index = path.lastIndexOf('/');
    return index === -1 ? '' : path.slice(0, index);
}

/**
 * The directory a file's own resource paths resolve against. For the page, and for the strings a
 * module hands to fetch() or an asset loader, that is the document - so the examples root. For a
 * CSS url() or @import it is the stylesheet itself.
 *
 * Import specifiers are the third case, resolving against the importing module, which is why they
 * are matched separately (IMPORT_REGEX) and never rewritten: their targets are packaged at their
 * original paths, so the specifier that reaches them already resolves.
 * @param {string} path - The file's example-relative path.
 * @returns {string} The directory to resolve the file's resource paths against.
 */
function baseOf(path) {
    return path.endsWith('.css') ? dirOf(path) : '';
}

/**
 * Resolves a relative path against a directory, both example-relative.
 *
 * Textual rather than `new URL()`: some of these paths are template literals, and URL would
 * percent-encode the braces of an interpolation and corrupt it.
 * @param {string} ref - The path as written.
 * @param {string} dir - The directory to resolve it against, '' for the examples root.
 * @returns {string | null} The example-relative path, or null if it climbs above the examples root.
 */
function resolvePath(ref, dir) {
    const segments = dir === '' ? [] : dir.split('/');
    for (const segment of ref.split('/')) {
        if (segment === '..') {
            if (segments.length === 0) {
                return null;
            }
            segments.pop();
        } else if (segment !== '.' && segment !== '') {
            segments.push(segment);
        }
    }
    return segments.join('/');
}

/**
 * Drops the tag that loads js/example.mjs, the chrome the examples site wraps around every page:
 * fullscreen, AR/VR entry, the button that produced this project, and a link to the page's source
 * on GitHub. None of it is part of the example, and in a project none of it is much use either -
 * the StackBlitz and view-source buttons act on the site, and the XR ones only appear when
 * app.xr.isAvailable() says so, which a preview iframe never does.
 *
 * Applied before the source walk, so the chrome module and everything it imports - this file
 * included - stay out of the project rather than being packaged and then left unused.
 * @param {string} html - The example's HTML source.
 * @returns {string} The HTML without the chrome tag.
 */
export function stripSiteChrome(html) {
    return html.replace(CHROME_SCRIPT_REGEX, '');
}

/**
 * Rewrites one of an example's source files so it runs as part of a standalone npm-based project:
 * the local library build and repo-relative node_modules paths become project-root node_modules
 * paths (installed from npm), while resources the project does not carry load from the deployed
 * examples site.
 * @param {string} source - The file's source text.
 * @param {string} path - The file's example-relative path, e.g. index.html or css/example.css.
 * @param {Set<string>} [packaged] - Example-relative paths of the files packaged alongside this one.
 * References to those are left as written, so they resolve inside the project.
 * @returns {string} The transformed source.
 */
export function transformSource(source, path, packaged = new Set()) {
    const base = baseOf(path);
    return source
        .replace(/(\.\.\/)+dist\//g, '/node_modules/@playcanvas/web-components/dist/')
        .replace(/(\.\.\/)+node_modules\//g, '/node_modules/')
        .replace(RESOURCE_REGEX, (match, quote, ref) => {
            const resolved = resolvePath(ref, base);
            // A path that leaves examples/ is left alone: the project has a root of its own, and
            // the one such path - stackblitz.mjs reading ../package.json - is better served by it
            if (resolved === null || packaged.has(resolved)) {
                return match;
            }
            return `${quote}${EXAMPLES_BASE}${resolved}`;
        });
}

/**
 * The example-relative paths of the local source files one file references. Every relative import
 * specifier counts, whatever its extension - a module the project does not carry cannot be resolved
 * any other way - while a resource path only counts if it is source rather than a binary asset.
 * @param {string} source - The file's source text.
 * @param {string} path - The file's own example-relative path.
 * @returns {string[]} The referenced paths, which may contain duplicates.
 */
function referencesIn(source, path) {
    const paths = [];

    for (const [, , ref] of source.matchAll(IMPORT_REGEX)) {
        const resolved = resolvePath(ref, dirOf(path));
        if (resolved !== null) {
            paths.push(resolved);
        }
    }

    for (const [, , ref] of source.matchAll(RESOURCE_REGEX)) {
        const resolved = resolvePath(ref, baseOf(path));
        if (resolved !== null && SOURCE_EXTENSIONS.some((ext) => resolved.endsWith(ext))) {
            paths.push(resolved);
        }
    }

    return paths;
}

/**
 * Walks an example's local source graph from its HTML and reads every file in it - the modules and
 * stylesheets the page loads, then whatever those reference in turn. The graph really is recursive:
 * the AR examples declare a script that imports assets/scripts/face-tracking.mjs, which the page
 * itself never names.
 * @param {string} html - The example's HTML source, chrome stripped and otherwise untransformed.
 * @param {(path: string) => Promise<string | null>} read - Reads one example-relative path,
 * resolving to null if it cannot be read.
 * @returns {Promise<Record<string, string>>} The sources, keyed by example-relative path.
 */
export async function collectSources(html, read) {
    /** @type {Record<string, string>} */
    const sources = {};
    const seen = new Set();
    let pending = referencesIn(html, 'index.html');

    while (pending.length > 0) {
        // Deduplicated within the batch as well as against earlier ones: three of the AR scripts
        // reach face-tracking.mjs, and two of them are loaded by the same page
        const batch = [...new Set(pending)].filter((path) => !seen.has(path));
        batch.forEach((path) => seen.add(path));

        const results = await Promise.all(batch.map(async (path) => [path, await read(path)]));

        pending = [];
        for (const [path, source] of results) {
            // A file that cannot be read is simply not packaged, and transformSource then leaves
            // every reference to it pointing at the deployed site
            if (source === null) {
                continue;
            }
            sources[path] = source;
            pending.push(...referencesIn(source, path));
        }
    }

    return sources;
}

/**
 * Collects the names of all npm packages referenced via /node_modules/ URLs in the given source.
 * @param {string} source - A transformed file from the generated project.
 * @returns {Set<string>} The referenced package names.
 */
export function collectPackages(source) {
    const packages = new Set();
    for (const [, name] of source.matchAll(PACKAGE_REGEX)) {
        packages.add(name);
    }
    return packages;
}

/**
 * Builds the package.json for the generated project. Referenced packages are pinned to the
 * versions used by this repo (read from the repo's own package.json) so the project matches
 * the deployed examples.
 * @param {object} rootPkg - The repo's package.json (may be empty if it could not be fetched).
 * @param {Set<string>} packages - Package names referenced by the example.
 * @param {string} name - The npm-style name for the generated project.
 * @returns {object} The package.json contents for the StackBlitz project.
 */
function buildPackageJson(rootPkg, packages, name) {
    // devDependencies take precedence over peerDependencies: the repo pins the exact package
    // versions it is developed (and deployed) against in devDependencies, while
    // peerDependencies express a looser supported range
    const versions = {
        ...rootPkg.peerDependencies,
        ...rootPkg.dependencies,
        ...rootPkg.devDependencies
    };

    const dependencies = {
        '@playcanvas/web-components': rootPkg.version ? `^${rootPkg.version}` : 'latest'
    };
    for (const pkg of [...packages].sort()) {
        if (pkg !== '@playcanvas/web-components') {
            dependencies[pkg] = versions[pkg] ?? 'latest';
        }
    }

    return {
        name,
        private: true,
        scripts: {
            start: 'serve .'
        },
        dependencies,
        devDependencies: {
            serve: versions.serve ?? 'latest'
        },
        stackblitz: {
            startCommand: 'npm start'
        }
    };
}

/**
 * Submits a project to StackBlitz via its POST API, opening it in the given window.
 * @param {object} project - The project definition.
 * @param {string} project.title - The project title.
 * @param {string} project.description - The project description.
 * @param {Record<string, string>} project.files - Map of file paths to file contents.
 * @param {string} target - The name of the window to open the project in.
 */
function postToStackBlitz({ title, description, files }, target) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://stackblitz.com/run?file=index.html';
    form.target = target;
    form.style.display = 'none';

    const addField = (fieldName, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = fieldName;
        input.value = value;
        form.appendChild(input);
    };

    addField('project[title]', title);
    addField('project[description]', description);
    addField('project[template]', 'node');
    for (const [path, contents] of Object.entries(files)) {
        addField(`project[files][${path}]`, contents);
    }

    document.body.appendChild(form);
    form.submit();
    form.remove();
}

/**
 * Opens the current example as an editable StackBlitz project. The project carries the example's
 * own source - its HTML, stylesheet and modules, but not the site's shared chrome - and installs
 * `playcanvas` and `@playcanvas/web-components` (plus any other packages the example imports) from
 * npm, while binary assets continue to load from the deployed examples site.
 */
export async function openInStackBlitz() {
    // Open the tab synchronously so the browser attributes it to the user's click; the form
    // submission below then navigates it once the project has been assembled
    const target = `stackblitz-${Date.now()}`;
    const projectWindow = window.open('about:blank', target);

    try {
        const [html, rootPkg] = await Promise.all([
            fetch(window.location.href).then((r) => r.text()),
            fetch('../package.json').then((r) => (r.ok ? r.json() : {}))
        ]);

        const page = stripSiteChrome(html);

        // Example pages sit at the root of examples/, so an example-relative path is also relative
        // to this page
        const sources = await collectSources(page, (path) =>
            fetch(path)
                .then((r) => (r.ok ? r.text() : null))
                .catch(() => null)
        );

        const packaged = new Set(Object.keys(sources));
        const files = { 'index.html': transformSource(page, 'index.html', packaged) };
        for (const [path, source] of Object.entries(sources)) {
            files[path] = transformSource(source, path, packaged);
        }

        const slug = window.location.pathname
            .split('/')
            .pop()
            .replace(/\.html$/, '');
        const title = document.title;
        // Read across every file, not just the page: a packaged module can be the only thing that
        // names a package, as the mediapipe examples do when they load their wasm out of node_modules
        const packages = new Set(Object.values(files).flatMap((contents) => [...collectPackages(contents)]));
        const packageJson = buildPackageJson(rootPkg, packages, `pwc-example-${slug}`);

        const readme = [
            `# ${title}`,
            '',
            'A [PlayCanvas Web Components](https://www.npmjs.com/package/@playcanvas/web-components)',
            'example - a 3D scene declared entirely in HTML.',
            '',
            'Everything the example implements is here to edit: `index.html`, its stylesheet, and the',
            'modules it loads. Refresh the preview to see your changes. Models, textures, sounds and',
            'the other binary assets load from the PlayCanvas examples site.',
            '',
            '- [User Manual](https://developer.playcanvas.com/user-manual/web-components/)',
            '- [API Reference](https://api.playcanvas.com/web-components)',
            '- [GitHub](https://github.com/playcanvas/web-components)',
            ''
        ].join('\n');

        postToStackBlitz(
            {
                title,
                description: 'A PlayCanvas Web Components example - a 3D scene declared entirely in HTML',
                files: {
                    ...files,
                    'package.json': JSON.stringify(packageJson, null, 4),
                    'README.md': readme
                }
            },
            target
        );
    } catch (error) {
        projectWindow?.close();
        console.error('Failed to open example on StackBlitz:', error);
    }
}
