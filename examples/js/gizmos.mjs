/**
 * Page glue for gizmos.html: a small scene editor built from the engine's gizmos.
 *
 * The scene is the page's markup, and the editor edits it in place. Selecting an entity - by
 * clicking it, the icon that stands in for a light or camera, or its row in the hierarchy -
 * attaches the gizmos that suit it:
 *
 * - TranslateGizmo, RotateGizmo or ScaleGizmo, whichever the toolbar has picked
 * - BoundingBoxGizmo around a shape, whose handles resize it when the Resize tool is picked
 * - LightGizmo on a light, whose handles drag its range and cone angles
 * - CameraGizmo on a camera, whose handles drag its clip planes and field of view
 *
 * An IconGizmo marks the lights and cameras that are not selected, and a ViewCube turns the
 * editor camera to look down an axis.
 *
 * Whatever a gizmo changes is written back to the attributes of the element it belongs to, so
 * the markup stays the scene. The panel in the corner shows the selected entity as it now stands
 * in the document.
 */
import {
    BoundingBoxGizmo,
    CameraGizmo,
    Gizmo,
    IconGizmo,
    LightGizmo,
    math,
    Picker,
    RotateGizmo,
    ScaleGizmo,
    TranslateGizmo,
    Vec3,
    Vec4,
    ViewCube
} from 'playcanvas';

import { whenReady } from '@playcanvas/web-components';

/** A press that travels further than this, in CSS pixels, orbits the camera and selects nothing. */
const CLICK_SLOP = 4;

/** The size of the viewport, in CSS pixels, at which a transform gizmo has its natural size. */
const GIZMO_VIEW_SIZE = 1024;

/** The largest a transform gizmo grows, as the gizmo's size factor, to make up for a small viewport. */
const GIZMO_MAX_SIZE = 2;

/** The aspect ratio below which the editor camera fits the scene to the width of the screen. */
const NARROW_ASPECT = 1.4;

/** The aspect ratio of a phone held upright. */
const PHONE_ASPECT = 0.5;

/** What dragging snaps to while snapping is on: world units, scale factors and degrees. */
const SNAP_LENGTH = 0.25;
const SNAP_ANGLE = 15;

/** The properties the light and camera gizmos edit, and the attributes that declare them. */
const LIGHT_ATTRIBUTES = {
    range: 'range',
    innerConeAngle: 'inner-cone-angle',
    outerConeAngle: 'outer-cone-angle'
};
const CAMERA_ATTRIBUTES = {
    fov: 'fov',
    nearClip: 'near-clip',
    farClip: 'far-clip',
    orthoHeight: 'ortho-height'
};

/** Those of the attributes that are sizes rather than angles. */
const SIZE_ATTRIBUTES = new Set(['range', 'near-clip', 'far-clip', 'ortho-height']);

/** The icon of each kind of entity in the hierarchy. */
const ICONS = {
    shape: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    camera: '<path d="M3 7h12v10H3zM15 10.5l6-3v9l-6-3z"/>'
};

const { app } = await whenReady('pc-app');
const scene = document.querySelector('pc-scene');

// Everything in the scene has an entity or a component to edit once it is ready
await Promise.all(
    [...scene.querySelectorAll('pc-entity, pc-camera, pc-light, pc-render, pc-script-instance')].map(element => whenReady(element))
);

const canvas = app.graphicsDevice.canvas;
const cameraElement = scene.querySelector('pc-entity[tags~="editor"] > pc-camera');
const camera = cameraElement.component;
const cameraEntity = camera.entity;
const controls = scene.querySelector('pc-script-instance[name="cameraControls"]').script;

// The entities to edit: all but the editor's own, which carry the editor tag
const items = [...scene.querySelectorAll(':scope > pc-entity:not([tags~="editor"])')];
const elements = new Map(items.map(element => [element.entity, element]));

/**
 * Finds the element of the entity a graph node belongs to.
 *
 * @param {import('playcanvas').GraphNode} node - The node, such as one a mesh instance draws.
 * @returns {HTMLElement|null} The element, or null when the node is not part of the scene.
 */
const elementOf = (node) => {
    for (let current = node; current; current = current.parent) {
        const element = elements.get(current);
        if (element) {
            return element;
        }
    }
    return null;
};

const lightOf = element => element.querySelector(':scope > pc-light');
const cameraOf = element => element.querySelector(':scope > pc-camera');
const kindOf = element => (lightOf(element) ? 'light' : cameraOf(element) ? 'camera' : 'shape');

// --- Gizmos ---

// The helpers keep the scene's depth, so what hides them draws them faint. Their layer goes
// before the transform gizmos' layer, which clears the depth to draw on top of everything.
const helperLayer = Gizmo.createLayer(app, 'Helpers', undefined, true);
const gizmoLayer = Gizmo.createLayer(app);

// A press goes to the first gizmo it hits, so the transform gizmos are created first
const transforms = {
    translate: new TranslateGizmo(camera, gizmoLayer),
    rotate: new RotateGizmo(camera, gizmoLayer),
    scale: new ScaleGizmo(camera, gizmoLayer)
};
const bounds = new BoundingBoxGizmo(camera, helperLayer);
const lights = new LightGizmo(camera, helperLayer);
const cameras = new CameraGizmo(camera, helperLayer);
const icons = new IconGizmo(camera, helperLayer);

const dragGizmos = [...Object.values(transforms), bounds, lights, cameras];
const gizmos = [...dragGizmos, icons];

for (const gizmo of dragGizmos) {
    gizmo.snapIncrement = SNAP_LENGTH;
    gizmo.snapAngleIncrement = SNAP_ANGLE;
}
lights.useLightColor = true;

// --- State ---

/** The tool the toolbar has picked: translate, rotate, scale or resize. */
let tool = 'translate';

/** The selected element, or null. */
let selected = null;

/** The attributes a gizmo has written during the latest drag, by element. */
const edited = new Map();

/** Whether a gizmo took the current press, which then neither orbits the camera nor selects. */
let claimed = false;

const snapButton = document.getElementById('snap');
let shiftHeld = false;

// --- Writing back to the markup ---

const formatPosition = value => String(+value.toFixed(3));
const formatAngle = value => String(+value.toFixed(2));
const formatRotation = value => String(+value.toFixed(1));

/**
 * Formats a size, such as a scale, a range or a clip distance. A size must not round away to
 * nothing: a camera with a near clip of 0 or an entity with a scale of 0 cannot be drawn, and the
 * handles that drag a size stop short of it. One too small for three decimals keeps its first
 * significant digit.
 *
 * @param {number} value - The size.
 * @returns {string} The size as an attribute value.
 */
const formatSize = (value) => {
    const rounded = +value.toFixed(3);
    return String(rounded === 0 && value !== 0 ? +value.toPrecision(1) : rounded);
};

const vector = (value, format) => `${format(value.x)} ${format(value.y)} ${format(value.z)}`;

/**
 * Sets an attribute to what a gizmo has made of the property it declares, and notes that it
 * changed. An attribute the markup leaves to its default stays out until its value moves.
 *
 * @param {HTMLElement} element - The element.
 * @param {string} name - The attribute name.
 * @param {string} value - The value now.
 * @param {string} initial - The value before the drag.
 */
const write = (element, name, value, initial) => {
    if (!edited.has(element)) {
        edited.set(element, new Set());
    }
    const names = edited.get(element);

    // Once a drag has moved a value, it is written even when dragged back to where it began
    if (value === initial && !names.has(name)) {
        return;
    }
    names.add(name);
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
};

/**
 * Reads the values the gizmos can change on an element's entity and components, formatted as
 * their attributes.
 *
 * @param {HTMLElement} element - The entity element.
 * @returns {Map<HTMLElement, Record<string, string>>} The values, by element and attribute.
 */
const read = (element) => {
    const { entity } = element;
    const values = new Map();
    values.set(element, {
        position: vector(entity.getLocalPosition(), formatPosition),
        rotation: vector(entity.getLocalEulerAngles(), formatRotation),
        scale: vector(entity.getLocalScale(), formatSize)
    });
    for (const [child, attributes] of [[lightOf(element), LIGHT_ATTRIBUTES], [cameraOf(element), CAMERA_ATTRIBUTES]]) {
        if (child) {
            const record = {};
            for (const [property, name] of Object.entries(attributes)) {
                const format = SIZE_ATTRIBUTES.has(name) ? formatSize : formatAngle;
                record[name] = format(child.component[property]);
            }
            values.set(child, record);
        }
    }
    return values;
};

/** The values of the selected element as its drag began. */
let before = null;

const beginEdit = () => {
    edited.clear();
    before = selected && read(selected);
};

const commitEdit = () => {
    if (!selected || !before) {
        return;
    }
    for (const [element, record] of read(selected)) {
        const initial = before.get(element);
        for (const name in record) {
            write(element, name, record[name], initial[name]);
        }
    }
    showMarkup();
};

// --- Markup panel ---

const hint = document.getElementById('hint');
const markup = document.getElementById('markup');

const span = (className, text) => {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
};

/**
 * Writes one tag of the markup. Each attribute is kept whole, so the tag wraps between them.
 *
 * @param {HTMLElement} element - The element the tag opens.
 * @param {boolean} close - Whether to close the tag on the same line.
 * @returns {HTMLElement} The line.
 */
const tagLine = (element, close) => {
    const tag = element.localName;
    const open = span('pair', '<');
    open.append(span('tag', tag));
    const pairs = [open];
    for (const name of element.getAttributeNames()) {
        const value = element.getAttribute(name);
        const pair = span('pair', '');
        pair.append(span('attr', name));
        if (value !== '') {
            const changed = edited.get(element)?.has(name);
            pair.append('=', span(changed ? 'value changed' : 'value', `"${value}"`));
        }
        pairs.push(pair);
    }
    const last = pairs[pairs.length - 1];
    last.append('>');
    if (close) {
        last.append('</', span('tag', tag), '>');
    }

    const line = document.createElement('div');
    for (const pair of pairs) {
        line.append(pair, ' ');
    }
    return line;
};

function showMarkup() {
    hint.hidden = !!selected;
    markup.hidden = !selected;
    if (!selected) {
        return;
    }
    const lines = [tagLine(selected, false)];
    for (const child of selected.children) {
        const line = tagLine(child, true);
        line.classList.add('child');
        lines.push(line);
    }
    const end = document.createElement('div');
    end.append('</', span('tag', selected.localName), '>');
    lines.push(end);
    markup.replaceChildren(...lines);
}

// --- Selection ---

const attach = (gizmo, node) => {
    if (node) {
        gizmo.attach(node);
    } else {
        gizmo.detach();
    }
};

// The shot camera renders its view into the corner of the screen while it is selected, in the
// box of the page's .shot-frame element
const shotFrame = document.querySelector('.shot-frame');
let shot = null;

const fitShot = () => {
    const box = shotFrame.getBoundingClientRect();
    const view = canvas.getBoundingClientRect();
    shot.rect = new Vec4(
        (box.left - view.left) / view.width,
        (view.bottom - box.bottom) / view.height,
        box.width / view.width,
        box.height / view.height
    );
};

// On a narrow screen the markup docks along the bottom edge, and the box sits on top of it
const inspector = document.querySelector('.inspector');
new ResizeObserver(() => {
    shotFrame.style.setProperty('--inspector-height', `${inspector.offsetHeight}px`);
}).observe(inspector);

const preview = (component) => {
    if (shot) {
        shot.enabled = false;
    }
    shot = component;
    shotFrame.hidden = !shot;
    if (shot) {
        shotFrame.firstElementChild.textContent = shot.entity.name;
        fitShot();
        shot.enabled = true;
    }
};

const rows = new Map();

const update = () => {
    const entity = selected?.entity ?? null;

    for (const name in transforms) {
        attach(transforms[name], name === tool ? entity : null);
    }

    // The bounds of a shape show whenever it is selected, and take handles to resize it
    attach(bounds, entity?.render ? entity : null);
    bounds.handles = tool === 'resize';
    attach(lights, entity?.light ? entity : null);
    attach(cameras, entity?.camera ? entity : null);

    // The selected light or camera draws its own icon with its shape
    const others = items.filter(element => element !== selected && kindOf(element) !== 'shape');
    icons.attach(others.map(element => element.entity));

    for (const [element, row] of rows) {
        row.setAttribute('aria-current', String(element === selected));
    }
    preview(entity?.camera ?? null);
    showMarkup();
};

const select = (element) => {
    if (element === selected) {
        return;
    }
    selected = element;
    edited.clear();
    before = null;
    update();
};

// --- Hierarchy ---

const list = document.getElementById('entities');
for (const element of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[kindOf(element)]}</svg>`;
    row.append(element.getAttribute('name'));
    row.addEventListener('click', () => select(element));
    row.addEventListener('dblclick', () => frame());
    rows.set(element, row);

    const item = document.createElement('li');
    item.append(row);
    list.append(item);
}

// --- Gizmo events ---

for (const gizmo of gizmos) {
    // The camera stops orbiting while a gizmo is dragged
    gizmo.on('pointer:down', (_x, _y, meshInstance) => {
        if (meshInstance) {
            claimed = true;
            controls.enabled = false;
        }
    });
    gizmo.on('pointer:up', () => {
        controls.enabled = true;
    });

    // Clicking the icon of a light or camera selects it
    gizmo.on('icon:select', node => select(elementOf(node)));
}

for (const gizmo of dragGizmos) {
    for (const prefix of ['transform', 'handle']) {
        gizmo.on(`${prefix}:start`, beginEdit);
        gizmo.on(`${prefix}:move`, commitEdit);
        gizmo.on(`${prefix}:end`, commitEdit);
    }
}

// --- Picking ---

const picker = new Picker(app, 1, 1);
const worldLayer = app.scene.layers.getLayerByName('World');

/** Where the current press began, if it may still turn out to be a click. */
let press = null;

// Ahead of the gizmos, which hear of a press on the canvas before this page does
window.addEventListener('pointerdown', () => {
    claimed = false;
}, true);

canvas.addEventListener('pointerdown', (event) => {
    press = event.button === 0 && !claimed ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
});

canvas.addEventListener('pointerup', async (event) => {
    const click = press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= CLICK_SLOP;
    press = null;
    if (!click) {
        return;
    }

    // Render the scene's meshes into the picker, and read back the one under the pointer
    picker.resize(canvas.clientWidth, canvas.clientHeight);
    picker.prepare(camera, app.scene, [worldLayer]);
    const [meshInstance] = await picker.getSelectionAsync(event.offsetX - 1, event.offsetY - 1, 2, 2);
    select(meshInstance ? elementOf(meshInstance.node) : null);
});

// --- Toolbar ---

const toolButtons = [...document.querySelectorAll('[data-tool]')];
const spaceButton = document.getElementById('space');
const spaceLabel = document.getElementById('space-label');

const setTool = (name) => {
    tool = name;
    for (const button of toolButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    }
    update();
};

const toggleSpace = () => {
    const space = transforms.translate.coordSpace === 'world' ? 'local' : 'world';
    for (const name in transforms) {
        transforms[name].coordSpace = space;
    }
    spaceLabel.textContent = space === 'world' ? 'World' : 'Local';
};

const updateSnap = () => {
    const snap = shiftHeld || snapButton.getAttribute('aria-pressed') === 'true';
    for (const gizmo of dragGizmos) {
        gizmo.snap = snap;
    }
};

for (const button of toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
}
spaceButton.addEventListener('click', toggleSpace);
snapButton.addEventListener('click', () => {
    snapButton.setAttribute('aria-pressed', String(snapButton.getAttribute('aria-pressed') !== 'true'));
    updateSnap();
});

// --- Camera ---

const center = new Vec3();
const position = new Vec3();

/** Moves the editor camera to take in the selected entity, keeping the way it looks. */
function frame() {
    if (!selected) {
        return;
    }
    const { entity } = selected;
    center.copy(entity.getPosition());
    let radius = 0.75;
    if (entity.render) {
        const { aabb } = entity.render.meshInstances[0];
        center.copy(aabb.center);
        radius = aabb.halfExtents.length();
    }
    position.copy(cameraEntity.forward).mulScalar(-Math.max(4 * radius, 3)).add(center);
    controls.reset(center, position);
}

// The view cube turns the camera to look down the axis clicked, from as far away as it is now
const viewCube = new ViewCube(new Vec4(1, 1, 0, 0));
viewCube.dom.style.removeProperty('margin');
viewCube.on(ViewCube.EVENT_CAMERAALIGN, (direction) => {
    const focus = controls.focusPoint;
    const distance = focus.distance(cameraEntity.getPosition());
    position.copy(direction).mulScalar(distance).add(focus);
    controls.reset(focus, position);
});

app.on('prerender', () => {
    viewCube.update(cameraEntity.getWorldTransform());
    if (shot) {
        fitShot();
    }
});

const resize = () => {
    // Keep the scene in view. A wide screen fits the floor top to bottom, and a narrower one fits
    // it side to side, with the same view where the two meet. On a screen taller than it is wide
    // that makes the scene small, so the field of view closes in to 45 degrees on a phone held
    // upright, where the corners of the floor run off the sides.
    const aspect = window.innerWidth / window.innerHeight;
    const narrow = aspect < NARROW_ASPECT;
    const fov = narrow ? 45 + 15 * math.clamp((aspect - PHONE_ASPECT) / (1 - PHONE_ASPECT), 0, 1) : 45;
    cameraElement.toggleAttribute('horizontal-fov', narrow);
    cameraElement.setAttribute('fov', fov.toFixed(1));

    // A transform gizmo scales with the side of the viewport the field of view spans, so keep it
    // the same size on screen, short of crowding a small screen
    const side = narrow ? canvas.clientWidth : canvas.clientHeight;
    for (const name in transforms) {
        transforms[name].size = Math.min(GIZMO_VIEW_SIZE / side, GIZMO_MAX_SIZE);
    }
};
window.addEventListener('resize', resize);
resize();

// --- Keyboard ---

const TOOL_KEYS = { 1: 'translate', 2: 'rotate', 3: 'scale', 4: 'resize' };

window.addEventListener('keydown', (event) => {
    shiftHeld = event.shiftKey;
    updateSnap();
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return;
    }
    const key = event.key.toLowerCase();
    if (TOOL_KEYS[key]) {
        setTool(TOOL_KEYS[key]);
    } else if (key === 'l') {
        toggleSpace();
    } else if (key === 'f') {
        frame();
    } else if (key === 'escape') {
        select(null);
    }
});
window.addEventListener('keyup', (event) => {
    shiftHeld = event.shiftKey;
    updateSnap();
});
window.addEventListener('blur', () => {
    shiftHeld = false;
    updateSnap();
});

// Start with the move tool on the crate, so there is a gizmo to take hold of
setTool('translate');
select(items.find(element => element.getAttribute('name') === 'crate') ?? null);
