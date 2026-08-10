/**
 * Makes the emitted declarations resolvable under Node16 module resolution, in both flavors.
 *
 * The TypeScript emit preserves the source's extensionless relative imports, which Node16
 * resolution rejects - so every relative specifier in the .d.ts tree gains a .js extension.
 * The package also ships a CJS build, and a lone .d.ts inside a `"type": "module"` package is
 * interpreted as an ES module declaration - so resolving types through the `require` condition
 * would claim the CJS build is ESM. Each .d.ts is therefore also copied to a .d.cts sibling
 * whose relative specifiers use .cjs, keeping resolution inside the CJS-flavored tree.
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
            const source = readFileSync(path, 'utf8');
            writeFileSync(path, withExtension(source, '.js'));
            writeFileSync(path.replace(/\.d\.ts$/, '.d.cts'), withExtension(source, '.cjs'));
        }
    }
};

fixTree('dist');
