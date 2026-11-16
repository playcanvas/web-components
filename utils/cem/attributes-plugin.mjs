/**
 * Custom Elements Manifest plugin that derives attribute metadata from each element's
 * `attributeChangedCallback`.
 *
 * Every element in this library declares its attributes in `static get observedAttributes()` and
 * handles them in an `attributeChangedCallback` whose body is a uniform mapping of the form:
 *
 * ```js
 * case 'clear-color':
 *     this.clearColor = parseColor(newValue, new Color(0.75, 0.75, 0.75, 1), name);
 *     break;
 * ```
 *
 * That single expression carries everything the manifest needs: the attribute name, the property
 * it writes to (`fieldName`), the attribute's type (implied by the `parse*` helper) and its
 * default value (the helper's second argument). Deriving all of it here keeps the manifest in
 * lockstep with the code, rather than requiring ~200 hand-written `@attribute` tags that would
 * silently drift.
 *
 * An element that declares its attributes in a schema has no such callback. Its
 * `defineAttributes(Class, 'component', { clearColor: attr.color(...) })` call carries the same
 * things, one entry per attribute, and is read the same way. An element can have both: a schema
 * for the attributes that only write a value through, and callback branches for the rest.
 */

/**
 * The attribute-parsing helpers from `src/parse.ts`, mapped to the manifest type they imply.
 * `format` selects a trailing hint appended to the attribute description, since the accepted
 * string syntax of a color or vector attribute is not obvious from the type alone.
 */
const PARSE_HELPERS = {
    parseBool: { type: 'boolean' },
    parseBoundingBox: { type: 'string', format: 'bounds' },
    parseNumber: { type: 'number' },
    parsePlanes: { type: 'string', format: 'planes' },
    parseEnum: { type: 'enum' },
    parseFlags: { type: 'flags' },
    parseColor: { type: 'string', format: 'color' },
    parseQuat: { type: 'string', format: 'quat' },
    parseVec2: { type: 'string', format: 'vec2' },
    parseVec3: { type: 'string', format: 'vec3' },
    parseVec4: { type: 'string', format: 'vec4' }
};

const FORMAT_HINTS = {
    bounds: 'Accepts 6 space-separated numbers: the center of the box, then its half extents.',
    planes: 'Accepts planes separated by commas, each as 4 space-separated numbers: the normal, then the distance.',
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
 * The attribute kinds of `attr` in `src/attributes.ts`, mapped to the parser each one wraps. A
 * kind takes the parser's arguments without the attribute's text, so both forms describe an
 * attribute the same way. `string` wraps no parser: like a callback branch that assigns the
 * attribute's text as it is, it publishes a plain string with no default.
 */
const SCHEMA_KINDS = {
    bool: 'parseBool',
    boundingBox: 'parseBoundingBox',
    color: 'parseColor',
    flags: 'parseFlags',
    number: 'parseNumber',
    oneOf: 'parseEnum',
    planes: 'parsePlanes',
    quat: 'parseQuat',
    string: null,
    vec2: 'parseVec2',
    vec3: 'parseVec3',
    vec4: 'parseVec4'
};

const kebabToCamel = name => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

/**
 * Names the attribute of a schema property, exactly as `camelToKebab` in `src/attributes.ts` does:
 * a run of capitals is one word, so `enableGGXSpecular` is `enable-ggx-specular`. The two must
 * agree, or the manifest would publish an attribute the element does not observe.
 *
 * @param {string} name - The property name.
 * @returns {string} The attribute name.
 */
const camelToKebab = name => name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

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
 * @returns {{ type: string, default?: string, hint?: string }} The derived metadata, where `hint`
 * is the syntax sentence appended to the attribute description.
 */
const describeValue = (ts, sourceFile, value, context) => {
    // A branch with no assignment (or one assigning the raw attribute value) is a plain string
    if (!value || !ts.isCallExpression(value)) {
        return { type: 'string' };
    }

    // A parser takes the attribute's text first; the arguments after it describe the attribute
    return describeParser(ts, sourceFile, value.expression.getText(), value.arguments.slice(1), context);
};

/**
 * Derives an attribute's type and default from the parser that reads it and the arguments that
 * follow the attribute's text: the default, preceded for an enum or a set of flags by the valid
 * names.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').SourceFile} sourceFile - The file declaring the element.
 * @param {string} parser - The name of the parser in `src/parse.ts`.
 * @param {readonly import('typescript').Expression[]} args - The arguments after the text.
 * @param {string} context - A label used in warnings.
 * @returns {{ type: string, default?: string, hint?: string }} The derived metadata, where `hint`
 * is the syntax sentence appended to the attribute description.
 */
const describeParser = (ts, sourceFile, parser, [first, second], context) => {
    const helper = PARSE_HELPERS[parser];
    if (!helper) {
        return { type: 'string' };
    }

    if (helper.type === 'enum') {
        const values = resolveEnumValues(ts, sourceFile, first);
        if (values.length === 0) {
            console.warn(`[cem] could not resolve enum values for ${context}; falling back to string`);
            return { type: 'string', default: renderDefault(ts, second) };
        }
        return {
            type: values.map(name => `'${name}'`).join(' | '),
            default: renderDefault(ts, second)
        };
    }

    // A set of flags takes any combination of its names, so it has no union type to publish -
    // the names go in the syntax hint instead. The default is written in markup form.
    if (helper.type === 'flags') {
        const values = resolveEnumValues(ts, sourceFile, first);
        if (values.length === 0) {
            console.warn(`[cem] could not resolve flag names for ${context}; publishing no syntax hint`);
        }
        return {
            type: 'string',
            default: renderDefault(ts, second),
            hint: values.length > 0 ? `Accepts space-separated names from: ${values.join(', ')}.` : undefined
        };
    }

    return {
        type: helper.type,
        default: renderDefault(ts, first),
        hint: FORMAT_HINTS[helper.format]
    };
};

/**
 * Publishes an attribute on a class, replacing whatever the analyzer made of it.
 *
 * @param {object} classDoc - The class declaration in the manifest.
 * @param {string} name - The attribute name.
 * @param {string} fieldName - The property the attribute writes to.
 * @param {{ type: string, default?: string, hint?: string }} described - The derived metadata.
 */
const publishAttribute = (classDoc, name, fieldName, { type, default: defaultValue, hint }) => {
    classDoc.attributes ??= [];

    // The name leads, however the entry came about: the analyzer seeds one from a literal
    // `observedAttributes` list, and otherwise makes one from an `@attribute` tag, type first
    const index = classDoc.attributes.findIndex(existing => existing.name === name);
    const attribute = { name, ...classDoc.attributes[index] };
    if (index === -1) {
        classDoc.attributes.push(attribute);
    } else {
        classDoc.attributes[index] = attribute;
    }

    attribute.type = { text: type };
    attribute.fieldName = fieldName;
    if (defaultValue !== undefined) {
        attribute.default = defaultValue;
    }
    if (hint) {
        // Consumed (and removed) in moduleLinkPhase, once member docs are available
        attribute._pwcHint = hint;
    }
};

/**
 * Finds the `attr.kind(...)` call a schema entry starts with, beneath any `.as(...)` or `.to(...)`
 * that follows it. Those say where the value goes in the engine, which the manifest does not
 * publish.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').Expression} expression - The schema entry's value.
 * @returns {import('typescript').CallExpression | null} The call, or `null` if there is none.
 */
const findKindCall = (ts, expression) => {
    let call = expression;
    while (ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        ts.isCallExpression(call.expression.expression)) {
        call = call.expression.expression;
    }
    return ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        call.expression.expression.getText() === 'attr' ? call : null;
};

/**
 * Publishes the attributes of a `defineAttributes(Class, target, { property: attr.kind(...) })` call,
 * where each entry carries what a callback branch does: the property, the parser and the default.
 *
 * @param {import('typescript')} ts - The TypeScript module supplied by the analyzer.
 * @param {import('typescript').CallExpression} call - The `defineAttributes` call.
 * @param {object} moduleDoc - The module in the manifest.
 */
const publishSchema = (ts, call, moduleDoc) => {
    // The class, the name of the property holding its engine object, then the schema
    const [classArgument, , schema] = call.arguments;
    const className = classArgument?.getText();
    const classDoc = moduleDoc.declarations?.find(declaration => declaration.name === className);

    // A schema the plugin cannot read publishes no attributes at all, so it must not pass quietly
    if (!classDoc || !schema || !ts.isObjectLiteralExpression(schema)) {
        throw new Error(`[cem] defineAttributes(${className}, ...) needs a class declared above it and an inline schema as its third argument`);
    }

    for (const property of schema.properties) {
        const fieldName = property.name?.getText();
        const kind = ts.isPropertyAssignment(property) ? findKindCall(ts, property.initializer) : null;
        const kindName = kind?.expression.name.text;
        if (!kind || !Object.hasOwn(SCHEMA_KINDS, kindName)) {
            throw new Error(`[cem] ${className}'s '${fieldName}' is not an attr.* kind this plugin knows`);
        }

        publishAttribute(classDoc, camelToKebab(fieldName), fieldName, describeParser(
            ts, call.getSourceFile(), SCHEMA_KINDS[kindName], kind.arguments, `${className}'s '${fieldName}'`
        ));
    }
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
        if (ts.isCallExpression(node) && node.expression.getText() === 'defineAttributes') {
            publishSchema(ts, node, moduleDoc);
            return;
        }

        if (!ts.isClassDeclaration(node) || !node.name) {
            return;
        }

        const classDoc = moduleDoc.declarations?.find(declaration => declaration.name === node.name.getText());
        if (!classDoc) {
            return;
        }

        const callback = node.members.find(member => ts.isMethodDeclaration(member) &&
            member.name.getText() === 'attributeChangedCallback');
        if (!callback?.body) {
            return;
        }

        const sourceFile = node.getSourceFile();

        for (const branch of collectBranches(ts, callback.body)) {
            const assignment = findAssignment(ts, branch.statements);
            const fieldName = assignment?.fieldName ?? kebabToCamel(branch.name);
            publishAttribute(classDoc, branch.name, fieldName, describeValue(
                ts, sourceFile, assignment?.value, `${classDoc.name}'s '${branch.name}'`
            ));
        }
    },

    moduleLinkPhase({ moduleDoc }) {
        for (const declaration of moduleDoc.declarations ?? []) {
            for (const attribute of declaration.attributes ?? []) {
                const hint = attribute._pwcHint;
                delete attribute._pwcHint;

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
