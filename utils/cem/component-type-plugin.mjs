/**
 * Custom Elements Manifest plugin that keeps each element's `component` member concretely typed.
 *
 * `ComponentElement` is generic in its engine component type, and each element names its concrete
 * type as the heritage type argument (`extends ComponentElement<LightComponent>`). The analyzer
 * resolves neither: its inheritance step copies the base member onto every element and - by
 * design - overwrites even an overridden member's type with the base's literal text, so every
 * element would publish `component: T | null`. This plugin records each class's type argument
 * during analysis and, once inheritance has been applied, restores the concrete type. The base
 * class's own entry gets its type-parameter default for the same reason.
 */

/**
 * @returns {object} The analyzer plugin.
 */
export const componentTypePlugin = () => {
    /** @type {Map<string, string>} Concrete component type, keyed by element class name. */
    const componentTypes = new Map();

    /** The base class's type-parameter default, for its own manifest entry. */
    let baseDefault = null;

    return {
        name: 'pwc-component-type',

        analyzePhase({ ts, node }) {
            if (!ts.isClassDeclaration(node) || !node.name) {
                return;
            }
            if (node.name.text === 'ComponentElement') {
                baseDefault = node.typeParameters?.[0]?.default?.getText() ?? null;
                return;
            }
            const clause = node.heritageClauses?.find(item => item.token === ts.SyntaxKind.ExtendsKeyword);
            const base = clause?.types.find(item => item.expression.getText() === 'ComponentElement');
            const argument = base?.typeArguments?.[0]?.getText();
            if (argument) {
                componentTypes.set(node.name.text, argument);
            }
        },

        packageLinkPhase({ customElementsManifest }) {
            for (const module of customElementsManifest.modules ?? []) {
                for (const declaration of module.declarations ?? []) {
                    if (declaration.kind !== 'class') {
                        continue;
                    }
                    const concrete = declaration.name === 'ComponentElement' ?
                        baseDefault :
                        componentTypes.get(declaration.name);
                    if (!concrete) {
                        continue;
                    }
                    const member = (declaration.members ?? []).find(item => item.name === 'component');
                    if (member) {
                        member.type = { text: `${concrete} | null` };
                    }
                }
            }
        }
    };
};
