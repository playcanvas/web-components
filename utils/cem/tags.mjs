/**
 * The golden lists of tag names the library registers.
 *
 * These live in their own module because two independent checks need them: `validate.mjs`, which
 * gates the build on the generated manifest matching them, and the runtime test suite, which gates
 * on `customElements` matching them. The runtime check catches a case the manifest cannot see - an
 * element added under `src/` but omitted from `src/index.ts`'s dependency-ordered import list -
 * because the analyzer reads source files rather than the barrel.
 */

/** Every tag the library registers. Kept explicit so adding or removing an element is deliberate. */
export const TAGS = [
    'pc-app', 'pc-asset', 'pc-button', 'pc-camera', 'pc-collision', 'pc-element', 'pc-entity',
    'pc-gsplat', 'pc-layoutchild', 'pc-layoutgroup', 'pc-light', 'pc-listener', 'pc-material',
    'pc-model', 'pc-module', 'pc-node', 'pc-particles', 'pc-render', 'pc-rigidbody', 'pc-scene',
    'pc-screen', 'pc-script', 'pc-scripts', 'pc-scrollbar', 'pc-scrollview', 'pc-sky', 'pc-sound',
    'pc-sounds'
];

/** The tags whose elements extend `ComponentElement`, and so inherit its `enabled` attribute. */
export const COMPONENT_TAGS = [
    'pc-button', 'pc-camera', 'pc-collision', 'pc-element', 'pc-gsplat', 'pc-layoutchild',
    'pc-layoutgroup', 'pc-light', 'pc-listener', 'pc-particles', 'pc-render', 'pc-rigidbody',
    'pc-screen', 'pc-scripts', 'pc-scrollbar', 'pc-scrollview', 'pc-sounds'
];

/** `pc-material` and `pc-module` extend `HTMLElement`, so they never become ready. */
export const READY_TAGS = TAGS.filter(tag => tag !== 'pc-material' && tag !== 'pc-module');
