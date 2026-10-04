/**
 * Page glue for scroll-story.html: the scroll position is the timeline.
 *
 * The page's beats - the elements with data-shot - are its keyframes, each reached when it
 * crosses the middle of the screen. Between two beats, the cameraRail script carries the camera
 * from one shot to the next and settles it there, clipScrubber holds the model's clip at a time
 * between the beats' data-time, the page's own iris closes or opens by their data-veil, and the
 * back soft box comes up or down by their data-softbox. A beat can name a different shot for tall
 * screens with data-shot-portrait, though the rail already reframes every shot for them.
 *
 * Scrolling is never taken over. The stage follows a smoothed copy of the scroll position, so
 * the camera eases after the page rather than jumping with it, and with reduced motion it cuts
 * from shot to shot instead of flying between them.
 */
import { Color, Vec3, math } from 'playcanvas';

import { whenReady } from '@playcanvas/web-components';

const root = document.documentElement;
const stage = document.querySelector('.stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const portrait = window.matchMedia('(max-aspect-ratio: 4/5)');

const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// --- the timeline, read off the page ----------------------------------------------------------

const beats = [...document.querySelectorAll('[data-shot]')].map(el => ({
    el,
    shot: el.dataset.shot,
    shotPortrait: el.dataset.shotPortrait ?? el.dataset.shot,
    time: Number(el.dataset.time ?? 0),
    veil: Number(el.dataset.veil ?? 0),
    softbox: Number(el.dataset.softbox ?? 0),
    y: 0
}));

/** Puts each beat at the scroll position where it crosses the middle of the screen. */
const measure = () => {
    // the stage is sized to the large viewport, so a phone's URL bar coming and going does not
    // move the beats
    const middle = stage.clientHeight / 2;
    const max = Math.max(root.scrollHeight - window.innerHeight, 1);
    let previous = -Infinity;
    for (const beat of beats) {
        const top = beat.el.getBoundingClientRect().top + window.scrollY;
        // strictly increasing, so no span of the timeline is ever empty
        beat.y = Math.max(math.clamp(top - middle, 0, max), previous + 1);
        previous = beat.y;
    }
};

/**
 * Finds the span of the timeline a scroll position falls in.
 *
 * @param {number} y - A scroll position.
 * @returns {{ i: number, u: number }} The span's first beat, and how far along the span y is.
 */
const locate = (y) => {
    const last = beats.length - 1;
    if (last < 1 || y <= beats[0].y) {
        return { i: 0, u: 0 };
    }
    if (y >= beats[last].y) {
        return { i: last - 1, u: 1 };
    }
    let i = 0;
    while (i < last - 1 && y >= beats[i + 1].y) {
        i++;
    }
    return { i, u: (y - beats[i].y) / (beats[i + 1].y - beats[i].y) };
};

// --- the page's iris --------------------------------------------------------------------------

// The model's iris, to the same numbers: blade radii and pin placement from the generator, scaled
// so wide open the opening clears the screen's corners. Closed is the angle the generator solved
// for - where the nine blades leave no gap.
const IRIS = { open: 0.0125, outer: 0.0165, pivot: 0.015, span: 44, pin: 42, extra: 2, closed: 51 };
const veilSvg = document.querySelector('.iris-veil');
const blades = [];
{
    const scale = 1.02 / IRIS.open;
    const rad = Math.PI / 180;
    const point = (r, a) => `${(r * scale * Math.cos(a)).toFixed(4)} ${(-r * scale * Math.sin(a)).toFixed(4)}`;
    for (let k = 8; k >= 0; k--) {
        const alpha = (2 * Math.PI * k) / 9;
        const inner = [];
        const outer = [];
        for (let j = 0; j <= 24; j++) {
            inner.push(point(IRIS.open, alpha + IRIS.span * rad * ((2 * j) / 24 - 1)));
            outer.push(point(IRIS.outer * 1.12, alpha + (IRIS.span + IRIS.extra) * rad * (1 - (2 * j) / 24)));
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${inner.join('L')}L${outer.join('L')}Z`);
        veilSvg.append(path);
        const pivot = point(IRIS.pivot, alpha + IRIS.pin * rad).split(' ');
        blades.push({ path, px: pivot[0], py: pivot[1] });
    }
}

let veilShown = -1;
const showVeil = (veil) => {
    const v = Math.round(veil * 1000) / 1000;
    if (v === veilShown) {
        return;
    }
    veilShown = v;
    veilSvg.style.visibility = v <= 0 ? 'hidden' : 'visible';
    // the blades turn clockwise as seen from the front, the same way as the lens's
    for (const blade of blades) {
        blade.path.setAttribute('transform', `rotate(${(IRIS.closed * v).toFixed(3)} ${blade.px} ${blade.py})`);
    }
};

// --- the stage --------------------------------------------------------------------------------

const { app } = await whenReady('pc-app');
const [railElement, scrubberElement, modelElement, cameraElement] = await Promise.all([
    whenReady('pc-script-instance[name="cameraRail"]'),
    whenReady('pc-script-instance[name="clipScrubber"]'),
    whenReady('#loci-model'),
    whenReady('#camera')
]);
const rail = railElement.script;
const scrubber = scrubberElement.script;
const model = modelElement.entity;
const camera = cameraElement.entity;

const shotIds = [...new Set(beats.flatMap(b => [b.shot, b.shotPortrait]))];
await Promise.all(shotIds.map(id => whenReady(`#${id}`)));
const assignShots = () => {
    rail.shots = beats.map(b => document.getElementById(portrait.matches ? b.shotPortrait : b.shot).entity);
};
assignShots();
portrait.addEventListener('change', assignShots);

measure();
new ResizeObserver(measure).observe(document.body);
window.addEventListener('resize', measure);

// The back soft box is a lighting cue: it comes up for the glass and goes down again, its face
// and its light together, from the levels the markup gives them. The same cue is the glass's:
// coated, the lens is dark to look into - what the aperture chapter needs - and with the soft
// box up the loose elements reflect like bare glass in a studio, which is how they read.
const softboxFace = document.getElementById('softbox');
const softboxLight = document.querySelector('pc-entity[name="softbox"] pc-light');
const softboxLevels = { face: softboxFace.emissiveIntensity, light: softboxLight.intensity };
let glass = null;
let softboxShown = -1;
const cueSoftbox = (level) => {
    const v = Math.round(level * 200) / 200;
    if (v === softboxShown || !glass) {
        return;
    }
    softboxShown = v;
    softboxFace.emissiveIntensity = softboxLevels.face * v;
    softboxLight.intensity = softboxLevels.light * v;
    for (const { material, coated } of glass) {
        material.specularityFactor = math.lerp(coated, 1, v);
        material.update();
    }
};

let shownScroll = window.scrollY;
let clipTime = 0;

app.on('frameupdate', (ms) => {
    const dt = Math.min(ms / 1000, 0.1);
    const target = window.scrollY;
    if (reducedMotion.matches) {
        shownScroll = target;
    } else {
        shownScroll += (target - shownScroll) * (1 - Math.exp(-dt * 7));
        if (Math.abs(target - shownScroll) < 0.1) {
            shownScroll = target;
        }
    }
    const { i, u } = locate(shownScroll);
    const next = beats[Math.min(i + 1, beats.length - 1)];
    rail.position = reducedMotion.matches ? i + Math.round(u) : i + u;
    clipTime = math.lerp(beats[i].time, next.time, u);
    scrubber.time = clipTime;
    showVeil(math.lerp(beats[i].veil, next.veil, smoothstep(u)));
    cueSoftbox(math.lerp(beats[i].softbox, next.softbox, smoothstep(u)));
});

// --- labels on the glass ------------------------------------------------------------------------

const callouts = [...document.querySelectorAll('.callout')].map((el) => {
    const [from, to] = el.dataset.time.split(' ').map(Number);
    return { el, name: el.dataset.anchor, from, to, node: null, shown: -1 };
});
const screen = new Vec3();

/**
 * How far a point on screen is inside the part of the frame a label may use: clear of the edges,
 * and on wide screens out of the half the copy is in.
 *
 * @param {number} x - Screen x, CSS pixels.
 * @param {number} y - Screen y, CSS pixels.
 * @returns {number} 0 outside, rising to 1 a little way in.
 */
const labelRoom = (x, y) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let room = Math.min(smoothstep((x - 24) / 40), smoothstep((w - 24 - x) / 40), smoothstep((y - 120) / 40), smoothstep((h - 40 - y) / 40));
    if (w > 760) {
        const side = root.dataset.side;
        room = Math.min(room, side === 'right' ? smoothstep((w * 0.56 - x) / 60) : smoothstep((x - w * 0.44) / 60));
    }
    return room;
};

const placeCallouts = () => {
    for (const c of callouts) {
        c.node ??= model.findByName(c.name);
        let fade = c.node ? Math.min(smoothstep((clipTime - c.from) / 0.3), smoothstep((c.to - clipTime) / 0.3)) : 0;
        if (fade > 0) {
            camera.camera.worldToScreen(c.node.getPosition(), screen);
            fade *= screen.z > 0 ? labelRoom(screen.x, screen.y) : 0;
            c.el.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
            // near the right edge, the label hangs to the left of its leader
            c.el.classList.toggle('flip', screen.x > window.innerWidth - 240);
        }
        const o = Math.round(fade * 100) / 100;
        if (o !== c.shown) {
            c.shown = o;
            c.el.style.setProperty('--o', String(o));
        }
    }
};

// --- chapters -----------------------------------------------------------------------------------

const chapters = [...document.querySelectorAll('.chapter')];
const navLinks = [...document.querySelectorAll('.chapters a')];
const railItems = [...document.querySelectorAll('.progress li')];
let activeId = null;

const markChapter = () => {
    const middle = window.innerHeight / 2;
    const current = chapters.find((c) => {
        const r = c.getBoundingClientRect();
        return r.top <= middle && r.bottom > middle;
    });
    const id = current?.id ?? null;
    if (id === activeId) {
        return;
    }
    if (activeId !== null && id !== null) {
        play('whoosh', 0.9 + Math.random() * 0.15);
    }
    activeId = id;
    // the shade darkens the side of the frame the copy is on - the hero's is the left
    root.dataset.side = current?.dataset.side ?? 'left';
    for (const c of chapters) {
        c.classList.toggle('is-active', c.id === id);
    }
    for (const a of navLinks) {
        a.classList.toggle('is-active', a.hash === `#${id}`);
    }
    for (const li of railItems) {
        li.classList.toggle('is-active', li.dataset.for.split(' ').includes(id));
    }
};

// --- finishes -------------------------------------------------------------------------------------

// The finish is the body's aluminum: its anodized color, and the chamfers' cut metal under it
const FINISHES = {
    graphite: { body: '#4a4b4f', chamfer: '#e9e9ec' },
    silver: { body: '#c9cacd', chamfer: '#f4f4f6' },
    sand: { body: '#b59a77', chamfer: '#f3e2c6' }
};
let finishMaterials = null;
const finish = { from: null, to: null, t: 1 };

const materialsNamed = (name) => {
    const found = new Set();
    for (const render of model.findComponents('render')) {
        for (const mi of render.meshInstances) {
            if (mi.material?.name === name) {
                found.add(mi.material);
            }
        }
    }
    return [...found];
};

const blendFinish = (dt) => {
    if (finish.t >= 1 || !finishMaterials) {
        return;
    }
    finish.t = Math.min(1, finish.t + dt / 0.8);
    const e = smoothstep(finish.t);
    for (const [key, materials] of Object.entries(finishMaterials)) {
        const color = new Color().lerp(finish.from[key], finish.to[key], e);
        for (const m of materials) {
            m.diffuse.copy(color);
            m.update();
        }
    }
};

const toColors = name => ({ body: new Color().fromString(FINISHES[name].body), chamfer: new Color().fromString(FINISHES[name].chamfer) });

for (const input of document.querySelectorAll('input[name="finish"]')) {
    input.addEventListener('change', () => {
        if (!finishMaterials) {
            return;
        }
        const current = finishMaterials.body[0].diffuse;
        finish.from = { body: current.clone(), chamfer: finishMaterials.chamfer[0].diffuse.clone() };
        finish.to = toColors(input.value);
        finish.t = 0;
    });
}

// --- sound ----------------------------------------------------------------------------------------

// Off until asked for. The first time it is turned on, the ambient bed's lazy asset is assigned,
// which loads it - listen() starts it once it has - and the two loops start, silent: their levels
// follow the lens from then on.
const soundToggle = document.querySelector('.sound-toggle');
const sound = (await whenReady('pc-sound')).component;
const ambience = document.querySelector('pc-sound-slot[name="ambience"]');
let soundOn = false;
let ambienceStarted = false;
app.systems.sound.volume = 0;

const play = (name, pitch = 1) => {
    if (soundOn) {
        const instance = sound.play(name);
        if (instance) {
            instance.pitch = pitch;
        }
    }
};

soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    app.systems.sound.volume = soundOn ? 1 : 0;
    if (soundOn && !ambience.asset) {
        ambience.asset = 'snd-ambience';
        sound.play('servo');
        sound.play('blades');
    }
});

for (const el of document.querySelectorAll('.chapters a, .button, .finishes label, .brand')) {
    el.addEventListener('pointerenter', () => play('tick', 0.95 + Math.random() * 0.1));
}

// The loops' levels follow how fast the scroll moves the parts they belong to: clip seconds per
// second, inside the stretch of the clip where those parts move
const loops = { servo: { level: 0, from: 3.0, to: 7.6, full: 1.2, volume: 0.55 }, blades: { level: 0, from: 7.3, to: 8.9, full: 0.8, volume: 0.6 } };
// Detents: a click for every stop a control turns through, read off the model's own nodes
const detents = [
    { name: 'shutter-dial', axis: 'y', step: 12, pitch: 1 },
    { name: 'exposure-dial', axis: 'y', step: 12, pitch: 1.12 },
    { name: 'aperture-ring', axis: 'z', step: 10, pitch: 0.9 }
].map(d => ({ ...d, node: null, stop: null }));
let lastClip = 0;

const listen = (dt) => {
    if (!ambienceStarted && sound.slot('ambience')?.isLoaded) {
        ambienceStarted = true;
        sound.play('ambience');
    }
    const rate = dt > 0 ? Math.abs(clipTime - lastClip) / dt : 0;
    for (const [name, loop] of Object.entries(loops)) {
        const target = clipTime > loop.from && clipTime < loop.to ? Math.min(rate / loop.full, 1) : 0;
        // quick to rise, slower to fall, like a motor spinning down
        loop.level += (target - loop.level) * (1 - Math.exp(-dt * (target > loop.level ? 14 : 4)));
        const slot = sound.slot(name);
        if (slot) {
            slot.volume = loop.volume * loop.level;
            slot.pitch = 0.85 + 0.3 * loop.level;
        }
    }
    for (const d of detents) {
        d.node ??= model.findByName(d.name);
        if (!d.node) {
            continue;
        }
        const stop = Math.round(d.node.getLocalEulerAngles()[d.axis] / d.step);
        if (d.stop !== null && stop !== d.stop) {
            play('dial', d.pitch * (0.97 + Math.random() * 0.06));
        }
        d.stop = stop;
    }
    // the shutter fires as the iris closes
    if (lastClip < 8.7 && clipTime >= 8.7) {
        play('shutter');
    }
    lastClip = clipTime;
};

// --- a living frame -------------------------------------------------------------------------------

// The rail places the camera exactly; on top of that it breathes - a slow sway, as if hand-held on
// a slider - and leans a degree toward the pointer. Neither happens with reduced motion, and the
// lean only follows a mouse.
const lean = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
        lean.tx = (e.clientX / window.innerWidth) * 2 - 1;
        lean.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }
});
let clock = 0;
const breathe = (dt) => {
    if (reducedMotion.matches) {
        return;
    }
    clock += dt;
    const k = 1 - Math.exp(-dt * 2.5);
    lean.x += (lean.tx - lean.x) * k;
    lean.y += (lean.ty - lean.y) * k;
    const yaw = 0.35 * Math.sin(clock * 0.31) - 0.9 * lean.x;
    const pitch = 0.2 * Math.sin(clock * 0.23 + 1.3) - 0.5 * lean.y;
    camera.rotateLocal(pitch, yaw, 0);
};

// --- lights up ------------------------------------------------------------------------------------

// As the intro lifts, the studio powers up a light at a time: the practical bar flickers on like a
// tube, then the top strip, the key, the fill and the reflections. Each comes up to the level its
// markup gives it.
const FLICKER = [0, 1, 0.08, 0.7, 0.15, 1];
const powerUp = [
    { el: document.querySelector('pc-entity[name="bar-right"] pc-light'), prop: 'intensity', delay: 0.15, duration: 0.7, flicker: true },
    { el: document.getElementById('light-bar'), prop: 'emissiveIntensity', delay: 0.15, duration: 0.7, flicker: true },
    { el: document.querySelector('pc-entity[name="top-strip"] pc-light'), prop: 'intensity', delay: 0.9, duration: 1.2 },
    { el: document.querySelector('pc-entity[name="key"] pc-light'), prop: 'intensity', delay: 1.3, duration: 1.6 },
    { el: document.querySelector('pc-entity[name="fill"] pc-light'), prop: 'intensity', delay: 1.7, duration: 1.6 },
    { el: document.querySelector('pc-sky'), prop: 'intensity', delay: 1.5, duration: 2 }
].map(p => ({ ...p, full: p.el[p.prop] }));
let poweredFor = reducedMotion.matches ? Infinity : -1;
for (const p of powerUp) {
    if (poweredFor < 0) {
        p.el[p.prop] = 0;
    }
}
const lightsUp = (dt) => {
    if (poweredFor === Infinity || poweredFor < 0) {
        return;
    }
    poweredFor += dt;
    let done = true;
    for (const p of powerUp) {
        const t = math.clamp((poweredFor - p.delay) / p.duration, 0, 1);
        done &&= t >= 1;
        const level = p.flicker && t < 1 ? FLICKER[Math.floor(t * FLICKER.length)] : smoothstep(t);
        p.el[p.prop] = p.full * level;
    }
    if (done) {
        poweredFor = Infinity;
    }
};

// --- every frame, once the pose is final --------------------------------------------------------

let framesWithModel = 0;
app.on('update', (dt) => {
    breathe(dt);
    if (!finishMaterials && model.findByName('E1')) {
        finishMaterials = { body: materialsNamed('Body Aluminum'), chamfer: materialsNamed('Polished Chamfer') };
        glass = Array.from({ length: 12 }, (_, k) => materialsNamed(`Glass E${k + 1}`))
        .flat()
        .map(material => ({ material, coated: material.specularityFactor }));
    }
    // lift the intro once the model has been on screen for a couple of frames, and power up
    if (finishMaterials && framesWithModel < 3 && ++framesWithModel === 3) {
        root.classList.add('is-loaded');
        poweredFor = Math.max(poweredFor, 0);
    }
    lightsUp(dt);
    placeCallouts();
    markChapter();
    blendFinish(dt);
    listen(dt);
});

for (const input of document.querySelectorAll('input[name="finish"]')) {
    input.addEventListener('change', () => play('dial', 0.8));
}
for (const button of document.querySelectorAll('.button')) {
    button.addEventListener('click', () => play('shutter'));
}
