/**
 * Page glue for sprites.html: a little platformer for its slime.
 *
 * The arrow keys (or A and D) hop left and right, and Space (or W, or the up arrow) jumps; on a
 * touch screen the buttons along the bottom do the same. Everything on screen is a <pc-sprite>,
 * so the glue only moves entities and picks clips. The slime's `clip` attribute names what it is
 * doing - idle, hop, jump, fall or land - and `flip-x` turns it to face the way it goes. The
 * coins are one coin cloned from a <template> into placeholders that only give their position. A
 * coin the slime touches switches to its one-shot `collect` clip and hides once that ends; collect
 * them all and they come back.
 *
 * The camera is orthographic, its height set so that one pixel of the atlas covers a whole number
 * of screen pixels, keeping every sprite pixel the same size.
 */
import { whenReady } from '@playcanvas/web-components';

/** Atlas pixels per world unit, as every sprite asset on the page declares. */
const PIXELS_PER_UNIT = 16;

/** The fewest atlas pixels the view shows, top to bottom and side to side. */
const MIN_VIEW_HEIGHT = 160;
const MIN_VIEW_WIDTH = 160;

/** How far the slime can go either side of the middle, in world units. */
const WORLD_EDGE = 23;

const RUN_SPEED = 6;
const GRAVITY = 38;
const JUMP_SPEED = 14;

/** A jump pressed this long before landing still happens on landing. */
const JUMP_BUFFER = 0.12;

/** A jump pressed this long after running off an edge still happens. */
const COYOTE_TIME = 0.08;

/** The land clip's two frames at 12 fps. */
const LAND_TIME = 2 / 12;

/** Half the width of the slime's base, for standing on platform ends. */
const FOOT = 0.3;

/** How long all the coins stay collected before they come back, in seconds. */
const RESPAWN_TIME = 1.5;

// Every coin is the same coin: the page declares it once, as a <template>, and each placeholder
// takes a copy - before anything is awaited, so the coins start up with the rest of the scene
const coinTemplate = document.getElementById('coin-template');
for (const placeholder of document.querySelectorAll('pc-entity[name="coin"]')) {
    placeholder.appendChild(coinTemplate.content.cloneNode(true));
}

const { app } = await whenReady('pc-app');
const camera = await whenReady('pc-camera');
const slime = await whenReady('pc-entity[name="slime"] > pc-sprite');
const shadow = await whenReady('pc-entity[name="shadow"] > pc-sprite');

const slimeEntity = slime.closestEntity.entity;
const shadowEntity = shadow.closestEntity.entity;
const cameraEntity = camera.closestEntity.entity;

/** Every element matching `selector`, once each is ready. */
const allReady = selector => Promise.all([...document.querySelectorAll(selector)].map(element => whenReady(element)));

// The surfaces to land on: the ground, and the top of each platform where the page placed it
const platforms = (await allReady('pc-entity[name="platform"]')).map((element) => {
    const { x, y } = element.entity.getPosition();
    return { x, top: y, half: element.querySelector('pc-sprite').width / 2 };
});

// Backdrop layers, which follow the camera by their data-parallax fraction
const layers = (await allReady('pc-entity[data-parallax]')).map((element) => {
    const { x, y, z } = element.entity.getPosition();
    return {
        entity: element.entity,
        x,
        y,
        z,
        parallax: Number(element.dataset.parallax),
        drift: Number(element.dataset.drift ?? 0)
    };
});

const coins = await Promise.all((await allReady('pc-entity[name="coin"]')).map(async (element) => {
    const sprite = await whenReady(element.querySelector('pc-sprite'));
    const coin = { element, sprite, position: element.entity.getPosition().clone(), collected: false };
    // The collect clip plays once; when it ends the coin goes
    sprite.component.on('end', (clip) => {
        if (clip.name === 'collect') {
            element.enabled = false;
        }
    });
    return coin;
}));

// Input: held directions, and when a jump was last asked for
const held = { left: false, right: false };
let jumpRequested = -Infinity;
let time = 0;

const keys = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'jump',
    ArrowUp: 'jump',
    KeyW: 'jump'
};

window.addEventListener('keydown', (event) => {
    const action = keys[event.code];
    if (!action) return;
    event.preventDefault();
    if (action === 'jump') {
        if (!event.repeat) jumpRequested = time;
    } else {
        held[action] = true;
    }
});

window.addEventListener('keyup', (event) => {
    const action = keys[event.code];
    if (action && action !== 'jump') held[action] = false;
});

// A window that loses focus never sees the key go up
window.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
});

for (const [id, action] of [['touch-left', 'left'], ['touch-right', 'right'], ['touch-jump', 'jump']]) {
    const button = document.getElementById(id);
    const press = (pressed) => {
        button.setAttribute('aria-pressed', String(pressed));
        if (action === 'jump') {
            if (pressed) jumpRequested = time;
        } else {
            held[action] = pressed;
        }
    };
    button.addEventListener('pointerdown', (event) => {
        button.setPointerCapture(event.pointerId);
        press(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, () => press(false));
    }
}

// The coin count
const counter = document.getElementById('coin-count');
let count = 0;
let respawnAt = Infinity;
const showCount = () => {
    counter.textContent = `${count} / ${coins.length}`;
    counter.classList.add('bump');
    setTimeout(() => counter.classList.remove('bump'), 150);
};
counter.textContent = `0 / ${coins.length}`;

const collect = (coin) => {
    coin.collected = true;
    coin.sprite.clip = 'collect';
    count++;
    showCount();
    if (count === coins.length) {
        respawnAt = time + RESPAWN_TIME;
    }
};

const respawn = () => {
    for (const coin of coins) {
        coin.collected = false;
        // Set while the entity is still disabled, so the clip it plays when enabled is this one
        coin.sprite.clip = 'spin';
        coin.element.enabled = true;
    }
    count = 0;
    respawnAt = Infinity;
    showCount();
};

// The slime's state
const position = slimeEntity.getPosition().clone();
let vy = 0;
let grounded = true;
let lastGrounded = 0;
let landTimer = 0;
let facingLeft = false;
let cameraX = position.x;

/** The top of the highest surface under `x` at or below `y`. */
const supportBelow = (x, y) => {
    let support = 0;
    for (const platform of platforms) {
        if (Math.abs(x - platform.x) <= platform.half + FOOT && platform.top <= y + 1e-3 && platform.top > support) {
            support = platform.top;
        }
    }
    return support;
};

/** Sizes the orthographic view to a whole number of screen pixels per atlas pixel. */
let viewHeight = 0;
let viewWidth = 0;
const fitView = () => {
    const { width, height } = app.graphicsDevice;
    if (width === viewWidth && height === viewHeight) return;
    viewWidth = width;
    viewHeight = height;
    const zoom = Math.max(1, Math.floor(Math.min(height / MIN_VIEW_HEIGHT, width / MIN_VIEW_WIDTH)));
    camera.orthoHeight = height / (2 * PIXELS_PER_UNIT * zoom);
};

app.on('update', (frameDt) => {
    const dt = Math.min(frameDt, 1 / 30);
    time += dt;
    fitView();

    // Run
    const direction = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (direction !== 0) {
        facingLeft = direction < 0;
    }
    position.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, position.x + direction * RUN_SPEED * dt));

    // Jump, forgiving a press a moment early or a moment late
    if (grounded) lastGrounded = time;
    if (time - jumpRequested <= JUMP_BUFFER && time - lastGrounded <= COYOTE_TIME) {
        vy = JUMP_SPEED;
        grounded = false;
        jumpRequested = -Infinity;
        lastGrounded = -Infinity;
    }

    // Fall, landing on whatever is under the slime: platforms only from above
    const wasGrounded = grounded;
    const previousY = position.y;
    vy -= GRAVITY * dt;
    position.y += vy * dt;
    const support = supportBelow(position.x, previousY);
    grounded = vy <= 0 && position.y <= support;
    if (grounded) {
        position.y = support;
        vy = 0;
    }
    if (grounded && !wasGrounded) {
        landTimer = LAND_TIME;
    }
    landTimer = Math.max(0, landTimer - dt);
    slimeEntity.setPosition(position);

    // What the slime looks like doing it
    let clip;
    if (!grounded) {
        clip = vy > 0 ? 'jump' : 'fall';
    } else if (landTimer > 0) {
        clip = 'land';
    } else {
        clip = direction !== 0 ? 'hop' : 'idle';
    }
    if (slime.clip !== clip) {
        slime.clip = clip;
    }
    if (slime.flipX !== facingLeft) {
        slime.flipX = facingLeft;
    }

    // The shadow stays on the surface below, shrinking and fading with height
    const ground = supportBelow(position.x, position.y);
    const lift = Math.min(1, (position.y - ground) / 4);
    shadowEntity.setPosition(position.x, ground, shadowEntity.getPosition().z);
    shadowEntity.setLocalScale(1 - 0.5 * lift, 1 - 0.5 * lift, 1);
    shadow.opacity = 0.35 * (1 - 0.7 * lift);

    // Coins
    for (const coin of coins) {
        if (!coin.collected && Math.abs(coin.position.x - position.x) < 0.65 && Math.abs(coin.position.y - (position.y + 0.5)) < 0.8) {
            collect(coin);
        }
    }
    if (time >= respawnAt) {
        respawn();
    }

    // The camera follows along the world, never past its ends
    const halfWidth = camera.orthoHeight * viewWidth / viewHeight;
    const reach = Math.max(0, WORLD_EDGE + 1 - halfWidth);
    cameraX += (position.x - cameraX) * (1 - Math.exp(-6 * dt));
    cameraX = Math.max(-reach, Math.min(reach, cameraX));
    // The ground sits a quarter of the way up the view
    cameraEntity.setPosition(cameraX, camera.orthoHeight * 0.5, cameraEntity.getPosition().z);

    // The backdrop, wrapping drifting clouds round well out of view
    for (const layer of layers) {
        let x = layer.x;
        if (layer.drift) {
            x = ((x + layer.drift * time + 30) % 60 + 60) % 60 - 30;
        }
        layer.entity.setPosition(x + cameraX * layer.parallax, layer.y, layer.z);
    }
});
