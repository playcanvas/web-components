/**
 * Page glue for model-inspector.html.
 *
 * The 3D side of this example is entirely declarative: the drone's parts are `pc-node` elements
 * in the page, and the two states a part can be in are `pc-material` elements. So all this
 * module does is what page glue should do - read the manifest out of the DOM, wire DOM events,
 * and write attributes back:
 *
 * - `material-overrides` swaps a part's material for a highlight, and REMOVING the attribute
 *   restores whatever the GLB authored. No original materials are cached anywhere.
 * - `position` moves a picked part to its exploded pose. Every part is authored on the model
 *   origin, so the offset in `data-explode` is the position override outright, and removing the
 *   attribute returns the part to the assembled pose.
 * - `pc-model.hierarchy()` supplies each part's material name and its path in the node tree, so
 *   the panel reports the asset rather than a hard-coded list.
 */
import { whenReady } from '@playcanvas/web-components';

/**
 * Selects mesh instance 0 - every part in this asset has exactly one. Only hover recolours a
 * part; a picked part keeps its own material, since the explode and the panel already say which
 * one it is, and tinting it would hide the material the panel is reporting.
 */
const HOVER = '{"index:0": "hl-hover"}';

/** Per-frame approach fraction, and the offset in metres at which a part counts as arrived. */
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = REDUCED_MOTION ? 1 : 0.16;
const SETTLED = 0.0002;

const STYLES = `
.mi-panel {
    position: fixed;
    top: max(16px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    width: 244px;
    padding: 15px 17px 17px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    background: rgba(16, 17, 19, 0.68);
    backdrop-filter: blur(22px) saturate(1.35);
    -webkit-backdrop-filter: blur(22px) saturate(1.35);
    /* Hairline top highlight reads as a bevelled glass edge over a dark scene */
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 14px 40px rgba(0, 0, 0, 0.5);
    font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #fff;
}

@supports not (backdrop-filter: blur(22px)) {
    .mi-panel { background: rgba(16, 17, 19, 0.93); }
}

.mi-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
}

/* Picks up the drone's own accent trim colour */
.mi-head::before {
    content: "";
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ff6a00;
    box-shadow: 0 0 8px rgba(255, 106, 0, 0.7);
}

.mi-title {
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.mi-meta {
    margin: 3px 0 0 13px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
}

.mi-part {
    margin-top: 13px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
    /* Pinned to the tallest state - the part readout - so merely sweeping the pointer over the
       model can never nudge the buttons underneath. .mi-trail holds its line for the same
       reason, keeping top-level and nested parts the same height. */
    min-height: 86px;
}

/* The hint is shorter than the readout, so centre it in the reserved box rather than leaving
   a gap that reads as an unfinished card */
.mi-part.is-idle {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

/* Hovering previews a part; the dimming says "not selected yet" without extra copy */
.mi-part.is-preview { opacity: 0.6; }

.mi-part.is-enter { animation: mi-enter 0.18s ease both; }

@keyframes mi-enter {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: none; }
}

/* Holds its line even when a top-level part has no ancestors, so all picked parts align */
.mi-trail {
    min-height: 13px;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.32);
}

.mi-label {
    font-size: 15px;
    font-weight: 550;
    letter-spacing: -0.01em;
}

.mi-spec {
    margin-top: 2px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
}

.mi-hint {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
}

.mi-hint b {
    font-weight: 550;
    color: rgba(255, 255, 255, 0.72);
}

.mi-tip {
    margin-top: 7px;
    color: rgba(255, 255, 255, 0.3);
}

.mi-tip kbd {
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.09);
    font-family: inherit;
    font-size: 10.5px;
}

.mi-material {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 3px 8px 3px 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.8);
}

/* The part's real colour, read off the instantiated material */
.mi-swatch {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.mi-actions {
    display: flex;
    gap: 7px;
    margin-top: 14px;
}

.mi-actions button {
    height: 33px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, opacity 0.15s;
}

.mi-explode {
    flex: 1.7;
    border-color: rgba(255, 133, 51, 0.45) !important;
    background: rgba(255, 106, 0, 0.17) !important;
}

.mi-reset { flex: 1; }

.mi-explode:hover {
    background: rgba(255, 106, 0, 0.3) !important;
    border-color: rgba(255, 133, 51, 0.8) !important;
}

.mi-reset:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.13);
    border-color: rgba(255, 255, 255, 0.26);
}

.mi-actions button:focus-visible {
    outline: 2px solid #ff8533;
    outline-offset: 2px;
}

.mi-reset:disabled { opacity: 0.38; cursor: default; }

/* Keep clear of the example harness's buttons once the viewport gets short */
@media (max-height: 460px) {
    .mi-panel { display: none; }
}
`;

const model = await whenReady('pc-model');

/** The parts, in document order - the manifest authored in the HTML. */
const parts = [...model.querySelectorAll('pc-node[data-label]')];
const labels = new Map(parts.map(part => [part.getAttribute('name'), part.dataset.label]));

/**
 * The material name and node path of each part, straight from the instantiated asset, so the
 * panel never repeats what the GLB already knows. Both are indexed by node name, which is what
 * a `pc-node` binds by.
 */
const materials = new Map();
const paths = new Map();
const collect = (node) => {
    if (node.materials.length > 0) {
        materials.set(node.name, node.materials[0].name ?? 'none');
    }
    paths.set(node.name, node.path);
    node.children.forEach(collect);
};
const tree = model.hierarchy();
if (tree) {
    collect(tree);
}

// Wait for every pc-node to bind before reading colours off the live materials, and do it before
// any override can be applied, so these are the asset's own values.
await Promise.all(parts.map(part => part.ready()));

const channel = v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

/**
 * The average colour of a texture, by letting the canvas downscale it to a single pixel. Needed
 * for a textured part, whose diffuse factor is plain white and so says nothing about how it
 * looks. Texture bytes are already sRGB, as the material colours below are.
 *
 * @param {object} texture - The engine texture to sample.
 * @returns {string | null} The colour as CSS, or `null` if the source cannot be read.
 */
const sampleTexture = (texture) => {
    const source = texture.getSource?.();
    if (!source) return null;
    const scratch = document.createElement('canvas');
    scratch.width = 1;
    scratch.height = 1;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try {
        ctx.drawImage(source, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `#${channel(r / 255)}${channel(g / 255)}${channel(b / 255)}`;
    } catch {
        return null; // a source the canvas will not take; fall back to the diffuse factor
    }
};

/**
 * A part's own colour as CSS. StandardMaterial colours are already gamma-space - the glTF loader
 * converts baseColorFactor out of linear on the way in - so these go straight to CSS. Encoding
 * them again washes every swatch out.
 */
const swatches = new Map();
for (const part of parts) {
    const material = part.entity?.render?.meshInstances?.[0]?.material;
    if (!material) continue;
    const emissive = material.emissive;
    // An emissive part (the nav lights) is its emissive colour, not its near-black base
    const lit = emissive && emissive.r + emissive.g + emissive.b > 0.25;
    const c = lit ? emissive : material.diffuse;
    const factor = `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
    swatches.set(part, !lit && material.diffuseMap
        ? sampleTexture(material.diffuseMap) ?? factor
        : factor);
}

// ---------------------------------------------------------------------------- panel

const style = document.createElement('style');
style.textContent = STYLES;
document.head.appendChild(style);

const panel = document.createElement('div');
panel.classList.add('mi-panel');
panel.innerHTML = `
    <div class="mi-head"><span class="mi-title">Camera Drone</span></div>
    <div class="mi-meta">${parts.length} parts &middot; ${new Set(materials.values()).size} materials</div>
    <div class="mi-part" aria-live="polite"></div>
    <div class="mi-actions">
        <button type="button" class="mi-explode">Explode all</button>
        <button type="button" class="mi-reset">Reset</button>
    </div>
`;
const detail = panel.querySelector('.mi-part');
const explodeButton = panel.querySelector('.mi-explode');
const resetButton = panel.querySelector('.mi-reset');
document.body.appendChild(panel);

/**
 * Fills the details panel from a part's own data attributes, or shows the hint when nothing is
 * picked or previewed.
 *
 * @param {HTMLElement | null} part - The `pc-node` to describe, or `null`.
 * @param {boolean} [preview] - Whether this is a hover preview rather than a selection.
 */
const describe = (part, preview = false) => {
    detail.classList.toggle('is-preview', preview);
    detail.classList.toggle('is-idle', !part);
    // Reset tracks what is actually reversible, not what the panel happens to be showing - a
    // hover preview has selected nothing
    resetButton.disabled = !picked && !explodeAll;

    if (!part) {
        detail.innerHTML = '<p class="mi-hint">Hover a part to highlight it. <b>Click</b> to pull it out of the assembly.</p>' +
            '<p class="mi-hint mi-tip"><kbd>Esc</kbd> puts everything back.</p>';
    } else {
        const name = part.getAttribute('name');
        // Ancestors of the bound node, as authored labels - the root has none, so it drops out
        const trail = (paths.get(name) ?? '').split('/').slice(0, -1)
            .map(ancestor => labels.get(ancestor))
            .filter(Boolean)
            .join(' › ');
        detail.innerHTML = `
            <div class="mi-trail"></div>
            <div class="mi-label"></div>
            <div class="mi-spec"></div>
            <span class="mi-material"><span class="mi-swatch"></span><span class="mi-material-name"></span></span>
        `;
        detail.querySelector('.mi-trail').textContent = trail;
        detail.querySelector('.mi-label').textContent = part.dataset.label;
        detail.querySelector('.mi-spec').textContent = part.dataset.spec;
        detail.querySelector('.mi-material-name').textContent = materials.get(name) ?? 'unknown';
        detail.querySelector('.mi-swatch').style.backgroundColor = swatches.get(part) ?? 'transparent';
    }

    // Re-trigger the entry animation, but not for hover previews - sweeping the pointer across
    // the model would otherwise flicker the panel
    detail.classList.remove('is-enter');
    if (!preview) {
        void detail.offsetWidth;
        detail.classList.add('is-enter');
    }
};

// ---------------------------------------------------------------------------- explode

/** Where each part is right now, and where `data-explode` says it goes when picked. */
const HOME = Object.freeze({ x: 0, y: 0, z: 0 });
const offset = new Map(parts.map(part => [part, { x: 0, y: 0, z: 0 }]));
const exploded = new Map(parts.map((part) => {
    const [x, y, z] = part.dataset.explode.split(' ').map(Number);
    return [part, { x, y, z }];
}));

let picked = null;
let hovered = null;
let explodeAll = false;
let frame = 0;

/**
 * Puts the hover tint on the hovered part and nowhere else - never on the picked part, which
 * shows its own material so the panel's material readout and swatch describe what you can see.
 *
 * Expressed as one invariant over every part rather than as add/remove calls in each handler,
 * because the pointer is still resting on a part at the moment it is picked (and at the moment
 * it is un-picked), so the two states have to be reconciled, not toggled independently.
 */
const syncHighlight = () => {
    for (const part of parts) {
        if (part === hovered && part !== picked) {
            part.setAttribute('material-overrides', HOVER);
        } else {
            part.removeAttribute('material-overrides');
        }
    }
};

const tick = () => {
    frame = 0;
    let moving = false;

    for (const part of parts) {
        const to = part === picked || explodeAll ? exploded.get(part) : HOME;
        const at = offset.get(part);

        at.x += (to.x - at.x) * EASE;
        at.y += (to.y - at.y) * EASE;
        at.z += (to.z - at.z) * EASE;

        const remaining =
            Math.abs(to.x - at.x) + Math.abs(to.y - at.y) + Math.abs(to.z - at.z);
        if (remaining > SETTLED) {
            part.setAttribute('position', `${at.x.toFixed(4)} ${at.y.toFixed(4)} ${at.z.toFixed(4)}`);
            moving = true;
        } else if (to === HOME) {
            // Arrived home: drop the override so the asset's own transform is back in force
            at.x = at.y = at.z = 0;
            part.removeAttribute('position');
        } else {
            Object.assign(at, to);
            part.setAttribute('position', `${to.x} ${to.y} ${to.z}`);
        }
    }

    if (moving) {
        frame = requestAnimationFrame(tick);
    }
};

const animate = () => {
    if (!frame) {
        frame = requestAnimationFrame(tick);
    }
};

/**
 * Picks a part, or clears the selection when passed `null`. The previous pick loses its
 * highlight and travels back to the assembled pose.
 *
 * @param {HTMLElement | null} part - The `pc-node` to pick, or `null` to clear.
 */
const pick = (part) => {
    if (picked === part) {
        part = null; // clicking the picked part again puts it back
    }
    picked = part;
    // The pointer is still on this part, so its hover tint is live - drop it, and give the tint
    // back to a part that has just been un-picked from under the pointer
    syncHighlight();
    describe(picked);
    animate();
};

/**
 * Sends every part to its exploded pose at once, or brings the whole assembly back.
 *
 * @param {boolean} value - Whether the assembly should be exploded.
 */
const setExplodeAll = (value) => {
    explodeAll = value;
    explodeButton.textContent = explodeAll ? 'Collapse' : 'Explode all';
    explodeButton.setAttribute('aria-pressed', String(explodeAll));
    resetButton.disabled = !explodeAll && !picked;
    animate();
};

// ---------------------------------------------------------------------------- wiring

for (const part of parts) {
    // pc-node is an ordinary custom element, so these are ordinary DOM listeners - the same
    // events the onpointerenter/onclick attributes would run
    part.addEventListener('pointerenter', () => {
        hovered = part;
        syncHighlight();
        // Once something is picked the panel stays on it, so moving the pointer around does not
        // flicker the readout
        if (!picked) describe(part, true);
    });
    part.addEventListener('pointerleave', () => {
        if (hovered !== part) return;
        hovered = null;
        syncHighlight();
        if (!picked) describe(null);
    });
    part.addEventListener('click', () => pick(part));
}

const reset = () => {
    setExplodeAll(false);
    pick(null);
};

explodeButton.addEventListener('click', () => setExplodeAll(!explodeAll));
resetButton.addEventListener('click', reset);
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        reset();
    }
});

explodeButton.setAttribute('aria-pressed', 'false');
describe(null);
