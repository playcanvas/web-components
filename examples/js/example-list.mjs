/**
 * The catalog behind the example browser's sidebar. Categories appear in the order they first
 * occur here, and examples in the order they are listed within a category - both hand-authored,
 * running simplest first so a newcomer can read down a category.
 *
 * `examples[0]` is what the browser loads when there is no hash, so Showcases stays first.
 *
 * `name` is the single source of truth for both of an example's other names:
 *
 * - its <title>, which must read `PlayCanvas Web Components - ${name}`
 * - its filename, which must be the name lowercased with each run of non-alphanumerics collapsed to
 *   a hyphen: 'Spinning Cube (DOM API)' -> spinning-cube-dom-api.html
 *
 * test/examples/example-list.test.ts enforces both, and that every example page in examples/ is
 * listed here - an unlisted page is unreachable from the sidebar.
 *
 * The filename rule means renaming an example changes its URL, and these URLs are public: the User
 * Manual links several directly. Prefer getting the name right to keeping a stale filename, but
 * grep developer-site for the old one first.
 */
export const examples = [
    // Showcases
    { name: 'Car Configurator', path: 'car-configurator.html', category: 'Showcases' },
    { name: 'Product Viewer', path: 'product-viewer.html', category: 'Showcases' },
    { name: 'Annotations', path: 'annotations.html', category: 'Showcases' },
    { name: 'Shoe Configurator', path: 'shoe-configurator.html', category: 'Showcases' },
    { name: 'Solar System', path: 'solar-system.html', category: 'Showcases' },
    { name: 'Falling Blocks', path: 'falling-blocks.html', category: 'Showcases' },
    // Getting Started
    { name: 'Spinning Cube', path: 'spinning-cube.html', category: 'Getting Started' },
    { name: 'Spinning Cube (DOM API)', path: 'spinning-cube-dom-api.html', category: 'Getting Started' },
    { name: 'Spinning Cube (UMD)', path: 'spinning-cube-umd.html', category: 'Getting Started' },
    // Gaussian Splatting
    { name: 'Basic Splat', path: 'basic-splat.html', category: 'Gaussian Splatting' },
    { name: 'Splat Annotations', path: 'splat-annotations.html', category: 'Gaussian Splatting' },
    { name: 'Splat Flipbook', path: 'splat-flipbook.html', category: 'Gaussian Splatting' },
    { name: 'Splat Streaming', path: 'splat-streaming.html', category: 'Gaussian Splatting' },
    // Webcam AR
    { name: 'AR Avatar', path: 'ar-avatar.html', category: 'Webcam AR' },
    { name: 'AR Hand Gestures', path: 'ar-hand-gestures.html', category: 'Webcam AR' },
    { name: 'AR Optic Blast', path: 'ar-optic-blast.html', category: 'Webcam AR' },
    { name: 'AR Sunglasses', path: 'ar-sunglasses.html', category: 'Webcam AR' },
    { name: 'AR Wiener Storm', path: 'ar-wiener-storm.html', category: 'Webcam AR' },
    { name: 'Head Tracked Window', path: 'head-tracked-window.html', category: 'Webcam AR' },
    // Controls
    { name: 'First Person Teleport', path: 'first-person-teleport.html', category: 'Controls' },
    { name: 'First Person Controller', path: 'first-person-controller.html', category: 'Controls' },
    // Graphics
    { name: 'Basic Shapes', path: 'basic-shapes.html', category: 'Graphics' },
    { name: 'Basic Particles', path: 'basic-particles.html', category: 'Graphics' },
    { name: 'GLB Loader', path: 'glb-loader.html', category: 'Graphics' },
    { name: 'Shadow Cascades', path: 'shadow-cascades.html', category: 'Graphics' },
    { name: 'Video Texture', path: 'video-texture.html', category: 'Graphics' },
    { name: 'Video Recorder', path: 'video-recorder.html', category: 'Graphics' },
    // Animation
    { name: 'GLB Animation', path: 'glb-animation.html', category: 'Animation' },
    { name: 'Robot Arm', path: 'robot-arm.html', category: 'Animation' },
    { name: 'Tweening', path: 'tweening.html', category: 'Animation' },
    // Physics
    { name: 'Basic Physics', path: 'basic-physics.html', category: 'Physics' },
    { name: 'Physics Cluster', path: 'physics-cluster.html', category: 'Physics' },
    { name: 'Physics Joints', path: 'physics-joints.html', category: 'Physics' },
    { name: 'Ragdoll', path: 'ragdoll.html', category: 'Physics' },
    { name: 'Vehicle Physics', path: 'vehicle-physics.html', category: 'Physics' },
    // Sound
    { name: 'Basic Sound', path: 'basic-sound.html', category: 'Sound' },
    { name: 'Positional Sound', path: 'positional-sound.html', category: 'Sound' },
    // UI & Text
    { name: '2D Screen', path: '2d-screen.html', category: 'UI & Text' },
    { name: 'Text', path: 'text.html', category: 'UI & Text' },
    { name: '3D Text', path: '3d-text.html', category: 'UI & Text' },
    { name: 'Scroll View', path: 'scroll-view.html', category: 'UI & Text' },
    { name: 'UI Layout', path: 'ui-layout.html', category: 'UI & Text' }
];
