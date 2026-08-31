/**
 * Resolves entity reference strings against the document. A reference beginning with `#` is a
 * document-wide selector (an element id, or any selector rooted in one); anything else is an
 * entity name, resolved lexically through the entity hierarchy first and against the document
 * after — never as a selector or an id.
 *
 * Unlike the attribute parsers in `parse.ts`, these helpers touch the DOM, and `findEntityElement`
 * and `getEntity` return `null` instead of falling back to a default. They also do not warn -
 * what an unresolved reference means depends on the element holding it - so elements report
 * through `resolveEntity`, which takes that meaning as parameters, and `pc-script` builds its own
 * message from the lower-level pieces.
 */

import type { Entity } from 'playcanvas';

/**
 * Runs querySelector, absorbing the SyntaxError an unparseable selector throws - references are
 * arbitrary author text, so a lookup must fail to `null`, never throw.
 *
 * @param selector - The selector to query.
 * @returns The matched element, or `null`.
 */
const query = (selector: string): Element | null => {
    try {
        return document.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * Runs a lookup against one scope, checking the scope element itself before its subtree — a
 * reference deep in a cloned prefab must be able to name the prefab's root. Absorbs the
 * SyntaxError of an invalid selector like {@link query}: escaping quotes and backslashes does not
 * make arbitrary text a valid CSS string (a reference containing a newline still throws), so a
 * lookup must fail to `null`, never throw.
 *
 * @param scope - The element whose inclusive subtree to search.
 * @param selector - The selector to query.
 * @returns The matched element, or `null`.
 */
const queryScope = (scope: Element, selector: string): Element | null => {
    try {
        return scope.matches(selector) ? scope : scope.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * Reads the entity a resolved element is backing, through the `entity` accessor every
 * entity-fronting element exposes. `null` for no element, and for an element backing nothing.
 *
 * @param element - The element to read, or `null`.
 * @returns The backing entity, or `null`.
 */
const entityOf = (element: Element | null): Entity | null => {
    return (element as { entity?: Entity } | null)?.entity ?? null;
};

/**
 * The elements that front an entity: what a bare name can resolve to, and the scopes of the
 * lexical name lookup.
 */
const ENTITY_KINDS = ['pc-entity', 'pc-model', 'pc-node'] as const;

/**
 * The entity-fronting elements as one selector, for the scope walk.
 */
const ENTITY_SCOPES = ENTITY_KINDS.join(', ');

/**
 * Resolves a reference string to the element it names. The grammar is closed — every reference
 * has exactly one interpretation:
 *
 * - A reference beginning with `#` is a document-wide CSS selector — an element id (`#body`), or
 *   any selector rooted in one (`#hud pc-entity`). It is authoritative: the name lookup never
 *   runs for it, so an unusually named entity cannot shadow it.
 * - Any other reference is the name of an entity-fronting element (`<pc-entity>`, `<pc-model>` or
 *   `<pc-node>` — for a node, the glTF node name it binds), and nothing else. A bare reference is
 *   never interpreted as a selector or an element id, so adding or renaming elements can never
 *   change which form it takes.
 *
 * When `from` is supplied, a name resolves lexically first: the closest entity-fronting
 * ancestor's inclusive subtree, then each outer entity-fronting ancestor, then the containing
 * `<pc-app>`, then the document. This is what lets a `<template>` prefab reference its own
 * entities by name — every clone resolves within itself before a document-wide lookup could reach
 * an earlier clone — provided the prefab has a single entity-fronting root to be the enclosing
 * scope.
 *
 * Separate from {@link getEntity} so a caller reporting a failure can tell the causes apart
 * ({@link unresolvedCause} words them): nothing in the document matches the reference, or
 * something matches but is not backing an entity (yet, or ever).
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference, whose entity-fronting ancestors scope the
 * name lookup. Omitted, the name lookup is document-wide only.
 * @returns The matched element, or `null`.
 * @internal
 */
export const findEntityElement = (ref: string, from?: Element): Element | null => {
    if (!ref) {
        return null;
    }

    // A '#' reference is document-wide and bypasses the name lookup entirely - an entity named
    // '#body' must never shadow the element whose id is 'body'.
    if (ref.startsWith('#')) {
        return query(ref);
    }

    // The name lands inside a quoted CSS string, so its quotes and backslashes are escaped -
    // a name like `say "hi"` must resolve, not turn the lookup into a SyntaxError.
    const escaped = ref.replace(/["\\]/g, '\\$&');
    const nameSelector = ENTITY_KINDS.map(kind => `${kind}[name="${escaped}"]`).join(', ');

    if (from) {
        let scope = from.parentElement?.closest(ENTITY_SCOPES);
        while (scope) {
            const element = queryScope(scope, nameSelector);
            if (element) {
                return element;
            }
            scope = scope.parentElement?.closest(ENTITY_SCOPES);
        }

        const app = from.parentElement?.closest('pc-app');
        if (app) {
            const element = queryScope(app, nameSelector);
            if (element) {
                return element;
            }
        }
    }

    return query(nameSelector);
};

/**
 * Resolves a reference string to the {@link Entity} backing an entity-fronting element
 * (`<pc-entity>`, `<pc-model>` or `<pc-node>`). The reference is a name — resolved lexically
 * through the entity hierarchy first when `from` is supplied — or a document-wide `#` selector
 * ({@link findEntityElement} details the grammar and order). Returns `null` if no matching
 * element (or backing entity) is found.
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference, whose entity-fronting ancestors scope the
 * name lookup. Omitted, the name lookup is document-wide only.
 * @returns The resolved entity, or `null`.
 * @internal
 */
export const getEntity = (ref: string, from?: Element): Entity | null => {
    return entityOf(findEntityElement(ref, from));
};

/**
 * Describes why a non-empty reference did not resolve, for a warning. Three causes, because they
 * have three different fixes: nothing matches (usually a typo), the matched element is not backing
 * an entity yet (usually timing - a `pc-node` whose asset has not loaded - so resolving again
 * later can work), or the matched element can never back one (the reference points at the wrong
 * element, so only correcting it can). Capability is the `entity` accessor every entity-backing
 * element inherits from EntityBaseElement.
 *
 * @param element - The element the reference matched, or `null` when nothing did.
 * @returns The cause, phrased to follow `could not resolve ... -`.
 * @internal
 */
export const unresolvedCause = (element: Element | null): string => {
    if (!element) {
        return 'nothing in the document matches it';
    }
    const tag = `<${element.tagName.toLowerCase()}>`;
    return 'entity' in element
        ? `${tag} matches it but is not backing an entity yet`
        : `${tag} matches it but cannot back an entity`;
};

/**
 * Builds the migration pointer for a bare reference that names nothing but matches the id of an
 * entity-fronting element - it was almost certainly meant as an id, so point at the form that
 * expresses it, escaped so the suggestion actually parses as a selector (an id like `a:b` must
 * be written `#a\:b`). Empty when the reference is already a `#` form, matches no id, or the id
 * belongs to an element that could never back an entity - suggesting it would only trade this
 * warning for the wrong-target one.
 *
 * @param ref - The unresolved reference.
 * @param prefix - Text the suggested form must carry in the caller's syntax (e.g. `entity:`).
 * @returns The advice sentence, or an empty string.
 * @internal
 */
export const idHint = (ref: string, prefix = ''): string => {
    const match = !ref.startsWith('#') && document.getElementById(ref);
    return match && 'entity' in match
        ? `A bare reference is a name - write '${prefix}#${CSS.escape(ref)}' to reference the element with that id.`
        : '';
};

/**
 * Resolves a reference string to the {@link Entity} backing an entity-fronting element, scoped to
 * the resolving element ({@link findEntityElement} details the order) and warning when a
 * non-empty reference does not resolve - otherwise the reference fails silently, invisible
 * except through the behavior it should have driven. The message names which of the three causes
 * ({@link unresolvedCause}) it hit, and advises reassigning later only when that can work.
 *
 * An empty reference stays silent: it is the unset state of an optional attribute, and on some
 * elements (`pc-joint` `entity-b`, `pc-button` `image`) a documented value of its own.
 *
 * @param ref - The reference string to resolve.
 * @param from - The element resolving the reference; scopes the lookup and names the message.
 * @param attribute - The attribute being resolved, for the message.
 * @param consequence - What the unresolved reference means for the element, for the message.
 * @returns The resolved entity, or `null`.
 * @internal
 */
export const resolveEntity = (ref: string, from: Element, attribute: string, consequence: string): Entity | null => {
    if (!ref) {
        return null;
    }

    const element = findEntityElement(ref, from);
    const entity = entityOf(element);
    if (!entity) {
        let advice = `Assign ${attribute} again once the entity exists.`;
        if (element && !('entity' in element)) {
            advice = `Point ${attribute} at a pc-entity, pc-model or pc-node instead.`;
        } else if (!element) {
            const hint = idHint(ref);
            if (hint) {
                advice = hint;
            }
        }
        console.warn(
            `${from.tagName.toLowerCase()} could not resolve ${attribute} '${ref}' - ${unresolvedCause(element)} - ${consequence}. ${advice}`
        );
    }
    return entity;
};
