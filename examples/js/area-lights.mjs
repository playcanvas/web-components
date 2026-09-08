/**
 * Page glue for area-lights.html.
 *
 * The rig's 19 light bars are all the same bar, so the page declares it once, as a `<template>`,
 * and this module stamps out a clone for each pair of joints listed below: it names the bar,
 * points its lightBar script at the two joints and sizes the housing, tube and light to the bar's
 * length. The clones go under the entity carrying the lightShow script, which gathers the bars
 * it finds there before its show starts.
 *
 * The panel's one control rewrites the `shape` attribute of every shaped light in the page, so a
 * reader can see what the area lights are doing by taking them away.
 */
import { whenReady } from '@playcanvas/web-components';

/**
 * Which two joints each bar hangs between, and its length in meters where it is not the default
 * 1.8 m. The list runs from the back row forward, which is the order the show switches them on.
 *
 * @type {[string, string, number?][]}
 */
const BARS = [
    ['r1-j2', 'r1-j4', 2.6],
    ['r1-j2', 'r2-j1'],
    ['r1-j2', 'r2-j3'],
    ['r1-j4', 'r2-j3'],
    ['r1-j4', 'r2-j5'],
    ['r2-j1', 'r3-j2'],
    ['r2-j3', 'r3-j2'],
    ['r2-j3', 'r3-j4'],
    ['r2-j5', 'r3-j4'],
    ['r3-j2', 'r4-j1'],
    ['r3-j2', 'r4-j3'],
    ['r3-j4', 'r4-j3'],
    ['r3-j4', 'r4-j5'],
    ['r4-j1', 'r5-j2'],
    ['r4-j3', 'r5-j2'],
    ['r4-j3', 'r5-j4'],
    ['r4-j5', 'r5-j4'],
    ['r5-j2', 'r6-j1'],
    ['r5-j4', 'r6-j1']
];

const template = document.getElementById('bar-template');
const bars = document.getElementById('light-bars');
const toggle = document.getElementById('area-lights-toggle');

await whenReady('pc-scene');

BARS.forEach(([pointA, pointB, length = 1.8], index) => {
    const fragment = template.content.cloneNode(true);
    const bar = fragment.querySelector('pc-entity');
    bar.setAttribute('name', `bar-${index + 1}`);

    const script = bar.querySelector('pc-script-instance[name="lightBar"]');
    script.setAttribute('point-a', `entity:${pointA}`);
    script.setAttribute('point-b', `entity:${pointB}`);

    // The housing is a box, so its thickness is the last two components; the tube and the light
    // are a plane and a rect light, sized by their x and z
    bar.querySelector('pc-entity[name="housing"]').setAttribute('scale', `${length} 0.1 0.1`);
    bar.querySelector('pc-entity[name="strip"]').setAttribute('scale', `${length} 1 0.1`);
    bar.querySelector('pc-entity[name="light"]').setAttribute('scale', `${length} 1 0.1`);

    bars.appendChild(fragment);
});

/**
 * An area light spreads its intensity over its surface; a punctual light of the same intensity
 * is that whole output from a single point, which reads about ten times as harsh. The fallback
 * is dimmed to match, so the comparison is about the size of the lights and not their power.
 */
const PUNCTUAL_SCALE = 0.1;

// Each light remembers what it was authored with, so the toggle can put it back
const shaped = [...document.querySelectorAll('pc-light[shape]')];
for (const light of shaped) {
    light.dataset.shape = light.getAttribute('shape');
    light.dataset.intensity = light.getAttribute('intensity') ?? '1';
}

toggle.addEventListener('change', () => {
    for (const light of shaped) {
        const area = toggle.checked;
        light.setAttribute('shape', area ? light.dataset.shape : 'punctual');
        light.setAttribute('intensity', area ? light.dataset.intensity : `${light.dataset.intensity * PUNCTUAL_SCALE}`);
    }
});
