/**
 * Custom Elements Manifest plugin that publishes each element's `@elementSummary` as the
 * declaration's `summary`.
 *
 * The editor integrations describe a tag with its `summary` where it has one, falling back to its
 * `description`. The description is the class reference - "The XElement interface provides
 * properties and methods for manipulating `<pc-x>` elements" - which is what the API reference
 * needs and the opposite of what an author hovering a tag in HTML is asking about. So every
 * element carries a second, element-voice paragraph for the editors to use.
 *
 * That paragraph cannot be an `@summary`, even though that is the field it ends up in: TypeDoc
 * prefers `@summary` for the short description beside each entry in its module index, so writing
 * it there would put markup guidance ("Must be a child of a `<pc-entity>`") into the JavaScript
 * API reference. `@elementSummary` is invisible to TypeDoc - it is listed in `notRenderedTags` -
 * and the analyzer has no meaning for it either, hence this plugin. `@element` would have been the
 * natural name, but the analyzer reads that one as an alias of `@tag`, which would set every
 * element's `tagName` to the first word of its prose.
 */

/**
 * The text of a JSDoc tag. TypeScript hands back a plain string unless the comment holds an inline
 * tag, in which case it is the parsed parts - which is how a `{@link}` in the prose would arrive.
 *
 * @param {string | Array<{ text?: string, name?: object }> | undefined} comment - The tag's comment.
 * @returns {string} The comment as text.
 */
const commentText = (comment) => {
    if (typeof comment === 'string') {
        return comment;
    }
    return (comment ?? [])
        .map(part => `${part.name?.getText?.() ?? ''}${part.text ?? ''}`)
        .join('');
};

/**
 * @returns {object} The analyzer plugin.
 */
export const elementSummaryPlugin = () => ({
    name: 'pwc-element-summary',

    analyzePhase({ ts, node, moduleDoc }) {
        if (!ts.isClassDeclaration(node) || !node.name) {
            return;
        }

        const classDoc = moduleDoc.declarations?.find(declaration => declaration.name === node.name.getText());
        if (!classDoc) {
            return;
        }

        for (const jsDoc of node.jsDoc ?? []) {
            for (const tag of jsDoc.tags ?? []) {
                if (tag.tagName?.getText() === 'elementSummary') {
                    classDoc.summary = commentText(tag.comment);
                }
            }
        }
    }
});
