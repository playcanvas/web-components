import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';

import { attributesFromCallbackPlugin } from './utils/cem/attributes-plugin.mjs';
import { manifestCleanupPlugin } from './utils/cem/cleanup-plugin.mjs';
import { componentTypePlugin } from './utils/cem/component-type-plugin.mjs';
import { elementSummaryPlugin } from './utils/cem/summary-plugin.mjs';

/**
 * The element's page in the User Manual, which both editors surface as a link at the foot of the
 * tooltip - the equivalent of the MDN reference a standard element's tooltip carries. Every tag
 * has a page, and `validate.mjs` checks that every generated link points at one.
 *
 * @param {string} tag - The element's tag name.
 * @returns {{ name: string, url: string }} The reference to publish.
 */
const userManual = tag => ({
    name: 'User Manual',
    url: `https://developer.playcanvas.com/user-manual/web-components/tags/${tag}/`
});

export default {
    globs: ['src/**/*.ts'],

    // None of these files declares an element, so excluding them keeps the manifest to the public
    // element surface. The base classes in async-element.ts and components/component.ts are
    // deliberately included - the elements that extend them inherit their attributes and events.
    exclude: [
        'src/asset-binding.ts',
        'src/colors.ts',
        'src/entity-reference.ts',
        'src/loading-bar.ts',
        'src/parse.ts',
        'src/pointer-controller.ts'
    ],

    // dist is wiped by `prebuild` and shipped via the `files` and `exports` fields, so the
    // generated files can never go stale and never need committing
    outdir: 'dist',

    plugins: [
        // Derives attribute metadata from each element's attributeChangedCallback
        attributesFromCallbackPlugin(),

        // Restores each element's concrete `component` type, which the analyzer's inheritance
        // step overwrites with the generic base's literal `T | null`
        componentTypePlugin(),

        // Publishes each element's `@elementSummary` as its `summary`
        elementSummaryPlugin(),
        manifestCleanupPlugin(),

        // Editor integrations, generated from the manifest above. Both describe an element with
        // its `summary` where it has one, falling back to its `description` - which is why every
        // element carries an `@elementSummary`: the description is the class reference ("The
        // XElement interface provides properties and methods for manipulating ..."), and what an
        // author hovering a tag in HTML needs is a description of the element.
        //
        // Methods are hidden from both for the same reason. They are the element's JavaScript
        // surface, documented in the API reference the tooltip links to, and listing them puts
        // several paragraphs about `ready()` above the attribute an author was reaching for.
        customElementVsCodePlugin({
            outdir: 'dist',
            htmlFileName: 'vscode.html-custom-data.json',
            cssFileName: null,
            hideMethodDocs: true,
            referencesTemplate: (_name, tag) => (tag ? [userManual(tag)] : [])
        }),
        customElementJetBrainsPlugin({
            outdir: 'dist',
            webTypesFileName: 'web-types.json',
            hideMethodDocs: true,

            // The plugin takes a single reference and publishes its URL as the element's `doc-url`
            referenceTemplate: (_name, tag) => userManual(tag),

            // The `web-types` field is declared in package.json by hand, so the plugin must not
            // rewrite the file on every build
            packageJson: false
        })
    ]
};
