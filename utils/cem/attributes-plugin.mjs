/**
 * Custom Elements Manifest plugin that derives attribute metadata from each element's attribute
 * declarations, from either of two sources:
 *
 * - A static `properties` table (see `src/properties.ts`), where an entry of the form
 *   `shadowType: { parse: enumOf(shadowTypes) }` carries the property (`fieldName`), the
 *   attribute name (kebab-cased, unless overridden by `attribute`), the attribute's type
 *   (implied by the parse helper) and its enum values (the `enumOf` argument). The default is
 *   read from the backing field's initializer (`private _shadowType = 'pcf3-32f'`), which the
 *   table pattern makes the single statement of each default.
 *
 * - Transitionally, an `attributeChangedCallback` whose body is a uniform mapping of the form:
 *
 *   ```js
 *   case 'clear-color':
 *       this.clearColor = parseColor(newValue, new Color(0.75, 0.75, 0.75, 1), name);
 *       break;
 *   ```
 *
 *   which carries the same metadata, with the default restated as the helper's second argument.
 *   This path retires once the last element migrates to a `properties` table.
 *
 * Deriving all of it here keeps the manifest in lockstep with the code, rather than requiring
 * ~200 hand-written `@attribute` tags that would silently drift.
 */

/**
 * The attribute-parsing helpers from `src/parse.ts`, mapped to the manifest type they imply.
 * `format` selects a trailing hint appended to the attribute description, since the accepted
 * string syntax of a color or vector attribute is not obvious from the type alone.
 */
const PARSE_HELPERS = {
    parseBool: { type: 'boolean' },
    parseNumber: { type: 'number' },
    parseEnum: { type: 'enum' },
    parseColor: { type: 'string', format: 'color' },
    parseQuat: { type: 'string', format: 'quat' },
    parseVec2: { type: 'string', format: 'vec2' },
    parseVec3: { type: 'string', format: 'vec3' },
    parseVec4: { type: 'string', format: 'vec4' }
};

const FORMAT_HINTS = {
    color: 'Accepts a CSS color name, a hex color, or 3 or 4 space-separated numbers in the range 0 to 1.',
    quat: 'Accepts 3 space-separated Euler angles in degrees.',
    vec2: 'Accepts 2 space-separated numbers.',
    vec3: 'Accepts 3 space-separated numbers.',
    vec4: 'Accepts 4 space-separated numbers.'
};

/**
 * Engine math constants used as attribute defaults, expressed in the space-separated form a user
 * would type in HTML.
 */
const MATH_CONSTANTS = {
    'Color.BLACK': '0 0 0',
    'Color.WHITE': '1 1 1',
    'Quat.IDENTITY': '0 0 0',
    'Vec2.ZERO': '0 0',
    'Vec2.ONE': '1 1',
    'Vec3.ZERO': '0 0 0',
    'Vec3.ONE': '1 1 1',
    'Vec4.ZERO': '0 0 0 0',
    'Vec4.ONE': '1 1 1 1'
};

/** Values of the zero-argument math constructors, for the same reason. */
const EMPTY_CONSTRUCTORS = {
    Color: '1 1 1 1',
    Quat: '0 0 0',
    Vec2: '0 0',
    Vec3: '0 0 0',
    Vec4: '0 0 0 0'
};

const kebabToCamel = name => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

const camelToKebab = name => name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);

/**
 * Extracts `name === 'some-attribute'` comparisons, so that elements handling a single attribute
 * with an `if` rather than a `switch` (see `src/asset.ts`) are covered too.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').Expression} expression - The condition to match.
 * @returns {string | null} The attribute name, or `null` if the condition is something else.
 */
const matchNameComparison = (ts, expression) => {
    if (!ts.isBinaryExpression(expression)) {
        return null;
    }
    if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
        return null;
    }
    const { left, right } = expression;
    if (left.getText() === 'name' && ts.isStringLiteralLike(right)) {
        return right.text;
    }
    if (right.getText() === 'name' && ts.isStringLiteralLike(left)) {
        return left.text;
    }
    return null;
};

/**
 * Collects the `attributeChangedCallback` branches, keyed by attribute name. Handles both the
 * `switch (name)` form (every element but one) and the `if (name === '...')` form, as well as
 * fall-through case clauses that share a single body (see `pc-entity`'s inline pointer handlers).
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').Block} body - The callback body.
 * @returns {{ name: string, statements: readonly import('typescript').Statement[] }[]} The branches.
 */
const collectBranches = (ts, body) => {
    const branches = [];

    const visit = (statements) => {
        for (const statement of statements) {
            if (ts.isSwitchStatement(statement) && statement.expression.getText() === 'name') {
                let pending = [];
                for (const clause of statement.caseBlock.clauses) {
                    if (!ts.isCaseClause(clause) || !ts.isStringLiteralLike(clause.expression)) {
                        continue;
                    }
                    pending.push(clause.expression.text);
                    if (clause.statements.length > 0) {
                        for (const name of pending) {
                            branches.push({ name, statements: clause.statements });
                        }
                        pending = [];
                    }
                }
            } else if (ts.isIfStatement(statement)) {
                const name = matchNameComparison(ts, statement.expression);
                if (name !== null) {
                    branches.push({ name, statements: [statement.thenStatement] });
                }
                if (statement.elseStatement) {
                    visit([statement.elseStatement]);
                }
            } else if (ts.isBlock(statement)) {
                visit(statement.statements);
            }
        }
    };

    visit(body.statements);

    return branches;
};

/**
 * Finds the property a branch writes to. The search descends into nested blocks so that branches
 * wrapping their assignment in an `if` or `try` (see `pc-script`'s `attributes`) are handled.
 * Private backing fields are skipped in favor of the public accessor.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {readonly import('typescript').Statement[]} statements - The branch body.
 * @returns {{ fieldName: string, value: import('typescript').Expression } | null} The assignment.
 */
const findAssignment = (ts, statements) => {
    let assignment = null;

    const visit = (node) => {
        if (assignment) {
            return;
        }
        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left) &&
            node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
            !node.left.name.getText().startsWith('_')) {
            assignment = { fieldName: node.left.name.getText(), value: node.right };
            return;
        }
        ts.forEachChild(node, visit);
    };

    for (const statement of statements) {
        visit(statement);
        if (assignment) {
            break;
        }
    }

    return assignment;
};

/**
 * Resolves the valid names of an enum attribute. `parseEnum` accepts either an inline array of
 * names or a module-scope `Map` whose keys are the names (the map's values are engine constants).
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {import('typescript').Expression} expression - The `parseEnum` `valid` argument.
 * @returns {string[]} The valid names, or an empty array if they could not be resolved.
 */
const resolveEnumValues = (ts, sourceFile, expression) => {
    const fromArrayLiteral = node => node.elements
        .filter(element => ts.isStringLiteralLike(element))
        .map(element => element.text);

    if (ts.isArrayLiteralExpression(expression)) {
        return fromArrayLiteral(expression);
    }

    if (!ts.isIdentifier(expression)) {
        return [];
    }

    // Resolve a module-scope `const orientations = new Map<'horizontal' | 'vertical', number>([...])`
    const name = expression.text;
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (declaration.name.getText() !== name || !declaration.initializer) {
                continue;
            }
            const { initializer } = declaration;

            if (ts.isArrayLiteralExpression(initializer)) {
                return fromArrayLiteral(initializer);
            }

            if (ts.isNewExpression(initializer)) {
                // Prefer the entry keys, falling back to the `Map<union, number>` type argument
                const entries = initializer.arguments?.[0];
                if (entries && ts.isArrayLiteralExpression(entries)) {
                    const keys = entries.elements
                        .filter(entry => ts.isArrayLiteralExpression(entry))
                        .map(entry => entry.elements[0])
                        .filter(key => key && ts.isStringLiteralLike(key))
                        .map(key => key.text);
                    if (keys.length > 0) {
                        return keys;
                    }
                }

                const union = initializer.typeArguments?.[0];
                if (union && ts.isUnionTypeNode(union)) {
                    return union.types
                        .filter(type => ts.isLiteralTypeNode(type) && ts.isStringLiteralLike(type.literal))
                        .map(type => type.literal.text);
                }
            }
        }
    }

    return [];
};

/**
 * Renders an attribute default in the form a user would type in HTML. Returns `undefined` when
 * there is no meaningful default (a `null` default means "leave the engine value alone") or when
 * the expression is not recognized — an unknown default is omitted rather than guessed at.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').Expression} [expression] - The default value expression.
 * @returns {string | undefined} The rendered default.
 */
const renderDefault = (ts, expression) => {
    if (!expression) {
        return undefined;
    }

    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) {
        return expression.text;
    }

    switch (expression.kind) {
        case ts.SyntaxKind.TrueKeyword:
            return 'true';
        case ts.SyntaxKind.FalseKeyword:
            return 'false';
        case ts.SyntaxKind.NullKeyword:
            return undefined;
    }

    // A numeric attribute whose default is "no limit", e.g. pc-app's max-pixel-ratio. Published so
    // the tooltip states the default rather than leaving it blank; nobody is expected to type it.
    if (ts.isIdentifier(expression) && expression.text === 'Infinity') {
        return 'Infinity';
    }

    // Negative numbers, e.g. the -9.81 in `new Vec3(0, -9.81, 0)`
    if (ts.isPrefixUnaryExpression(expression) &&
        expression.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(expression.operand)) {
        return `-${expression.operand.text}`;
    }

    if (ts.isPropertyAccessExpression(expression)) {
        return MATH_CONSTANTS[expression.getText()];
    }

    if (ts.isNewExpression(expression)) {
        const constructorName = expression.expression.getText();
        if (!Object.hasOwn(EMPTY_CONSTRUCTORS, constructorName)) {
            return undefined;
        }
        const args = expression.arguments ?? [];
        if (args.length === 0) {
            return EMPTY_CONSTRUCTORS[constructorName];
        }
        const components = args.map(argument => renderDefault(ts, argument));
        return components.every(component => component !== undefined) ? components.join(' ') : undefined;
    }

    return undefined;
};

/**
 * Derives an attribute's type and default from the expression assigned to its property.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {import('typescript').Expression} [value] - The assigned expression.
 * @param {string} context - A label used in warnings.
 * @returns {{ type: string, default?: string, format?: string }} The derived metadata.
 */
const describeValue = (ts, sourceFile, value, context) => {
    // A branch with no assignment (or one assigning the raw attribute value) is a plain string
    if (!value || !ts.isCallExpression(value)) {
        return { type: 'string' };
    }

    const helper = PARSE_HELPERS[value.expression.getText()];
    if (!helper) {
        return { type: 'string' };
    }

    const [, second, third] = value.arguments;

    if (helper.type === 'enum') {
        const values = resolveEnumValues(ts, sourceFile, second);
        if (values.length === 0) {
            console.warn(`[cem] could not resolve enum values for ${context}; falling back to string`);
            return { type: 'string', default: renderDefault(ts, third) };
        }
        return {
            type: values.map(name => `'${name}'`).join(' | '),
            default: renderDefault(ts, third)
        };
    }

    return {
        type: helper.type,
        default: renderDefault(ts, second),
        format: helper.format
    };
};

/**
 * Collects the entries of a class's static `properties` table (see `src/properties.ts`). Spread
 * entries (`...ComponentElement.properties`) restate a base class's table for the runtime merge;
 * they are skipped here because the analyzer's inheritance step already copies the base class's
 * attributes, marked with `inheritedFrom`.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').ClassDeclaration} node - The class declaration.
 * @returns {{ fieldName: string, attribute: string, parse?: import('typescript').Expression }[]} The entries.
 */
const collectTableEntries = (ts, node) => {
    const table = node.members.find(member => ts.isPropertyDeclaration(member) &&
        member.name.getText() === 'properties' &&
        member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword));
    if (!table?.initializer || !ts.isObjectLiteralExpression(table.initializer)) {
        return [];
    }

    const entries = [];
    for (const property of table.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
            continue;
        }
        const fieldName = ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText();

        let attribute = camelToKebab(fieldName);
        let parse;
        for (const option of property.initializer.properties) {
            if (!ts.isPropertyAssignment(option)) {
                continue;
            }
            const name = option.name.getText();
            if (name === 'attribute' && ts.isStringLiteralLike(option.initializer)) {
                attribute = option.initializer.text;
            } else if (name === 'parse') {
                parse = option.initializer;
            }
        }
        entries.push({ fieldName, attribute, parse });
    }
    return entries;
};

/**
 * Derives an attribute's type from a table entry's `parse` expression: a parse helper by
 * identity, or an `enumOf(...)` call whose argument carries the valid names.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {import('typescript').Expression} [parse] - The entry's `parse` expression.
 * @param {string} context - A label used in warnings.
 * @returns {{ type: string, format?: string }} The derived metadata.
 */
const describeParse = (ts, sourceFile, parse, context) => {
    if (parse && ts.isCallExpression(parse) && parse.expression.getText() === 'enumOf') {
        const values = resolveEnumValues(ts, sourceFile, parse.arguments[0]);
        if (values.length === 0) {
            console.warn(`[cem] could not resolve enum values for ${context}; falling back to string`);
            return { type: 'string' };
        }
        return { type: values.map(name => `'${name}'`).join(' | ') };
    }

    const helper = parse && ts.isIdentifier(parse) ? PARSE_HELPERS[parse.text] : undefined;
    if (!helper || helper.type === 'enum') {
        return { type: 'string' };
    }
    return { type: helper.type, format: helper.format };
};

/**
 * Renders the default of a table-declared property from its backing field's initializer — the
 * `_shadowType` of `shadowType`. A property with no backing field (or no initializer) has no
 * default to publish.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').ClassDeclaration} node - The class declaration.
 * @param {string} fieldName - The property name.
 * @returns {string | undefined} The rendered default.
 */
const renderFieldDefault = (ts, node, fieldName) => {
    const field = node.members.find(member => ts.isPropertyDeclaration(member) &&
        member.name.getText() === `_${fieldName}`);
    return renderDefault(ts, field?.initializer);
};

/**
 * Reduces a member's JSDoc to a single tooltip-friendly sentence, rewriting the accessor voice
 * ("Sets the field of view of the camera.") into the declarative voice an attribute description
 * wants ("The field of view of the camera.").
 *
 * @param {string} [text] - The member description.
 * @returns {string | undefined} The attribute description.
 */
const toAttributeDescription = (text) => {
    if (!text) {
        return undefined;
    }
    const paragraph = text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
    const sentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(paragraph)?.[0] ?? paragraph;

    // Accessors open with one of a small set of leading words ("Sets the ...", "Gets whether ...",
    // "Sets how ...", "Gets which ..."). Dropping the verb and capitalizing the word after it turns
    // every one of them into the declarative voice an attribute description wants.
    return sentence.replace(
        /^(?:Sets|Gets) (the|whether|how|which) /,
        (_, word) => `${word[0].toUpperCase()}${word.slice(1)} `
    );
};

/**
 * @returns {object} The analyzer plugin.
 */
export const attributesFromCallbackPlugin = () => ({
    name: 'pwc-attributes-from-callback',

    analyzePhase({ ts, node, moduleDoc }) {
        if (!ts.isClassDeclaration(node) || !node.name) {
            return;
        }

        const classDoc = moduleDoc.declarations?.find(declaration => declaration.name === node.name.getText());
        if (!classDoc) {
            return;
        }

        const sourceFile = node.getSourceFile();

        const record = (name, fieldName, { type, default: defaultValue, format }) => {
            classDoc.attributes ??= [];

            let attribute = classDoc.attributes.find(existing => existing.name === name);
            if (!attribute) {
                attribute = { name };
                classDoc.attributes.push(attribute);
            }

            attribute.type = { text: type };
            attribute.fieldName = fieldName;
            if (defaultValue !== undefined) {
                attribute.default = defaultValue;
            }
            if (format) {
                // Consumed (and removed) in moduleLinkPhase, once member docs are available
                attribute._pwcFormat = format;
            }
        };

        // The static `properties` table
        for (const entry of collectTableEntries(ts, node)) {
            const { type, format } = describeParse(
                ts, sourceFile, entry.parse, `${classDoc.name}'s '${entry.attribute}'`
            );
            record(entry.attribute, entry.fieldName, {
                type,
                default: renderFieldDefault(ts, node, entry.fieldName),
                format
            });
        }

        // Transitional: the attributeChangedCallback switch
        const callback = node.members.find(member => ts.isMethodDeclaration(member) &&
            member.name.getText() === 'attributeChangedCallback');
        if (!callback?.body) {
            return;
        }

        for (const branch of collectBranches(ts, callback.body)) {
            const assignment = findAssignment(ts, branch.statements);
            const fieldName = assignment?.fieldName ?? kebabToCamel(branch.name);
            record(branch.name, fieldName, describeValue(
                ts, sourceFile, assignment?.value, `${classDoc.name}'s '${branch.name}'`
            ));
        }
    },

    moduleLinkPhase({ moduleDoc }) {
        for (const declaration of moduleDoc.declarations ?? []) {
            for (const attribute of declaration.attributes ?? []) {
                const hint = FORMAT_HINTS[attribute._pwcFormat];
                delete attribute._pwcFormat;

                if (!attribute.description) {
                    const member = declaration.members?.find(candidate => candidate.kind === 'field' &&
                        candidate.name === attribute.fieldName);
                    attribute.description = toAttributeDescription(member?.description);
                }

                if (hint) {
                    attribute.description = [attribute.description, hint].filter(Boolean).join(' ');
                }

                if (!attribute.description) {
                    delete attribute.description;
                }
            }
        }
    }
});
