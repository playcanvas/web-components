/**
 * The golden lists of tag names the library registers.
 *
 * These live in their own module because two independent checks need them: `validate.mjs`, which
 * gates the build on the generated manifest matching them, and the runtime test suite, which gates
 * on `customElements` matching them. The runtime check catches a case the manifest cannot see - an
 * element added under `src/` but omitted from `src/index.ts`'s dependency-ordered import list -
 * because the analyzer reads source files rather than the barrel.
 *
 * Naming rules for a new tag:
 *
 * - Every tag is prefixed `pc-`, and multi-word names are kebab-cased (`pc-layout-group`, not
 *   `pc-layoutgroup`). The engine's own component ids concatenate because they are JavaScript
 *   property names - `entity.layoutgroup` cannot carry a hyphen - which is a constraint an HTML
 *   tag does not share.
 * - A component element's tag states its engine component id: strip the prefix, drop the hyphens
 *   and the two are equal. `componentTagId` below performs that derivation, and
 *   `test/elements/registration.test.ts` asserts it against the id every element passes to
 *   `ComponentElement`'s constructor. That keeps the mapping recoverable by rule rather than by
 *   memory, in both directions.
 * - A repeatable child of a component element takes its parent's tag as a prefix: `pc-anim-clip`
 *   under `pc-anim`, `pc-sound-slot` under `pc-sound`, `pc-script-instance` under `pc-script`.
 *   Singular/plural pairs are not used - `pc-sounds` holding `pc-sound` put two live tags one
 *   character apart.
 */

/** Every tag the library registers. Kept explicit so adding or removing an element is deliberate. */
export const TAGS = [
    'pc-anim', 'pc-anim-clip', 'pc-app', 'pc-asset', 'pc-audio-listener', 'pc-button', 'pc-camera',
    'pc-collision', 'pc-element', 'pc-entity', 'pc-gsplat', 'pc-joint', 'pc-layout-child',
    'pc-layout-group', 'pc-light', 'pc-material', 'pc-model', 'pc-node', 'pc-particle-system',
    'pc-render', 'pc-rigid-body', 'pc-scene', 'pc-screen', 'pc-script', 'pc-script-instance',
    'pc-scrollbar', 'pc-scroll-view', 'pc-sky', 'pc-sound', 'pc-sound-slot', 'pc-wasm'
];

/**
 * The tags whose elements extend `EntityBaseElement`, and so front an engine entity: they are
 * pick targets and carry the `onpointer*` attributes and pointer events.
 */
export const ENTITY_TAGS = ['pc-entity', 'pc-model', 'pc-node'];

/** The tags whose elements extend `ComponentElement`, and so inherit its `enabled` attribute. */
export const COMPONENT_TAGS = [
    'pc-anim', 'pc-audio-listener', 'pc-button', 'pc-camera', 'pc-collision', 'pc-element',
    'pc-gsplat', 'pc-joint', 'pc-layout-child', 'pc-layout-group', 'pc-light',
    'pc-particle-system', 'pc-render', 'pc-rigid-body', 'pc-screen', 'pc-script', 'pc-scrollbar',
    'pc-scroll-view', 'pc-sound'
];

/** `pc-material` extends `HTMLElement`, so it never becomes ready. */
export const READY_TAGS = TAGS.filter(tag => tag !== 'pc-material');

/**
 * The engine component id a component element's tag states, by the naming rule above: the tag
 * without its `pc-` prefix and without its hyphens. Every tag in `COMPONENT_TAGS` maps to a real
 * engine component this way, so a reader who knows one spelling can derive the other.
 *
 * @param {string} tag - A tag from `COMPONENT_TAGS`.
 * @returns {string} The engine component id, e.g. `layoutgroup` for `pc-layout-group`.
 */
export const componentTagId = tag => tag.slice('pc-'.length).replaceAll('-', '');
