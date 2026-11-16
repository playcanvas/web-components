// The scripts of the Ocean Assault example, a vertical shooter drawn from one sprite sheet. The
// page declares everything there is one of - the cameras, the sea, the seaplane, the airship, the
// text and the sounds - and one of each thing there are many of. These scripts make the copies,
// run the game, write the text and show the game's pixels as squares of the screen.

import {
    ADDRESS_CLAMP_TO_EDGE,
    Color,
    Entity,
    FILTER_NEAREST,
    KEY_A,
    KEY_D,
    KEY_DOWN,
    KEY_ENTER,
    KEY_LEFT,
    KEY_RIGHT,
    KEY_S,
    KEY_SPACE,
    KEY_UP,
    KEY_W,
    KEY_Z,
    LAYERID_UI,
    LAYERID_WORLD,
    Layer,
    PIXELFORMAT_RGBA8,
    RENDERTARGET_ORIGIN_TOP,
    RenderTarget,
    SPRITETYPE_SIMPLE,
    Script,
    Sprite,
    Texture,
    TextureAtlas,
    Vec2,
    Vec4
} from 'playcanvas';

import { ARRIVALS, BOSS, BOSS_AT, HEIGHT, PATHS, WIDTH, updateBoss } from './ocean-assault-stage.mjs';

/**
 * @import { Asset } from 'playcanvas'
 * @import { Enemy, World } from './ocean-assault-stage.mjs'
 */

// ------------------------------------------------------------------------------------- screen

/**
 * Shows what another camera sees as pixel art. That camera, the `source`, no longer draws on the
 * canvas but on a texture of `width` by `height` pixels. This script's own camera draws that
 * texture on the canvas, in the middle, at the largest whole multiple of its size that fits, so
 * that every pixel of the texture is a square of pixels of the canvas.
 *
 * Its camera also draws the UI layer, where MiniStats goes, which is then as sharp as the canvas
 * and not as coarse as the texture.
 */
export class PixelScreen extends Script {
    static scriptName = 'pixelScreen';

    /**
     * The entity of the camera that draws the picture. A world unit of its view should be a pixel
     * of the texture: an orthographic camera whose `ortho-height` is half of `height`.
     *
     * @attribute
     * @type {Entity}
     */
    source = null;

    /**
     * The width of the texture, in pixels.
     *
     * @attribute
     * @type {number}
     */
    width = 192;

    /**
     * The height of the texture, in pixels.
     *
     * @attribute
     * @type {number}
     */
    height = 256;

    /**
     * How many pixels of the canvas there are to a pixel of the texture.
     *
     * @type {number}
     */
    zoom = 1;

    initialize() {
        const { app, width, height } = this;
        const device = app.graphicsDevice;

        // The screen: a texture read pixel for pixel, with no filtering or mipmaps
        const texture = new Texture(device, {
            name: 'pixel-screen',
            width,
            height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        // its rows run from the top down on every graphics API, as those of an image do, so it can
        // be drawn as a sprite
        const target = new RenderTarget({
            name: 'pixel-screen',
            colorBuffer: texture,
            origin: RENDERTARGET_ORIGIN_TOP
        });

        const source = this.source.camera;
        source.layers = [LAYERID_WORLD];
        source.renderTarget = target;

        // The texture is a sprite in a layer of its own, which only this script's camera draws
        const layer = new Layer({ name: 'Pixel Screen' });
        app.scene.layers.insert(layer, 0);

        const atlas = new TextureAtlas();
        atlas.texture = texture;
        atlas.frames = {
            screen: { rect: new Vec4(0, 0, width, height), pivot: new Vec2(0.5, 0.5), border: new Vec4() }
        };
        const sprite = new Sprite(device, { atlas, frameKeys: ['screen'], pixelsPerUnit: 1 });

        this._picture = new Entity('pixel-screen');
        this._picture.addComponent('sprite', { type: SPRITETYPE_SIMPLE, sprite, layers: [layer.id] });
        app.root.addChild(this._picture);

        this.entity.camera.layers = [layer.id, LAYERID_UI];

        this._fit();
        device.on('resizecanvas', this._fit, this);

        this.on('destroy', () => {
            device.off('resizecanvas', this._fit, this);
            source.renderTarget = null;
            this._picture.destroy();
            app.scene.layers.remove(layer);
            sprite.destroy();
            target.destroy();
            texture.destroy();
        });
    }

    /**
     * Sizes the picture to the largest whole multiple that fits the canvas.
     *
     * @private
     */
    _fit() {
        const { width, height } = this.app.graphicsDevice;
        this.zoom = Math.max(1, Math.floor(Math.min(width / this.width, height / this.height)));
        this._picture.setLocalScale(this.zoom, this.zoom, 1);

        // a world unit is a pixel of the canvas. Where the canvas is an odd number of pixels
        // across, the camera is half a pixel off center, so the edges of the picture fall between
        // pixels.
        this.entity.camera.orthoHeight = height / 2;
        this.entity.setPosition((width % 2) / 2, (height % 2) / 2, 50);
    }
}

// --------------------------------------------------------------------------------------- text

/**
 * A line of text, drawn with one sprite for each character: the children of its entity, which it
 * makes. The entity is where the text starts, where its middle is or where it ends, depending on
 * how it is aligned.
 */
export class SpriteText extends Script {
    static scriptName = 'spriteText';

    /**
     * The sprite asset of the font, which has a frame for each character.
     *
     * @attribute
     * @type {Asset}
     */
    font = null;

    /**
     * The characters of the font, in the order of its frames.
     *
     * @attribute
     * @type {string}
     */
    characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-!:.x';

    /**
     * How far each character is from the one before it, in world units.
     *
     * @attribute
     * @type {number}
     */
    advance = 6;

    /**
     * The most characters the text shows.
     *
     * @attribute
     * @type {number}
     */
    length = 8;

    /**
     * How the text is aligned to its entity: `left`, `center` or `right`.
     *
     * @attribute
     * @type {string}
     */
    align = 'left';

    /** @private */
    _text = '';

    /** @private */
    _color = new Color(1, 1, 1);

    /**
     * The sprites of the characters, once they are made.
     *
     * @type {Entity[]|null}
     * @private
     */
    _glyphs = null;

    /**
     * The text to show. A character the font does not have, such as a space, shows as a gap.
     *
     * @attribute
     * @type {string}
     */
    set text(value) {
        if (value === this._text) return;
        this._text = value;
        this._write();
    }

    get text() {
        return this._text;
    }

    /**
     * The color of the text.
     *
     * @attribute
     * @type {Color}
     */
    set color(value) {
        if (value.equals(this._color)) return;
        this._color = value;
        for (const glyph of this._glyphs ?? []) {
            glyph.sprite.color = value;
        }
    }

    get color() {
        return this._color;
    }

    initialize() {
        this._glyphs = Array.from({ length: this.length }, () => {
            const glyph = new Entity('glyph');
            glyph.addComponent('sprite', { type: SPRITETYPE_SIMPLE, spriteAsset: this.font.id, color: this._color });
            glyph.enabled = false;
            this.entity.addChild(glyph);
            return glyph;
        });
        this._write();
    }

    /**
     * Shows the frame of each character of the text, in its place.
     *
     * @private
     */
    _write() {
        if (!this._glyphs) return;

        const { advance, align, characters } = this;
        const text = this._text;
        const width = text.length * advance;
        const left = align === 'left' ? 0 : align === 'right' ? -width : -Math.floor(width / 2);
        this._glyphs.forEach((glyph, i) => {
            const frame = i < text.length ? characters.indexOf(text[i]) : -1;
            glyph.enabled = frame >= 0;
            if (frame >= 0) {
                glyph.sprite.frame = frame;
                glyph.setLocalPosition(left + i * advance + advance / 2, 0, 0);
            }
        });
    }
}

// --------------------------------------------------------------------------------------- game

// How far a raider is from the camera, which depends on whether it sails or flies. Everything
// else is as far away as the page puts it.
const Z_BOAT = 2;
const Z_ENEMY = 5;

// A shadow is down and to the right of what casts it, on the sea
const SHADOW_X = 6;
const SHADOW_Y = -8;

// The sea and its islands go by a whole pixel at a time. At this speed that is a pixel every two
// frames at 60 frames a second, or every four at 120, and the scroll starts part way between two
// pixels, so the steps stay evenly spaced while the frame times wobble.
const SCROLL_SPEED = 30;
const SCROLL_START = 0.125;

// The clip of the seaplane with its wings level, or banked into a turn to the left or the right
const BANKS = ['level', 'left', 'right'];
const PLAYER_SPEED = 112;
const PLAYER_RADIUS = 3;

// The guns at each power: where each shot starts across the wings, and how fast it goes sideways
const GUNS = [
    [
        [-4, 0],
        [4, 0]
    ],
    [
        [-7, -26],
        [0, 0],
        [7, 26]
    ],
    [
        [-10, -62],
        [-5, -24],
        [0, 0],
        [5, 24],
        [10, 62]
    ]
];
const SHOT_SPEED = 300;
const FIRE_EVERY = 0.13;

// Something that is hit shows white for a moment, and then not again for a while
const FLASH_TIME = 0.05;
const FLASH_GAP = 0.16;

// A gunboat's missile leaves the deck slowly and gathers speed. It turns toward the seaplane while
// its motor is new, then flies straight, so it is outrun by turning late. It can be shot down.
const MISSILE_HEADINGS = 16;
const MISSILE_TURN = 2.2;
const MISSILE_SEEKS = 1.6;
const MISSILE_RADIUS = 4;

// The width of the bar that shows the airship's strength, in pixels
const BAR_WIDTH = 120;

// How many of each thing the game keeps ready: the one the page declares, and copies of it
const COUNT = {
    shot: 48,
    needle: 40,
    orb: 150,
    missile: 8,
    enemy: 40,
    effect: 72,
    pickup: 6
};

// The least time between two plays of each sound, in seconds, so that a sound does not pile up on
// itself
const SOUND_GAPS = {
    shot: 0.09,
    hit: 0.05,
    launch: 0.15,
    boom: 0.05,
    blast: 0.08,
    pickup: 0.1,
    crash: 0.2,
    start: 0.3,
    alarm: 1
};

const PINK = new Color().fromString('#ff4f9a');

// What the airship's guns do while there is no seaplane to shoot at
const HOLD_FIRE = {
    orb() {
        // nothing
    },
    needle() {
        // nothing
    }
};

const random = (/** @type {number} */ min, /** @type {number} */ max) => min + Math.random() * (max - min);

const within = (/** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ radius) =>
    dx * dx + dy * dy < radius * radius;

const pad = (/** @type {number} */ value) => String(Math.min(value, 999999)).padStart(6, '0');

// A pitch for an explosion, so that no two sound the same
const varied = () => 0.85 + Math.random() * 0.3;

/**
 * Moves an entity to the nearest whole pixel.
 *
 * @param {Entity} entity - The entity.
 * @param {number} x - The x position.
 * @param {number} y - The y position.
 */
const place = (entity, x, y) => {
    entity.setLocalPosition(Math.round(x), Math.round(y), entity.getLocalPosition().z);
};

/**
 * @param {Sprite} sprite - A sprite.
 * @param {number} frame - The index of one of its frames.
 * @returns {{ width: number, height: number }} The size of the frame, in pixels of the sheet.
 */
const frameSize = (sprite, frame) => {
    const { rect } = sprite.atlas.frames[sprite.frameKeys[frame]];
    return { width: rect.z, height: rect.w };
};

/**
 * @param {Entity} entity - An entity the page declares.
 * @param {number} count - How many there should be.
 * @returns {Entity[]} That entity and copies of it beside it, sprites and clips and all.
 */
const copies = (entity, count) => {
    const all = [entity];
    while (all.length < count) {
        const copy = entity.clone();
        entity.parent.addChild(copy);
        all.push(copy);
    }
    return all;
};

/**
 * Writes a line of text, once the script that draws it is there.
 *
 * @param {Entity} entity - An entity with a spriteText script.
 * @param {string} text - The text.
 * @param {Color} [color] - Its color.
 */
const write = (entity, text, color) => {
    const label = /** @type {SpriteText|undefined} */ (entity.script?.get('spriteText'));
    if (!label) return;
    label.text = text;
    if (color) label.color = color;
};

/**
 * A fixed number of things made up front, such as shots, handed out and taken back as the game
 * needs them, so that nothing is created while it plays.
 *
 * @template {{ entity: Entity, active: boolean }} T
 */
class Pool {
    /**
     * @param {T[]} items - The items. They start out of use, with their entities disabled.
     */
    constructor(items) {
        this.items = items;
        for (const item of items) {
            item.active = false;
            item.entity.enabled = false;
        }
    }

    /**
     * @returns {T|null} An item that was not in use, with its entity enabled, or null if every
     * item is in use.
     */
    spawn() {
        for (const item of this.items) {
            if (!item.active) {
                item.active = true;
                item.entity.enabled = true;
                return item;
            }
        }
        return null;
    }

    /**
     * @param {T} item - The item to take back.
     */
    free(item) {
        item.active = false;
        item.entity.enabled = false;
    }

    freeAll() {
        for (const item of this.items) {
            if (item.active) this.free(item);
        }
    }
}

/**
 * A shot, the player's or a raider's.
 *
 * @typedef {object} Shot
 * @property {Entity} entity - Its sprite.
 * @property {boolean} active - Whether it is in play.
 * @property {number} x - Its position.
 * @property {number} y - Its position.
 * @property {number} vx - Its velocity.
 * @property {number} vy - Its velocity.
 */

/**
 * @typedef {object} Missile
 * @property {Entity} entity - Its sprite: two frames for each way it can point.
 * @property {boolean} active - Whether it is in play.
 * @property {number} x - Its position.
 * @property {number} y - Its position.
 * @property {number} heading - The way it points, in radians, anticlockwise from the right.
 * @property {number} speed - Its speed, once it is up to speed.
 * @property {number} age - The seconds since it was launched.
 * @property {number} smoke - The seconds until its next puff of smoke.
 */

/**
 * Something that drifts down the screen and comes around again above it.
 *
 * @typedef {object} Drifter
 * @property {Entity} entity - Its sprite, which has a frame for each shape it can take.
 * @property {number} x - Its position.
 * @property {number} y - Its position.
 * @property {number} half - Half its height.
 */

/**
 * @param {Entity[]} entities - A sprite for each shot.
 * @returns {Pool<Shot>} The shots.
 */
const shotPool = (entities) => {
    return new Pool(entities.map((entity) => ({ entity, active: false, x: 0, y: 0, vx: 0, vy: 0 })));
};

/**
 * @param {Entity} parent - An entity whose children drift.
 * @returns {Drifter[]} The children, as drifters.
 */
const drifters = (parent) => {
    return parent.children.map((entity) => ({ entity: /** @type {Entity} */ (entity), x: 0, y: 0, half: 0 }));
};

/**
 * Gives a drifter a new shape and a new place.
 *
 * @param {Drifter} drifter - The drifter.
 * @param {number} bottom - The height of its lower edge.
 */
const recycle = (drifter, bottom) => {
    const { sprite } = drifter.entity;
    const frame = Math.floor(Math.random() * sprite.sprite.frameKeys.length);
    const { width, height } = frameSize(sprite.sprite, frame);
    sprite.frame = frame;
    sprite.flipX = Math.random() < 0.5;
    drifter.half = height / 2;
    drifter.x = random(width * 0.2, WIDTH - width * 0.2);
    drifter.y = Math.round(bottom) + drifter.half;
};

/**
 * @param {Drifter[]} list - The drifters.
 * @param {number} distance - How far they drift down the screen, in pixels.
 * @param {number} gap - The most space between one and the next, in pixels.
 */
const drift = (list, distance, gap) => {
    for (const drifter of list) {
        drifter.y -= distance;
        if (drifter.y < -drifter.half) {
            const top = Math.max(HEIGHT, ...list.map((other) => other.y + other.half));
            recycle(drifter, top + random(gap * 0.3, gap));
        }
        place(drifter.entity, drifter.x, drifter.y);
    }
};

/**
 * The game. Raiders come in waves over the sea, and an airship follows them: shoot them down, and
 * collect the power ups the bombers drop for more guns. When the airship goes up the stage starts
 * again, harder.
 *
 * The arrow keys, or W, A, S and D, fly the seaplane, and Space or Z fires its guns. A drag flies
 * it and fires.
 *
 * The script finds what it moves by name among the descendants of its entity, which the page
 * declares, and plays the slots of the sound component beside it. It makes copies of the entities
 * that there are many of.
 */
export class OceanAssault extends Script {
    static scriptName = 'oceanAssault';

    /**
     * The entity of the camera that draws the game, which shakes when something big goes up.
     *
     * @attribute
     * @type {Entity}
     */
    camera = null;

    /**
     * The entity with the pixelScreen script, which knows how large a pixel of the game is on the
     * canvas.
     *
     * @attribute
     * @type {Entity}
     */
    screen = null;

    /**
     * Whether the game is set up.
     *
     * @private
     */
    _started = false;

    /**
     * Sets the game up, on its first update: by then every asset the page declares has loaded,
     * and every sprite has its frames.
     *
     * @private
     */
    _start() {
        const { app } = this;
        const find = (/** @type {string} */ name) => /** @type {Entity} */ (this.entity.findByName(name));

        // -------------------------------------------------------------------------------- scenery

        // The sea: one tile, repeated over the screen and a tile more, sliding down a tile's
        // height and starting again
        this._sea = find('sea');
        this._seaTile = frameSize(this._sea.sprite.clip('waves').sprite, 0).height;

        this._islands = drifters(find('islands'));
        this._clouds = drifters(find('clouds'));
        this._islands.forEach((island, i) => recycle(island, 90 + i * 190));
        this._clouds.forEach((cloud, i) => recycle(cloud, 40 + i * 230));

        // ----------------------------------------------------------------------------- the player

        this._player = {
            entity: find('player'),
            shadow: find('player-shadow'),
            x: WIDTH / 2,
            y: 40,
            alive: false,
            lives: 0,
            // how many guns: 1 to 3
            power: 1,
            // seconds until the guns fire again, until a lost seaplane is replaced, and of safety
            // after
            cooldown: 0,
            respawn: 0,
            shield: 0
        };

        // ---------------------------------------------------------------------------------- pools

        this._shots = shotPool(copies(find('shot'), COUNT.shot));
        this._needles = shotPool(copies(find('needle'), COUNT.needle));
        this._orbs = shotPool(copies(find('orb'), COUNT.orb));

        /** @type {Pool<Missile>} */
        this._missiles = new Pool(
            copies(find('missile'), COUNT.missile).map((entity) => ({
                entity,
                active: false,
                x: 0,
                y: 0,
                heading: 0,
                speed: 0,
                age: 0,
                smoke: 0
            }))
        );

        // The raiders: each takes the sprite of its type as it arrives
        const shadows = copies(find('enemy-shadow'), COUNT.enemy);
        /** @type {Pool<Enemy>} */
        this._enemies = new Pool(
            copies(find('enemy'), COUNT.enemy).map((entity, i) => {
                return /** @type {Enemy} */ ({ entity, shadow: shadows[i], active: false });
            })
        );

        // Explosions and smoke: a clip for each kind, which plays once and goes back to the pool
        this._effects = new Pool(copies(find('effect'), COUNT.effect).map((entity) => ({ entity, active: false })));
        for (const item of this._effects.items) {
            item.entity.sprite.on('end', () => this._effects.free(item));
        }

        // Power ups: more guns, or another seaplane
        this._pickups = new Pool(
            copies(find('pickup'), COUNT.pickup).map((entity) => ({
                entity,
                active: false,
                kind: 'power',
                x: 0,
                y: 0,
                age: 0
            }))
        );

        // ---------------------------------------------------------------------------- the airship

        this._boss = {
            entity: find('boss'),
            shadow: find('boss-shadow'),
            // 'away', 'warning' before it arrives, 'fight', then 'sinking' as it goes up
            state: 'away',
            timer: 0,
            hp: 0,
            hpMax: 1,
            flash: 0,
            x: WIDTH / 2,
            y: HEIGHT + 40,
            age: 0,
            cooldown: 0,
            attack: 0,
            burst: 0,
            burstTimer: 0
        };

        // its strength, across the top of the screen, and a flash over the whole screen as it
        // goes up
        this._barBack = find('bar-back');
        this._barFill = find('bar-fill');
        this._flash = find('flash');

        // -------------------------------------------------------------------------------- the HUD

        this._logo = find('logo');
        this._lifeIcons = find('lives').children.slice();
        this._scoreText = find('score');
        this._bestText = find('best');
        this._messageText = find('message');
        this._hintText = find('hint');

        // ------------------------------------------------------------------------------- the game

        // 'title', 'play' or 'over'
        this._state = 'title';
        this._time = 0;
        this._score = 0;
        this._best = 0;
        try {
            this._best = Number(localStorage.getItem('ocean-assault-best')) || 0;
        } catch {
            // no storage, so the best score lasts as long as the page
        }

        // the stage: its clock, the next raider to arrive, and how far the sea has gone by
        this._stageTime = 0;
        this._arrival = 0;
        this._scroll = 0;
        this._shake = 0;
        this._message = '';
        this._messageTime = 0;

        const player = this._player;
        /** @type {World} */
        this._world = {
            player,
            // how many times the stage has been cleared
            loop: 0,
            scrolled: 0,
            orb: (x, y, vx, vy) => this._fire(this._orbs, x, y, vx, vy),
            needle: (x, y, vx, vy) => this._fire(this._needles, x, y, vx, vy),
            missile: (x, y, speed) => {
                const missile = this._missiles.spawn();
                if (!missile) return;
                missile.x = x;
                missile.y = y;
                missile.heading = Math.atan2(player.y - y, player.x - x);
                missile.speed = speed;
                missile.age = missile.smoke = 0;
                this._showMissile(missile);
                this._sound('launch');
            }
        };

        // ---------------------------------------------------------------------------------- sound

        // Every sound is a part of one audio file, which a slot of the sound component plays.
        // Sounds that play at once add up, and a screen of explosions adds up to more than the
        // output can carry, which distorts. The slots do the overlapping; this compressor, a Web
        // Audio node, only turns the loudest moments down. Every slot plays through it.
        const compressor = app.soundManager.context?.createDynamicsCompressor();
        if (compressor) {
            compressor.threshold.value = -12;
            compressor.ratio.value = 6;
            for (const slot of Object.values(this.entity.sound.slots)) {
                slot.setExternalNodes(compressor);
            }
        }

        // when each sound last played
        /** @type {Record<string, number>} */
        this._lastPlayed = {};

        // ---------------------------------------------------------------------------------- input

        // A drag moves the seaplane by as much, wherever it started, so a thumb need not cover it
        const pointer = { down: false, pressed: false, x: 0, y: 0, dx: 0, dy: 0 };
        this._pointer = pointer;

        const device = app.graphicsDevice;
        const canvas = /** @type {HTMLCanvasElement} */ (device.canvas);
        const onPointerDown = (/** @type {PointerEvent} */ event) => {
            pointer.down = pointer.pressed = true;
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            canvas.setPointerCapture(event.pointerId);
        };
        const onPointerMove = (/** @type {PointerEvent} */ event) => {
            if (!pointer.down) return;
            // from pixels of the page to pixels of the game
            const zoom = this.screen?.script?.get('pixelScreen')?.zoom ?? 1;
            const scale = device.width / canvas.clientWidth / zoom;
            pointer.dx += (event.clientX - pointer.x) * scale;
            pointer.dy -= (event.clientY - pointer.y) * scale;
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        };
        const onPointerUp = () => {
            pointer.down = false;
        };
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        this.on('destroy', () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
        });
    }

    /**
     * @param {...number} keys - Key codes.
     * @returns {boolean} Whether any of the keys is held down.
     * @private
     */
    _held(...keys) {
        return keys.some((key) => this.app.keyboard.isPressed(key));
    }

    /**
     * Plays a sound, unless it has only just played.
     *
     * @param {keyof typeof SOUND_GAPS} name - The name of the slot of the sound.
     * @param {number} [pitch] - How much higher or lower to play it: 1 is as it was recorded.
     * @private
     */
    _sound(name, pitch = 1) {
        const now = performance.now() / 1000;
        if (now - (this._lastPlayed[name] ?? -Infinity) < SOUND_GAPS[name]) return;
        this._lastPlayed[name] = now;

        // the pitch of an overlapping slot is that of the sounds it plays from now on
        const slot = this.entity.sound.slot(name);
        if (!slot) return;
        slot.pitch = pitch;
        slot.play();
    }

    /**
     * @param {string} text - A message for the middle of the screen.
     * @param {number} seconds - How long it shows.
     * @private
     */
    _announce(text, seconds) {
        this._message = text;
        this._messageTime = seconds;
    }

    /**
     * @param {number} points - The points scored.
     * @private
     */
    _award(points) {
        this._score += points;
        if (this._score > this._best) {
            this._best = this._score;
            try {
                localStorage.setItem('ocean-assault-best', String(this._best));
            } catch {
                // no storage
            }
        }
    }

    /**
     * @param {Pool<Shot>} pool - The pool the shot is from.
     * @param {number} x - Where the shot starts.
     * @param {number} y - Where the shot starts.
     * @param {number} vx - Its velocity.
     * @param {number} vy - Its velocity.
     * @private
     */
    _fire(pool, x, y, vx, vy) {
        const shot = pool.spawn();
        if (!shot) return;
        shot.x = x;
        shot.y = y;
        shot.vx = vx;
        shot.vy = vy;
        place(shot.entity, x, y);
    }

    /**
     * Puts a missile's sprite where the missile is, pointing the way it flies, its flame
     * flickering.
     *
     * @param {Missile} missile - The missile.
     * @private
     */
    _showMissile(missile) {
        const turn = Math.round((missile.heading / (Math.PI * 2)) * MISSILE_HEADINGS);
        const heading = ((turn % MISSILE_HEADINGS) + MISSILE_HEADINGS) % MISSILE_HEADINGS;
        missile.entity.sprite.frame = heading * 2 + (Math.floor(missile.age * 20) % 2);
        place(missile.entity, missile.x, missile.y);
    }

    /**
     * @param {'boom'|'blast'|'spark'|'smoke'} kind - The clip to play.
     * @param {number} x - Where it plays.
     * @param {number} y - Where it plays.
     * @private
     */
    _effect(kind, x, y) {
        const item = this._effects.spawn();
        if (!item) return;
        place(item.entity, x, y);
        item.entity.sprite.play(kind);
    }

    /**
     * @param {'power'|'life'} kind - What it gives.
     * @param {number} x - Where it appears.
     * @param {number} y - Where it appears.
     * @private
     */
    _drop(kind, x, y) {
        const pickup = this._pickups.spawn();
        if (!pickup) return;
        pickup.kind = kind;
        pickup.x = Math.max(12, Math.min(WIDTH - 12, x));
        pickup.y = y;
        pickup.age = 0;
        pickup.entity.sprite.play(kind);
    }

    /**
     * @param {Enemy} enemy - The raider to take out of play.
     * @private
     */
    _freeEnemy(enemy) {
        this._enemies.free(enemy);
        enemy.shadow.enabled = false;
    }

    /** @private */
    _clearField() {
        this._enemies.items.forEach((enemy) => enemy.active && this._freeEnemy(enemy));
        for (const pool of [this._shots, this._needles, this._orbs, this._missiles, this._effects, this._pickups]) {
            pool.freeAll();
        }
        const boss = this._boss;
        boss.state = 'away';
        boss.entity.enabled = boss.shadow.enabled = this._barBack.enabled = this._barFill.enabled = false;
    }

    /** @private */
    _startGame() {
        this._clearField();
        this._state = 'play';
        this._score = 0;
        this._stageTime = 0;
        this._arrival = 0;
        this._world.loop = 0;

        const player = this._player;
        player.lives = 2;
        player.power = 1;
        player.alive = true;
        player.shield = 2;
        player.x = WIDTH / 2;
        player.y = 40;
        player.entity.enabled = true;
        this._announce('STAGE 1', 2);
        this._sound('start');
    }

    /** @private */
    _losePlayer() {
        const player = this._player;
        player.alive = false;
        player.respawn = 1.3;
        player.entity.enabled = player.shadow.enabled = false;
        this._effect('blast', player.x, player.y);
        this._sound('crash');
        this._shake = 7;
    }

    /**
     * @param {Enemy} enemy - The raider that was destroyed.
     * @private
     */
    _destroyEnemy(enemy) {
        const { type } = enemy;
        this._effect(type.big ? 'blast' : 'boom', enemy.x, enemy.y);
        if (type.big) {
            this._sound('blast', varied());
            this._shake = Math.max(this._shake, 4);
        } else {
            this._sound('boom', varied());
        }
        this._award(type.score * (1 + this._world.loop));
        if (Math.random() < type.drop) this._drop('power', enemy.x, enemy.y);
        this._freeEnemy(enemy);
    }

    // ------------------------------------------------------------------------------------ updates

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updatePlayer(dt) {
        const player = this._player;
        const pointer = this._pointer;

        if (!player.alive) {
            // a lost seaplane is replaced after a moment, while there is one to replace it
            player.respawn -= dt;
            if (player.respawn < 0) {
                if (player.lives > 0) {
                    player.lives--;
                    player.alive = true;
                    player.shield = 2.5;
                    player.power = Math.max(1, player.power - 1);
                    player.x = WIDTH / 2;
                    player.y = 40;
                } else if (this._state === 'play') {
                    this._state = 'over';
                    this._announce('GAME OVER', Infinity);
                }
            }
            return;
        }

        // fly
        const dx = (this._held(KEY_RIGHT, KEY_D) ? 1 : 0) - (this._held(KEY_LEFT, KEY_A) ? 1 : 0);
        const dy = (this._held(KEY_UP, KEY_W) ? 1 : 0) - (this._held(KEY_DOWN, KEY_S) ? 1 : 0);
        const speed = dx && dy ? PLAYER_SPEED * Math.SQRT1_2 : PLAYER_SPEED;
        player.x = Math.max(11, Math.min(WIDTH - 11, player.x + dx * speed * dt + pointer.dx));
        player.y = Math.max(13, Math.min(HEIGHT - 40, player.y + dy * speed * dt + pointer.dy));

        // bank into a turn
        const bank = dx < 0 || pointer.dx < -0.5 ? 1 : dx > 0 || pointer.dx > 0.5 ? 2 : 0;
        const { sprite } = player.entity;
        if (sprite.currentClip.name !== BANKS[bank]) sprite.play(BANKS[bank]);
        player.shadow.sprite.frame = bank;

        // fire
        player.cooldown -= dt;
        if ((this._held(KEY_SPACE, KEY_Z) || pointer.down) && player.cooldown < 0) {
            player.cooldown = FIRE_EVERY;
            for (const [offset, vx] of GUNS[player.power - 1]) {
                this._fire(this._shots, player.x + offset, player.y + 10, vx, SHOT_SPEED);
            }
            this._sound('shot');
        }

        // blink while it cannot be hit
        player.shield -= dt;
        const visible = player.shield < 0 || Math.floor(this._time * 16) % 2 === 0;
        player.entity.enabled = player.shadow.enabled = visible;
        place(player.entity, player.x, player.y);
        place(player.shadow, player.x + SHADOW_X, player.y + SHADOW_Y);
    }

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updateShots(dt) {
        const player = this._player;
        const boss = this._boss;
        const shots = this._shots;
        const missiles = this._missiles;

        for (const shot of shots.items) {
            if (!shot.active) continue;
            shot.x += shot.vx * dt;
            shot.y += shot.vy * dt;
            if (shot.y > HEIGHT + 8) {
                shots.free(shot);
                continue;
            }
            place(shot.entity, shot.x, shot.y);

            // the airship, a box
            if (
                boss.state === 'fight' &&
                Math.abs(shot.x - boss.x) < BOSS.halfWidth &&
                Math.abs(shot.y - boss.y) < BOSS.halfHeight
            ) {
                shots.free(shot);
                this._effect('spark', shot.x, shot.y);
                // under steady fire it flashes now and then, rather than staying white
                if (boss.flash < -FLASH_GAP) boss.flash = FLASH_TIME;
                boss.hp--;
                this._sound('hit');
                continue;
            }

            // a missile is shot down
            let stopped = false;
            for (const missile of missiles.items) {
                if (!missile.active || !within(shot.x - missile.x, shot.y - missile.y, MISSILE_RADIUS + 3)) continue;
                missiles.free(missile);
                shots.free(shot);
                this._effect('boom', missile.x, missile.y);
                this._sound('boom', varied());
                this._award(50);
                stopped = true;
                break;
            }
            if (stopped) continue;

            for (const enemy of this._enemies.items) {
                if (!enemy.active || !within(shot.x - enemy.x, shot.y - enemy.y, enemy.type.radius + 3)) continue;
                shots.free(shot);
                if (--enemy.hp <= 0) {
                    this._destroyEnemy(enemy);
                } else {
                    this._effect('spark', shot.x, shot.y);
                    if (enemy.flash < -FLASH_GAP) enemy.flash = FLASH_TIME;
                    this._sound('hit');
                }
                break;
            }
        }

        // the raiders' shots
        for (const pool of [this._orbs, this._needles]) {
            for (const shot of pool.items) {
                if (!shot.active) continue;
                shot.x += shot.vx * dt;
                shot.y += shot.vy * dt;
                if (shot.x < -8 || shot.x > WIDTH + 8 || shot.y < -8 || shot.y > HEIGHT + 8) {
                    pool.free(shot);
                    continue;
                }
                place(shot.entity, shot.x, shot.y);
                if (
                    player.alive &&
                    player.shield < 0 &&
                    within(shot.x - player.x, shot.y - player.y, PLAYER_RADIUS + 2)
                ) {
                    pool.free(shot);
                    this._losePlayer();
                }
            }
        }

        // the gunboats' missiles
        for (const missile of missiles.items) {
            if (!missile.active) continue;
            missile.age += dt;

            // toward the seaplane, the shorter way round, and no faster than it can turn
            if (player.alive && missile.age < MISSILE_SEEKS) {
                const bearing = Math.atan2(player.y - missile.y, player.x - missile.x) - missile.heading;
                const turn = Math.atan2(Math.sin(bearing), Math.cos(bearing));
                missile.heading += Math.max(-MISSILE_TURN * dt, Math.min(MISSILE_TURN * dt, turn));
            }
            const speed = missile.speed * Math.min(1, 0.25 + missile.age);
            const cos = Math.cos(missile.heading);
            const sin = Math.sin(missile.heading);
            missile.x += cos * speed * dt;
            missile.y += sin * speed * dt;
            if (missile.x < -10 || missile.x > WIDTH + 10 || missile.y < -10 || missile.y > HEIGHT + 10) {
                missiles.free(missile);
                continue;
            }
            this._showMissile(missile);

            // a trail of smoke behind it
            missile.smoke -= dt;
            if (missile.smoke < 0) {
                missile.smoke = 0.07;
                this._effect('smoke', missile.x - cos * 7, missile.y - sin * 7);
            }

            if (
                player.alive &&
                player.shield < 0 &&
                within(missile.x - player.x, missile.y - player.y, PLAYER_RADIUS + MISSILE_RADIUS)
            ) {
                missiles.free(missile);
                this._effect('boom', missile.x, missile.y);
                this._losePlayer();
            }
        }
    }

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updateEnemies(dt) {
        const player = this._player;
        const world = this._world;
        const enemies = this._enemies;

        // the raiders due by now, while the game is on
        const due = this._state === 'play' ? this._stageTime : -Infinity;
        while (this._arrival < ARRIVALS.length && ARRIVALS[this._arrival].at <= due) {
            const { type, path, x, side, index } = ARRIVALS[this._arrival++];
            const enemy = enemies.spawn();
            if (!enemy) continue;
            Object.assign(enemy, {
                type,
                path,
                x,
                x0: x,
                y: HEIGHT + 18,
                vx: 0,
                vy: 0,
                side,
                index,
                age: 0,
                flash: 0,
                cooldown: 0.6
            });
            enemy.hp = Math.ceil(type.hp * (1 + world.loop * 0.5));

            // the sprite of its type, which its shadow shares
            const sprite = this.app.assets.find(type.sprite, 'sprite');
            enemy.entity.sprite.spriteAsset = sprite.id;
            enemy.shadow.sprite.spriteAsset = sprite.id;
            enemy.shadow.enabled = !type.sea;
            enemy.entity.setLocalPosition(x, enemy.y, type.sea ? Z_BOAT : Z_ENEMY);
        }

        for (const enemy of enemies.items) {
            if (!enemy.active) continue;
            const { type } = enemy;
            enemy.age += dt;
            enemy.cooldown -= dt;
            enemy.flash -= dt;
            PATHS[enemy.path](enemy, dt, world);
            if (player.alive) type.shoot(enemy, dt, world);

            // gone off the screen
            if (enemy.age > 1 && (enemy.x < -24 || enemy.x > WIDTH + 24 || enemy.y < -24 || enemy.y > HEIGHT + 40)) {
                this._freeEnemy(enemy);
                continue;
            }

            // its frames, then its white one
            const frames = enemy.entity.sprite.sprite.frameKeys.length - 1;
            enemy.entity.sprite.frame = enemy.flash > 0 ? frames : Math.floor(enemy.age * 10) % frames;
            place(enemy.entity, enemy.x, enemy.y);
            place(enemy.shadow, enemy.x + SHADOW_X, enemy.y + SHADOW_Y);

            // flown into
            if (
                !type.sea &&
                player.alive &&
                player.shield < 0 &&
                within(enemy.x - player.x, enemy.y - player.y, type.radius + PLAYER_RADIUS + 2)
            ) {
                this._losePlayer();
                if (--enemy.hp <= 0) this._destroyEnemy(enemy);
            }
        }
    }

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updateBossFight(dt) {
        const player = this._player;
        const world = this._world;
        const boss = this._boss;
        const barBack = this._barBack;
        const barFill = this._barFill;

        if (boss.state === 'away') {
            // it is announced once the raiders are through
            if (this._state === 'play' && this._stageTime > BOSS_AT) {
                boss.state = 'warning';
                boss.timer = 2.6;
                this._announce('WARNING!', 2.6);
                this._sound('alarm');
            }
            return;
        }

        boss.timer -= dt;
        if (boss.state === 'warning') {
            if (boss.timer >= 0) return;

            // it comes in from above the screen, and is put there below, on the frame it first
            // shows
            boss.state = 'fight';
            boss.hpMax = boss.hp = Math.ceil(BOSS.hp * (1 + world.loop * 0.4));
            boss.x = WIDTH / 2;
            boss.y = HEIGHT + 40;
            boss.age = boss.attack = boss.burst = 0;
            boss.cooldown = 1.5;
            boss.entity.enabled = boss.shadow.enabled = barBack.enabled = barFill.enabled = true;
        }

        if (boss.state === 'fight') {
            updateBoss(boss, dt, player.alive ? world : { ...world, ...HOLD_FIRE });
            if (
                player.alive &&
                player.shield < 0 &&
                Math.abs(player.x - boss.x) < BOSS.halfWidth &&
                Math.abs(player.y - boss.y) < BOSS.halfHeight
            ) {
                this._losePlayer();
            }
            if (boss.hp <= 0) {
                boss.state = 'sinking';
                boss.timer = 2.2;
                this._orbs.freeAll();
                this._needles.freeAll();
                this._missiles.freeAll();
                barBack.enabled = barFill.enabled = false;
            }
        } else {
            // going up: explosions along it, then one flash
            boss.y -= 8 * dt;
            if (Math.random() < dt * 14) {
                this._effect(
                    Math.random() < 0.5 ? 'blast' : 'boom',
                    boss.x + random(-56, 56),
                    boss.y + random(-14, 14)
                );
                this._sound('blast', varied());
                this._shake = Math.max(this._shake, 3);
            }
            if (boss.timer < 0) {
                boss.state = 'away';
                boss.entity.enabled = boss.shadow.enabled = false;
                this._flash.enabled = true;
                this._flash.sprite.opacity = 1;
                this._shake = 9;
                this._award(BOSS.score * (1 + world.loop));
                this._drop('life', boss.x, boss.y);
                // the stage starts again, harder
                world.loop++;
                this._stageTime = -5;
                this._arrival = 0;
                this._announce(`STAGE ${world.loop + 1}`, 3);
                return;
            }
        }

        // its frame, or its white one
        boss.flash -= dt;
        boss.entity.sprite.frame = boss.flash > 0 ? 1 : 0;
        place(boss.entity, boss.x, boss.y);
        place(boss.shadow, boss.x + SHADOW_X * 2, boss.y + SHADOW_Y * 2);

        // the bar is a white pixel of the sheet, stretched and tinted
        const width = Math.max(0, (BAR_WIDTH * boss.hp) / boss.hpMax);
        barFill.setLocalScale(width / 2, 2, 1);
        place(barFill, WIDTH / 2 - BAR_WIDTH / 2 + width / 2, HEIGHT - 18);
    }

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updatePickups(dt) {
        const player = this._player;
        const pickups = this._pickups;

        for (const pickup of pickups.items) {
            if (!pickup.active) continue;
            pickup.age += dt;
            pickup.y -= 28 * dt;
            if (pickup.y < -10) {
                pickups.free(pickup);
                continue;
            }
            place(pickup.entity, pickup.x + Math.sin(pickup.age * 2.5) * 6, pickup.y);
            if (player.alive && within(pickup.x - player.x, pickup.y - player.y, 14)) {
                pickups.free(pickup);
                this._sound('pickup');
                if (pickup.kind === 'life') {
                    player.lives = Math.min(this._lifeIcons.length, player.lives + 1);
                } else if (player.power < GUNS.length) {
                    player.power++;
                } else {
                    this._award(1000);
                }
            }
        }
    }

    /**
     * @param {number} dt - The time step.
     * @private
     */
    _updateHud(dt) {
        const state = this._state;
        const time = this._time;
        const message = this._message;

        write(this._scoreText, pad(this._score));
        write(this._bestText, `HI ${pad(this._best)}`);
        this._lifeIcons.forEach((icon, i) => {
            icon.enabled = state !== 'title' && i < this._player.lives;
        });

        const title = state === 'title';
        this._logo.enabled = title;
        this._hintText.enabled = state !== 'play' && Math.floor(time * 2.5) % 2 === 0;

        this._messageTime -= dt;
        this._messageText.enabled =
            !title && this._messageTime > 0 && (message !== 'WARNING!' || Math.floor(time * 6) % 2 === 0);
        write(this._messageText, message, message === 'WARNING!' || message === 'GAME OVER' ? PINK : Color.WHITE);

        // the flash fades
        const flash = this._flash;
        if (flash.enabled) {
            flash.sprite.opacity = Math.max(0, flash.sprite.opacity - dt * 2.2);
            flash.enabled = flash.sprite.opacity > 0;
        }
    }

    /**
     * @param {number} frameDt - The time since the last frame, in seconds.
     */
    update(frameDt) {
        if (!this._started) {
            this._started = true;
            this._start();
        }

        const dt = Math.min(frameDt, 1 / 30);
        this._time += dt;

        const world = this._world;
        const pointer = this._pointer;
        const keyboard = this.app.keyboard;

        // the sea slides down a tile and starts again, and the islands go with it, pixel for pixel
        const scrolled = Math.floor(this._time * SCROLL_SPEED + SCROLL_START);
        place(this._sea, WIDTH / 2, HEIGHT / 2 + this._seaTile / 2 - (scrolled % this._seaTile));
        world.scrolled = scrolled - this._scroll;
        this._scroll = scrolled;
        drift(this._islands, world.scrolled, 220);
        drift(this._clouds, 58 * dt, 420);

        if (this._state === 'play') {
            this._stageTime += dt;
        } else if (pointer.pressed || keyboard.wasPressed(KEY_SPACE) || keyboard.wasPressed(KEY_ENTER)) {
            // from the title, or a moment after the game is over
            if (this._state === 'title' || this._player.respawn < -1) this._startGame();
        }

        if (this._state !== 'title') {
            this._updatePlayer(dt);
            this._updateEnemies(dt);
            this._updateBossFight(dt);
            this._updateShots(dt);
            this._updatePickups(dt);
        }
        this._updateHud(dt);

        // the screen shakes by whole pixels, and settles
        this._shake = Math.max(0, this._shake - dt * 18);
        const shake = this._shake;
        this.camera.setPosition(
            WIDTH / 2 + Math.round(random(-shake, shake)),
            HEIGHT / 2 + Math.round(random(-shake, shake)),
            this.camera.getPosition().z
        );

        pointer.dx = pointer.dy = 0;
        pointer.pressed = false;
    }
}
