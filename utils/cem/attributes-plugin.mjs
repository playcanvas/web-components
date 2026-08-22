/**
 * Custom Elements Manifest plugin that derives attribute metadata from each element's attribute
 * declarations, from either of two sources:
 *
 * - A static `properties` table of descriptors (see `src/properties.ts`), where an entry of the
 *   form `shadowType: enumProperty(shadowTypes, 'pcf3-32f')` carries the property (`fieldName`,
 *   unless retargeted by `property`), the attribute name (kebab-cased, unless overridden by
 *   `attribute`), the attribute's type (implied by the descriptor factory), its enum values (the
 *   factory's first argument) and its default (the declared initial value — or the `invalid`
 *   fallback, for a property whose initial value is `null`, matching the constant the
 *   invalid-value warning names). The descriptor is the single authoritative declaration:
 *   runtime dispatch reads the same one.
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

/**
 * The property-descriptor factories from `src/properties.ts`, mapped to the manifest type each
 * one implies. String attributes never publish a default — every one of them names an external
 * resource (or a label) with no meaningful value to suggest.
 */
const PROPERTY_FACTORIES = {
    booleanProperty: { type: 'boolean' },
    numberProperty: { type: 'number' },
    enumProperty: { type: 'enum' },
    stringProperty: { type: 'string', omitDefault: true },
    colorProperty: { type: 'string', format: 'color' }
};

const kebabToCamel = name => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

const camelToKebab = name => name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);

/**
 * Resolves an identifier to the initializer of its module-scope `const` declaration.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file to search.
 * @param {string} name - The identifier text.
 * @returns {import('typescript').Expression | undefined} The initializer, or `undefined`.
 */
const resolveModuleConst = (ts, sourceFile, name) => {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (declaration.name.getText() === name && declaration.initializer) {
                return declaration.initializer;
            }
        }
    }
    return undefined;
};

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
 * wrapping their assignment in an `if` or `try` (see `pc-script-instance`'s `attributes`) are handled.
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

    if (!expression) {
        return [];
    }

    if (ts.isArrayLiteralExpression(expression)) {
        return fromArrayLiteral(expression);
    }

    if (!ts.isIdentifier(expression)) {
        return [];
    }

    // Resolve a module-scope `const orientations = new Map<'horizontal' | 'vertical', number>([...])`
    const initializer = resolveModuleConst(ts, sourceFile, expression.text);
    if (!initializer) {
        return [];
    }

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
 * Collects the entries of a class's static `properties` descriptor table (see
 * `src/properties.ts`). The table is a module-scope `const` (the backing field initializers
 * reference it), so an identifier initializer is resolved to its declaration and the
 * `defineProperties(...)` wrapper unwrapped. Each entry is a descriptor-factory call plus its
 * resolved options.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {import('typescript').ClassDeclaration} node - The class declaration.
 * @returns {{ fieldName: string, attribute: string, factory: string,
 *   args: readonly import('typescript').Expression[],
 *   invalid?: import('typescript').Expression }[]} The entries.
 */
const collectTableEntries = (ts, sourceFile, node) => {
    const member = node.members.find(candidate => ts.isPropertyDeclaration(candidate) &&
        candidate.name.getText() === 'properties' &&
        candidate.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword));
    if (!member?.initializer) {
        return [];
    }

    let table = member.initializer;
    if (ts.isIdentifier(table)) {
        table = resolveModuleConst(ts, sourceFile, table.text);
    }
    if (table && ts.isCallExpression(table) && table.expression.getText() === 'defineProperties') {
        table = table.arguments[0];
    }
    if (!table || !ts.isObjectLiteralExpression(table)) {
        return [];
    }

    const entries = [];
    for (const property of table.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isCallExpression(property.initializer)) {
            continue;
        }
        const key = ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText();
        const { arguments: args } = property.initializer;

        let attribute;
        let fieldName = key;
        let invalid;

        // The trailing options argument, when present
        const options = args[args.length - 1];
        if (options && ts.isObjectLiteralExpression(options)) {
            for (const option of options.properties) {
                if (!ts.isPropertyAssignment(option)) {
                    continue;
                }
                const name = option.name.getText();
                if (name === 'attribute' && ts.isStringLiteralLike(option.initializer)) {
                    attribute = option.initializer.text;
                } else if (name === 'property' && ts.isStringLiteralLike(option.initializer)) {
                    fieldName = option.initializer.text;
                } else if (name === 'invalid') {
                    invalid = option.initializer;
                }
            }
        }

        entries.push({
            fieldName,
            attribute: attribute ?? camelToKebab(key),
            factory: property.initializer.expression.getText(),
            args,
            invalid
        });
    }
    return entries;
};

/**
 * Derives an attribute's type and default from its descriptor-factory call. The published
 * default is the declared initial value — or the `invalid` fallback, for a property whose
 * initial value is `null` (renderDefault omits `null`), matching the constant the invalid-value
 * warning names.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {ReturnType<typeof collectTableEntries>[number]} entry - The table entry.
 * @param {string} context - A label used in warnings.
 * @returns {{ type: string, default?: string, format?: string }} The derived metadata.
 */
const describeEntry = (ts, sourceFile, entry, context) => {
    const factory = PROPERTY_FACTORIES[entry.factory];
    if (!factory) {
        console.warn(`[cem] unknown property descriptor for ${context}; falling back to string`);
        return { type: 'string' };
    }

    // A mutable initial value is declared as a factory — `() => new Color(1, 1, 1)` — so the
    // rendered default is the factory's body
    const unwrap = expression => (expression && ts.isArrowFunction(expression) && !ts.isBlock(expression.body) ?
        expression.body :
        expression);

    // enumProperty(valid, initial, options?) carries the valid names first; the value factories
    // are (initial, options?)
    const initial = factory.type === 'enum' ? entry.args[1] : entry.args[0];
    const defaultValue = renderDefault(ts, unwrap(entry.invalid) ?? unwrap(initial));

    if (factory.type === 'enum') {
        const values = resolveEnumValues(ts, sourceFile, entry.args[0]);
        if (values.length === 0) {
            console.warn(`[cem] could not resolve enum values for ${context}; falling back to string`);
            return { type: 'string', default: defaultValue };
        }
        return {
            type: values.map(name => `'${name}'`).join(' | '),
            default: defaultValue
        };
    }

    return {
        type: factory.type,
        default: factory.omitDefault ? undefined : defaultValue,
        format: factory.format
    };
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

        // The static `properties` descriptor table
        for (const entry of collectTableEntries(ts, sourceFile, node)) {
            record(entry.attribute, entry.fieldName, describeEntry(
                ts, sourceFile, entry, `${classDoc.name}'s '${entry.attribute}'`
            ));
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
