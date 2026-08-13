/**
 * The catalogue behind the example browser's sidebar. Categories appear in the order they first
 * occur here, and examples in the order they are listed within a category - both hand-authored,
 * running simplest first so a newcomer can read down a category.
 *
 * `examples[0]` is what the browser loads when there is no hash, so Showcases stays first.
 *
 * `name` is the single source of truth for a page's <title>, which must read
 * `PlayCanvas Web Components - ${name}`. test/examples/example-list.test.ts enforces that, and that
 * every example page in examples/ is listed here - an unlisted page is unreachable from the sidebar.
 */
export const examples = [
    // Showcases
    { name: 'Car Configurator', path: 'car-configurator.html', category: 'Showcases' },
    { name: 'Annotations', path: 'annotations.html', category: 'Showcases' },
    { name: 'Shoe Configurator', path: 'shoe-configurator.html', category: 'Showcases' },
    { name: 'Solar System', path: 'solar-system.html', category: 'Showcases' },
    { name: 'Falling Blocks', path: 'vibe-falling-blocks.html', category: 'Showcases' },
    // Getting Started
    { name: 'Spinning Cube', path: 'spinning-cube.html', category: 'Getting Started' },
    { name: 'Spinning Cube (DOM API)', path: 'spinning-cube-api.html', category: 'Getting Started' },
    { name: 'Spinning Cube (UMD)', path: 'spinning-cube-umd.html', category: 'Getting Started' },
    // Gaussian Splatting
    { name: 'Basic Splat', path: 'splat-simple.html', category: 'Gaussian Splatting' },
    { name: 'Splat Annotations', path: 'splat-annotations.html', category: 'Gaussian Splatting' },
    { name: 'Splat Flipbook', path: 'splat-flipbook.html', category: 'Gaussian Splatting' },
    // Webcam AR
    { name: 'AR Avatar', path: 'ar-avatar.html', category: 'Webcam AR' },
    { name: 'AR Hand Gestures', path: 'ar-hand-gestures.html', category: 'Webcam AR' },
    { name: 'AR Optic Blast', path: 'ar-optic-blast.html', category: 'Webcam AR' },
    { name: 'AR Sunglasses', path: 'ar-sunglasses.html', category: 'Webcam AR' },
    { name: 'Head Tracked Window', path: 'window-tracking.html', category: 'Webcam AR' },
    // Controls
    { name: 'First Person Teleport', path: 'first-person-teleport.html', category: 'Controls' },
    { name: 'First Person Controller', path: 'fps-controller.html', category: 'Controls' },
    // Graphics
    { name: 'Basic Shapes', path: 'basic-shapes.html', category: 'Graphics' },
    { name: 'Basic Particles', path: 'basic-particles.html', category: 'Graphics' },
    { name: 'GLB Loader', path: 'glb.html', category: 'Graphics' },
    { name: 'Video Texture', path: 'video-texture.html', category: 'Graphics' },
    { name: 'Video Recorder', path: 'video-recorder.html', category: 'Graphics' },
    // Animation
    { name: 'GLB Animation', path: 'animation.html', category: 'Animation' },
    { name: 'Tweening', path: 'tween.html', category: 'Animation' },
    // Physics
    { name: 'Basic Physics', path: 'physics.html', category: 'Physics' },
    { name: 'Physics Cluster', path: 'physics-cluster.html', category: 'Physics' },
    // Sound
    { name: 'Basic Sound', path: 'sound.html', category: 'Sound' },
    { name: 'Positional Sound', path: 'positional-sound.html', category: 'Sound' },
    // UI & Text
    { name: '2D Screen', path: 'screen.html', category: 'UI & Text' },
    { name: 'Text', path: 'text.html', category: 'UI & Text' },
    { name: '3D Text', path: 'text3d.html', category: 'UI & Text' },
    { name: 'Scroll View', path: 'ui-scroll-view.html', category: 'UI & Text' }
];
