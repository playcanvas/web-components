/**
 * Page glue for golden-meadow.html: the panel's controls.
 *
 * Every control works by setting an attribute on one of the page's elements, exactly as the page's
 * own markup does - a script instance's attributes are live, so the sky, the wind and the walk
 * follow along as they change.
 */
import { whenReady } from '@playcanvas/web-components';

const panel = document.querySelector('.meadow-panel');
const scene = document.querySelector('pc-scene');
const sky = document.querySelector('pc-script-instance[name="proceduralSky"]');
const wind = document.querySelector('pc-script-instance[name="meadowWind"]');
const glide = document.querySelector('pc-script-instance[name="meadowGlide"]');
const sunSlider = document.getElementById('sun-slider');
const sunValue = document.getElementById('sun-value');
const windSlider = document.getElementById('wind-slider');
const windValue = document.getElementById('wind-value');
const walkToggle = document.getElementById('walk-toggle');
const soundToggle = document.getElementById('sound-toggle');

/**
 * Names the time of day by how high the sun stands.
 *
 * @param {number} elevation - The sun's height above the horizon, in degrees.
 * @returns {string} The name.
 */
const timeOfDay = (elevation) => {
    if (elevation < 5) return 'Sunset';
    if (elevation < 15) return 'Golden hour';
    if (elevation < 28) return 'Afternoon';
    return 'Midday';
};

/**
 * Names the wind by its strength, after the Beaufort scale.
 *
 * @param {number} strength - How hard the wind blows, 0 to about 1.
 * @returns {string} The name.
 */
const windName = (strength) => {
    if (strength < 0.05) return 'Calm';
    if (strength < 0.3) return 'Light air';
    if (strength < 0.7) return 'Breeze';
    if (strength < 1) return 'Fresh breeze';
    return 'Strong wind';
};

/**
 * The exposure the scene is shot at with the sun at a given height: a camera stops down as the
 * day brightens, or the high sun would wash the meadow out.
 *
 * @param {number} elevation - The sun's height above the horizon, in degrees.
 * @returns {string} The exposure.
 */
const exposureFor = (elevation) => (1 / (1 + Math.max(elevation - 9, 0) * 0.05)).toFixed(3);

sunSlider.addEventListener('input', () => {
    const elevation = Number(sunSlider.value);
    sky.setAttribute('elevation', sunSlider.value);
    scene.setAttribute('exposure', exposureFor(elevation));
    sunValue.value = timeOfDay(elevation);
});

// The wind is heard as well as seen: meadowWind turns its sound up and down with its strength
windSlider.addEventListener('input', () => {
    wind.setAttribute('strength', windSlider.value);
    windValue.value = windName(Number(windSlider.value));
});

soundToggle.addEventListener('click', async () => {
    const on = soundToggle.getAttribute('aria-pressed') !== 'true';
    soundToggle.setAttribute('aria-pressed', String(on));
    const { app } = await whenReady('pc-app');
    app.systems.sound.volume = on ? 1 : 0;
});

walkToggle.addEventListener('click', () => {
    const walking = walkToggle.getAttribute('aria-pressed') !== 'true';
    walkToggle.setAttribute('aria-pressed', String(walking));
    glide.setAttribute('paused', String(!walking));
});

// Show the panel once the meadow is growing
await whenReady('pc-script-instance[name="meadowGrass"]');
panel.classList.add('ready');
