/**
 * Makes the emitted declarations resolvable under Node16 module resolution.
 *
 * The TypeScript emit preserves the source's extensionless relative imports, which Node16
 * resolution rejects - so every relative specifier in the .d.ts tree gains a .js extension.
 *
 * The package is an ES module only, so there is one tree of declarations. It used to ship a
 * CommonJS build with a .d.cts copy of each file; that build could not work under Node, where the
 * engine's own CommonJS entry exports nothing, and Node 22.12 and later load this package through
 * require() as the ES module it is.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Matches the specifier of a relative import/export in TS-emitted declaration files, which only
// ever reference other modules via `from '...'`
const RELATIVE_SPECIFIER = /(from\s+)(['"])(\.\.?\/[^'"]+)\2/g;

const withExtension = (source, extension) =>
    source.replace(RELATIVE_SPECIFIER, (match, lead, quote, specifier) =>
        (/\.[cm]?js$/.test(specifier) ? match : `${lead}${quote}${specifier}${extension}${quote}`)
    );

const fixTree = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            fixTree(path);
        } else if (entry.name.endsWith('.d.ts')) {
            writeFileSync(path, withExtension(readFileSync(path, 'utf8'), '.js'));
        }
    }
};

fixTree('dist');
