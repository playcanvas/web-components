/**
 * Custom Elements Manifest plugin that tidies the assembled manifest.
 *
 * A few things need correcting after analysis:
 *
 * - Only public API ships as a member. The analyzer already omits members tagged `@ignore` or
 *   `@internal`, but it keeps `private` and `protected` ones (merely marking their `privacy`),
 *   and it keeps underscore-prefixed members that carry no marker at all. Manifest consumers
 *   such as editor plugins and Storybook surface every member they are given, so anything that
 *   is not public API is dropped here.
 * - `src/entity.ts` dispatches internal wiring events with computed names (`` `${type}:connect` ``)
 *   that cannot be resolved statically, so whatever the analyzer makes of them is dropped.
 * - `src/app.ts` dispatches the pointer events *onto* `<pc-entity>` elements rather than onto
 *   itself, so they belong to `EntityElement` (where they are declared with `@fires`), not to
 *   `AppElement`.
 * - Attributes and events declared on the `AsyncElement` and `ComponentElement` base classes are
 *   copied onto the elements that inherit them, marked with `inheritedFrom`. Without this, an
 *   element like `<pc-audio-listener>` would appear to have no attributes at all, when in fact it
 *   accepts `enabled`. The copy is skipped for anything already present, so it is a no-op for
 *   whatever the analyzer already flattens on its own.
 * - TSDoc `{@link}` tags are rewritten as markdown. Manifest consumers render descriptions as
 *   markdown and know nothing of `{@link}`, so a doc-site reference would otherwise surface in an
 *   editor tooltip as a bare URL followed by a stray pipe.
 */

/** Events dispatched by `AppElement` but targeted at `EntityElement`. */
const POINTER_EVENTS = new Set(['pointerenter', 'pointerleave', 'pointermove', 'pointerdown', 'pointerup']);

const byName = (a, b) => a.name.localeCompare(b.name);

/** Matches `{@link target}` and `{@link target | label}`. */
const LINK_TAG = /\{@link\s+([^}|]+?)(?:\s*\|\s*([^}]+?))?\s*\}/g;

/**
 * Matches what the analyzer leaves behind once it has stripped a `{@link url | label}` tag of its
 * braces: the bare URL, the pipe, and the backticked label.
 */
const STRIPPED_LINK = /(https?:\/\/[^\s|]+)\s*\|\s*(`[^`]+`)/g;

/**
 * Rewrites TSDoc `{@link}` references as markdown: a URL becomes a link, and a symbol reference
 * becomes inline code, since the manifest has no way to resolve it to a page.
 *
 * @param {string} text - The text to rewrite.
 * @returns {string} The rewritten text.
 */
const rewriteLinks = text => text
    .replace(LINK_TAG, (_, target, label) => {
        const url = target.trim();
        const name = label?.trim();
        if (/^https?:\/\//.test(url)) {
            return name ? `[${name}](${url})` : url;
        }
        return name ?? `\`${url}\``;
    })
    .replace(STRIPPED_LINK, '[$2]($1)');

/**
 * Applies `rewriteLinks` to every description and summary in the manifest, at any depth.
 *
 * @param {unknown} node - The manifest node to walk.
 */
const rewriteDescriptions = (node) => {
    if (Array.isArray(node)) {
        node.forEach(rewriteDescriptions);
        return;
    }
    if (node === null || typeof node !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if ((key === 'description' || key === 'summary') && typeof value === 'string') {
            node[key] = rewriteLinks(value);
        } else {
            rewriteDescriptions(value);
        }
    }
};

/**
 * @param {object} manifest - The assembled manifest.
 * @returns {Map<string, { declaration: object, path: string }>} Class declarations, keyed by name.
 */
const collectDeclarations = (manifest) => {
    const declarations = new Map();
    for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
            if (declaration.kind === 'class') {
                declarations.set(declaration.name, { declaration, path: module.path });
            }
        }
    }
    return declarations;
};

/**
 * Copies attributes and events from a declaration's superclass chain, marking each with the class
 * it came from. Recurses so that a class inherits from its whole ancestry, not just its parent.
 *
 * @param {{ declaration: object, path: string }} entry - The declaration to populate.
 * @param {Map<string, { declaration: object, path: string }>} declarations - All class declarations.
 * @param {Set<string>} resolved - The names already processed.
 */
const inherit = (entry, declarations, resolved) => {
    const { declaration } = entry;
    if (resolved.has(declaration.name)) {
        return;
    }
    resolved.add(declaration.name);

    const parent = declarations.get(declaration.superclass?.name);
    if (!parent) {
        return;
    }
    inherit(parent, declarations, resolved);

    for (const key of ['attributes', 'events']) {
        const inherited = parent.declaration[key] ?? [];
        if (inherited.length === 0) {
            continue;
        }
        declaration[key] ??= [];
        const own = new Set(declaration[key].map(item => item.name));
        for (const item of inherited) {
            if (own.has(item.name)) {
                continue;
            }
            declaration[key].push({
                ...item,
                inheritedFrom: item.inheritedFrom ?? { name: parent.declaration.name, module: parent.path }
            });
        }
    }
};

/**
 * @returns {object} The analyzer plugin.
 */
export const manifestCleanupPlugin = () => ({
    name: 'pwc-manifest-cleanup',

    packageLinkPhase({ customElementsManifest }) {
        const declarations = collectDeclarations(customElementsManifest);

        // Keep only public API in the members list. Privacy modifiers cover `private` and
        // `protected`; the underscore test covers internal members that TypeScript cannot mark,
        // because they are the cross-module contract between elements (`_createEntity` and the
        // like) - those normally carry `@internal`, which the analyzer omits on its own, so the
        // name test is the backstop for one that loses its tag.
        for (const { declaration } of declarations.values()) {
            if (!declaration.members) {
                continue;
            }
            declaration.members = declaration.members.filter(member => member.name &&
                !member.name.startsWith('_') &&
                (member.privacy ?? 'public') === 'public');
            if (declaration.members.length === 0) {
                delete declaration.members;
            }
        }

        for (const { declaration } of declarations.values()) {
            if (!declaration.events) {
                continue;
            }

            // Drop computed event names, and pointer events attributed to the wrong class
            declaration.events = declaration.events.filter(event => event.name &&
                !/[`$:]/.test(event.name) &&
                !(declaration.name === 'AppElement' && POINTER_EVENTS.has(event.name)));

            // An event may be found both by `@fires` and by its `dispatchEvent` call - prefer the
            // documented one
            const unique = new Map();
            for (const event of declaration.events) {
                const existing = unique.get(event.name);
                if (!existing || (!existing.description && event.description)) {
                    unique.set(event.name, event);
                }
            }
            declaration.events = [...unique.values()];

            if (declaration.events.length === 0) {
                delete declaration.events;
            }
        }

        const resolved = new Set();
        for (const entry of declarations.values()) {
            inherit(entry, declarations, resolved);
        }

        // Sort for a stable, readable manifest
        for (const { declaration } of declarations.values()) {
            declaration.attributes?.sort(byName);
            declaration.events?.sort(byName);
            declaration.members?.sort(byName);
        }

        rewriteDescriptions(customElementsManifest);

        // The editor integrations append their own `---` separated sections directly after the
        // text they describe an element with - its summary, or its description where it has no
        // summary. In markdown, a `---` line immediately below a paragraph makes that paragraph a
        // heading, which renders the last paragraph of every element's tooltip at heading size. A
        // trailing blank line keeps the separator a separator.
        for (const { declaration } of declarations.values()) {
            if (!declaration.customElement) {
                continue;
            }
            for (const key of ['description', 'summary']) {
                if (declaration[key]) {
                    declaration[key] = `${declaration[key].trimEnd()}\n`;
                }
            }
        }
    }
});
