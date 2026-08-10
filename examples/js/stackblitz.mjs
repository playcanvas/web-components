const EXAMPLES_BASE = 'https://playcanvas.github.io/web-components/examples/';

// Matches the package name in a /node_modules/ URL, e.g. 'playcanvas' or '@mediapipe/tasks-vision'
const PACKAGE_REGEX = /\/node_modules\/((?:@[\w.-]+\/)?[\w.-]+)/g;

/**
 * Rewrites an example's HTML so it runs as a standalone npm-based project: the local library
 * build and repo-relative node_modules paths become project-root node_modules paths (installed
 * from npm), while example-relative resources (assets, scripts, styles) load from the deployed
 * examples site.
 * @param {string} html - The example's HTML source.
 * @returns {string} The transformed HTML.
 */
export function transformHtml(html) {
    return html
        .replace(/(\.\.\/)+dist\//g, '/node_modules/@playcanvas/web-components/dist/')
        .replace(/(\.\.\/)+node_modules\//g, '/node_modules/')
        .replace(/(["'(])((?:assets|css|img|js|modules)\/)/g, `$1${EXAMPLES_BASE}$2`);
}

/**
 * Collects the names of all npm packages referenced via /node_modules/ URLs in the given HTML.
 * @param {string} html - The transformed example HTML.
 * @returns {Set<string>} The referenced package names.
 */
export function collectPackages(html) {
    const packages = new Set();
    for (const [, name] of html.matchAll(PACKAGE_REGEX)) {
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
 * Opens the current example as an editable StackBlitz project. The project installs `playcanvas`
 * and `@playcanvas/web-components` (plus any other packages the example imports) from npm and
 * serves the example HTML, while assets continue to load from the deployed examples site.
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

        const transformed = transformHtml(html);
        const slug = window.location.pathname
            .split('/')
            .pop()
            .replace(/\.html$/, '');
        const title = document.title;
        const packageJson = buildPackageJson(rootPkg, collectPackages(transformed), `pwc-example-${slug}`);

        const readme = [
            `# ${title}`,
            '',
            'A [PlayCanvas Web Components](https://www.npmjs.com/package/@playcanvas/web-components)',
            'example - a 3D scene declared entirely in HTML.',
            '',
            'Edit `index.html` and refresh the preview to see your changes.',
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
                    'index.html': transformed,
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
