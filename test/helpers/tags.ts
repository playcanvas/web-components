/**
 * Re-exports the golden tag lists so the TypeScript suite has one place where the boundary to
 * `utils/cem/tags.mjs` is crossed.
 *
 * The runtime module is `.mjs` (validate.mjs, a plain Node script, is its other consumer) with a
 * hand-written `.d.mts` beside it for types. That pairing makes the TypeScript import resolver ask
 * for a `.mts` specifier, which would not exist at runtime - hence the single exception here rather
 * than one at every call site.
 */
export { COMPONENT_TAGS, componentTagId, ENTITY_TAGS, READY_TAGS, TAGS } from '../../utils/cem/tags.mjs';
