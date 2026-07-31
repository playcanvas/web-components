import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';

import { attributesFromCallbackPlugin } from './utils/cem/attributes-plugin.mjs';
import { manifestCleanupPlugin } from './utils/cem/cleanup-plugin.mjs';

export default {
    globs: ['src/**/*.ts'],

    // Neither file declares an element, so excluding them keeps the manifest to the public
    // element surface. The base classes in async-element.ts and components/component.ts are
    // deliberately included - the elements that extend them inherit their attributes and events.
    exclude: ['src/colors.ts', 'src/parse.ts'],

    // dist is wiped by `prebuild` and shipped via the `files` and `exports` fields, so the
    // generated files can never go stale and never need committing
    outdir: 'dist',

    plugins: [
        // Derives attribute metadata from each element's attributeChangedCallback
        attributesFromCallbackPlugin(),
        manifestCleanupPlugin(),

        // Editor integrations, generated from the manifest above
        customElementVsCodePlugin({
            outdir: 'dist',
            htmlFileName: 'vscode.html-custom-data.json',
            cssFileName: null
        }),
        customElementJetBrainsPlugin({
            outdir: 'dist',
            webTypesFileName: 'web-types.json',

            // The `web-types` field is declared in package.json by hand, so the plugin must not
            // rewrite the file on every build
            packageJson: false
        })
    ]
};
