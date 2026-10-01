import {
    ADDRESS_CLAMP_TO_EDGE,
    ADDRESS_REPEAT,
    BLEND_ADDITIVE,
    BLEND_NORMAL,
    BUFFER_DYNAMIC,
    BoundingBox,
    CULLFACE_NONE,
    Color,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    FILTER_NEAREST,
    Frustum,
    Mat4,
    Mesh,
    MeshInstance,
    PIXELFORMAT_R32F,
    PIXELFORMAT_R8,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_SRGBA8,
    Quat,
    SEMANTIC_ATTR12,
    SEMANTIC_ATTR8,
    SEMANTIC_NORMAL,
    SEMANTIC_POSITION,
    SEMANTIC_TEXCOORD0,
    SHADERLANGUAGE_GLSL,
    SHADERLANGUAGE_WGSL,
    Script,
    ShaderMaterial,
    SphereGeometry,
    StandardMaterial,
    TYPE_FLOAT32,
    TYPE_INT8,
    Texture,
    Vec3,
    VertexBuffer,
    VertexFormat,
    math,
    platform
} from 'playcanvas';

import {
    barkChunks,
    cloudFragmentGLSL,
    cloudFragmentWGSL,
    cloudVertexGLSL,
    cloudVertexWGSL,
    grassChunks,
    leafChunks,
    pollenFragmentGLSL,
    pollenFragmentWGSL,
    pollenVertexGLSL,
    pollenVertexWGSL,
    terrainChunks
} from './golden-meadow-shaders.mjs';

/**
 * @import { AppBase, Entity } from 'playcanvas';
 */

/**
 * The scripts behind the golden meadow. MeadowTerrain builds the rolling hills and MeadowGrass
 * grows the grass on them - a few hundred thousand blades, each planted, shaped and bent by the
 * wind in its vertex shader. MeadowTrees plants the woods around the meadow, MeadowSky puts clouds
 * and haze in the sky, MeadowPollen fills the air with drifting motes, MeadowWind blows through all
 * of them, and MeadowGlide walks the camera through it all.
 *
 * The world they share is made once, by getMeadow: the heightfield the hills are built from, and
 * the textures the shaders read the meadow's make-up from. The shaders themselves are in
 * golden-meadow-shaders.mjs.
 */

/** The engine version the shader chunk overrides in golden-meadow-shaders.mjs were written against. */
const CHUNKS_VERSION = '2.22';

// ---------------------------------------------------------------------------------------------
// The world: a heightfield of rolling hills in a ring of mountains, and a path through the grass
// ---------------------------------------------------------------------------------------------

/** The terrain spans this many meters in x and z, centered on the origin. */
const WORLD_SIZE = 2048;

/** Height samples along each side of the terrain: 4 m apart. */
const HEIGHT_SAMPLES = 513;

/** The path's distance field spans this many meters, centered on the origin. */
const PATH_SIZE = 1024;

/** Texels along each side of the path's distance field: 2 m apart. */
const PATH_TEXELS = 512;

/** Distances from the path are stored up to this many meters. */
const PATH_RANGE = 24;

/** Texels along each side of the tiling noise texture. */
const NOISE_SIZE = 256;

/**
 * A small, fast, seeded pseudo random number generator (mulberry32).
 *
 * @param {number} seed - The seed.
 * @returns {() => number} A function returning numbers in [0, 1).
 */
const random = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The gradients of the lattice noise, 256 unit vectors in a shuffled order. */
const GRADIENTS = (() => {
    const rng = random(1337);
    const g = new Float32Array(512);
    for (let i = 0; i < 256; i++) {
        const a = rng() * Math.PI * 2;
        g[i * 2] = Math.cos(a);
        g[i * 2 + 1] = Math.sin(a);
    }
    return g;
})();

/**
 * Hashes a lattice point to one of the 256 gradients.
 *
 * @param {number} ix - The integer x.
 * @param {number} iz - The integer z.
 * @param {number} period - The lattice wraps after this many cells, 0 for no wrapping.
 * @param {number} seed - Picks one of many unrelated lattices.
 * @returns {number} The gradient's index, times two.
 */
const gradientIndex = (ix, iz, period, seed) => {
    if (period) {
        ix = ((ix % period) + period) % period;
        iz = ((iz % period) + period) % period;
    }
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 255) * 2;
};

/**
 * Gradient noise in two dimensions, about -0.7 to 0.7.
 *
 * @param {number} x - The x coordinate, in lattice cells.
 * @param {number} z - The z coordinate, in lattice cells.
 * @param {number} [period] - The noise repeats after this many cells, 0 for never.
 * @param {number} [seed] - Picks one of many unrelated noises.
 * @returns {number} The noise.
 */
const noise = (x, z, period = 0, seed = 0) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const g00 = gradientIndex(ix, iz, period, seed);
    const g10 = gradientIndex(ix + 1, iz, period, seed);
    const g01 = gradientIndex(ix, iz + 1, period, seed);
    const g11 = gradientIndex(ix + 1, iz + 1, period, seed);
    const n00 = GRADIENTS[g00] * fx + GRADIENTS[g00 + 1] * fz;
    const n10 = GRADIENTS[g10] * (fx - 1) + GRADIENTS[g10 + 1] * fz;
    const n01 = GRADIENTS[g01] * fx + GRADIENTS[g01 + 1] * (fz - 1);
    const n11 = GRADIENTS[g11] * (fx - 1) + GRADIENTS[g11 + 1] * (fz - 1);
    const a = n00 + (n10 - n00) * ux;
    const b = n01 + (n11 - n01) * ux;
    return a + (b - a) * uz;
};

/**
 * Fractal noise: octaves of gradient noise, each twice the frequency and half the amplitude of
 * the one before, turned a little so their lattices never line up.
 *
 * @param {number} x - The x coordinate.
 * @param {number} z - The z coordinate.
 * @param {number} octaves - How many octaves.
 * @returns {number} The noise, about -1 to 1.
 */
const fbm = (x, z, octaves) => {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += noise(x, z) * amplitude;
        norm += amplitude;
        amplitude *= 0.5;
        const nx = x * 1.6 - z * 1.2 + 17.1;
        z = x * 1.2 + z * 1.6 - 9.3;
        x = nx;
    }
    return (sum / norm) * 1.6;
};

/**
 * Ridged fractal noise, for mountains: sharp crests between rounded valleys.
 *
 * @param {number} x - The x coordinate.
 * @param {number} z - The z coordinate.
 * @param {number} octaves - How many octaves.
 * @returns {number} The noise, 0 to about 1.
 */
const ridged = (x, z, octaves) => {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let weight = 1;
    for (let i = 0; i < octaves; i++) {
        let n = 1 - Math.abs(noise(x, z) * 1.4);
        n *= n * weight;
        weight = math.clamp(n * 1.5, 0, 1);
        sum += n * amplitude;
        norm += amplitude;
        amplitude *= 0.5;
        const nx = x * 1.6 - z * 1.2 + 5.7;
        z = x * 1.2 + z * 1.6 + 3.1;
        x = nx;
    }
    return sum / norm;
};

/**
 * Hermite interpolation between two edges: 0 below the first, 1 above the second.
 *
 * @param {number} edge0 - The lower edge.
 * @param {number} edge1 - The upper edge.
 * @param {number} x - The value.
 * @returns {number} The interpolant.
 */
const smoothstep = (edge0, edge1, x) => {
    const t = math.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};

/**
 * The path's center line: it winds north to south through the meadow, crossing the origin.
 *
 * @param {number} z - How far north or south.
 * @returns {number} The path's x at that z.
 */
const pathX = (z) => 14 * Math.sin(z / 61 + 0.4) + 6 * Math.sin(z / 23 - 1.1) - 14 * Math.sin(0.4) - 6 * Math.sin(-1.1);

/**
 * The height of the land at a point, before it is sampled into the heightfield: gently rolling
 * hills, cupped in a ring of mountains, with the path worn a little way into them.
 *
 * @param {number} x - World x.
 * @param {number} z - World z.
 * @returns {number} The height, in meters.
 */
const landHeight = (x, z) => {
    let h = fbm(x / 240, z / 240, 4) * 11 + fbm(x / 70 + 3.7, z / 70 - 8.2, 3) * 1.8;
    const r = Math.hypot(x, z * 1.25);
    const ring = smoothstep(380, 1000, r);
    const hills = fbm(x / 420 + 11.3, z / 420 - 4.1, 5) * 0.5 + 0.5;
    h += ring * (30 + hills * 120 + ridged(x / 300 - 2.9, z / 300 + 7.7, 4) * 45 * ring);
    // the path runs a hand's breadth below the grass either side of it
    const across = Math.abs(x - pathX(z));
    h -= 0.12 * (1 - smoothstep(0.6, 2.2, across));
    return h;
};

/**
 * @typedef {object} Meadow
 * @property {Float32Array} heights - The heightfield, HEIGHT_SAMPLES by HEIGHT_SAMPLES, x fastest.
 * @property {number} origin - World x and z of the heightfield's first sample.
 * @property {number} spacing - Meters between samples.
 * @property {(x: number, z: number) => number} heightAt - The ground's height at a point,
 * interpolated across the same triangles the terrain is built from.
 * @property {Uint8Array} noise - The tiling noise noiseMap is made from, four channels a texel.
 * @property {Texture} heightMap - The heightfield, for the shaders.
 * @property {Texture} noiseMap - Four channels of tiling noise the shaders make the meadow's
 * patchwork from.
 * @property {Texture} pathMap - The distance to the path, over the middle of the meadow.
 * @property {Record<string, number[]|Texture>} parameters - The shader parameters these make.
 */

/** @type {WeakMap<AppBase, Meadow>} */
const meadows = new WeakMap();

/**
 * The world every meadow script shares, made the first time any of them asks for it.
 *
 * @param {AppBase} app - The application.
 * @returns {Meadow} The meadow.
 */
const getMeadow = (app) => {
    let meadow = meadows.get(app);
    if (meadow) {
        return meadow;
    }
    const device = app.graphicsDevice;

    // The heightfield
    const n = HEIGHT_SAMPLES;
    const spacing = WORLD_SIZE / (n - 1);
    const origin = -WORLD_SIZE / 2;
    const heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            heights[j * n + i] = landHeight(origin + i * spacing, origin + j * spacing);
        }
    }

    const heightAt = (x, z) => {
        const gx = math.clamp((x - origin) / spacing, 0, n - 1.001);
        const gz = math.clamp((z - origin) / spacing, 0, n - 1.001);
        const i = Math.floor(gx);
        const j = Math.floor(gz);
        const fx = gx - i;
        const fz = gz - j;
        const k = j * n + i;
        const h00 = heights[k];
        const h11 = heights[k + n + 1];
        if (fx > fz) {
            const h10 = heights[k + 1];
            return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
        }
        const h01 = heights[k + n];
        return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
    };

    const heightMap = new Texture(device, {
        name: 'meadow-heights',
        width: n,
        height: n,
        format: PIXELFORMAT_R32F,
        mipmaps: false,
        minFilter: FILTER_NEAREST,
        magFilter: FILTER_NEAREST,
        addressU: ADDRESS_CLAMP_TO_EDGE,
        addressV: ADDRESS_CLAMP_TO_EDGE,
        levels: [heights]
    });

    // Tiling noise: four independent channels of fractal noise that repeat seamlessly, which the
    // shaders sample at several scales to lay out the meadow's patches - dry and lush, tall and
    // short, flowers and none - and to shape the gusts of wind
    const noiseData = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    for (let c = 0; c < 4; c++) {
        for (let y = 0; y < NOISE_SIZE; y++) {
            for (let x = 0; x < NOISE_SIZE; x++) {
                let sum = 0;
                let amplitude = 0.5;
                for (let o = 0, period = 4; o < 4; o++, period *= 2) {
                    const s = period / NOISE_SIZE;
                    sum += noise(x * s, y * s, period, c * 4 + o + 1) * amplitude;
                    amplitude *= 0.5;
                }
                noiseData[(y * NOISE_SIZE + x) * 4 + c] = math.clamp(Math.round((sum * 1.25 + 0.5) * 255), 0, 255);
            }
        }
    }
    const noiseMap = new Texture(device, {
        name: 'meadow-noise',
        width: NOISE_SIZE,
        height: NOISE_SIZE,
        format: PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: FILTER_LINEAR,
        addressU: ADDRESS_REPEAT,
        addressV: ADDRESS_REPEAT,
        levels: [noiseData]
    });

    // The path, as a distance field: bilinear filtering of distances keeps its edges crisp even
    // at 2 m per texel
    const pathData = new Uint8Array(PATH_TEXELS * PATH_TEXELS);
    const texel = PATH_SIZE / PATH_TEXELS;
    for (let j = 0; j < PATH_TEXELS; j++) {
        const z = -PATH_SIZE / 2 + (j + 0.5) * texel;
        const cx = pathX(z);
        const slope = pathX(z + 0.5) - pathX(z - 0.5);
        const cos = 1 / Math.sqrt(1 + slope * slope);
        for (let i = 0; i < PATH_TEXELS; i++) {
            const x = -PATH_SIZE / 2 + (i + 0.5) * texel;
            const d = Math.abs(x - cx) * cos;
            pathData[j * PATH_TEXELS + i] = Math.round(Math.min(d / PATH_RANGE, 1) * 255);
        }
    }
    const pathMap = new Texture(device, {
        name: 'meadow-path',
        width: PATH_TEXELS,
        height: PATH_TEXELS,
        format: PIXELFORMAT_R8,
        mipmaps: false,
        minFilter: FILTER_LINEAR,
        magFilter: FILTER_LINEAR,
        addressU: ADDRESS_CLAMP_TO_EDGE,
        addressV: ADDRESS_CLAMP_TO_EDGE,
        levels: [pathData]
    });

    meadow = {
        heights,
        origin,
        spacing,
        heightAt,
        noise: noiseData,
        heightMap,
        noiseMap,
        pathMap,
        parameters: {
            meadowHeightMap: heightMap,
            meadowHeightParams: [origin, origin, 1 / spacing, n - 1],
            meadowNoiseMap: noiseMap,
            meadowPathMap: pathMap,
            meadowPathParams: [-PATH_SIZE / 2, -PATH_SIZE / 2, 1 / PATH_SIZE, PATH_RANGE],
            meadowLushBase: [0.016, 0.036, 0.007],
            meadowLushTip: [0.1, 0.21, 0.035],
            meadowDryBase: [0.075, 0.06, 0.022],
            meadowDryTip: [0.44, 0.34, 0.13]
        }
    };
    meadows.set(app, meadow);
    return meadow;
};

/**
 * Applies a set of shader chunk overrides, in both shading languages, to a material.
 *
 * @param {StandardMaterial} material - The material.
 * @param {{ glsl: Record<string, string>, wgsl: Record<string, string> }} chunks - The chunks.
 */
const setChunks = (material, chunks) => {
    material.shaderChunksVersion = CHUNKS_VERSION;
    const glsl = material.getShaderChunks(SHADERLANGUAGE_GLSL);
    const wgsl = material.getShaderChunks(SHADERLANGUAGE_WGSL);
    for (const name in chunks.glsl) {
        glsl.set(name, chunks.glsl[name]);
    }
    for (const name in chunks.wgsl) {
        wgsl.set(name, chunks.wgsl[name]);
    }
};

/**
 * Samples one channel of the tiling noise as the shaders do: bilinearly, wrapping around.
 *
 * @param {Uint8Array} noise - The noise, from the meadow.
 * @param {number} u - The horizontal texture coordinate.
 * @param {number} v - The vertical texture coordinate.
 * @param {number} channel - Which channel, 0 to 3.
 * @returns {number} The noise, 0 to 1.
 */
const sampleNoise = (noise, u, v, channel) => {
    const x = u * NOISE_SIZE - 0.5;
    const y = v * NOISE_SIZE - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const texel = (i, j) => {
        const wi = ((i % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
        const wj = ((j % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
        return noise[(wj * NOISE_SIZE + wi) * 4 + channel] / 255;
    };
    const a = texel(x0, y0) + (texel(x0 + 1, y0) - texel(x0, y0)) * fx;
    const b = texel(x0, y0 + 1) + (texel(x0 + 1, y0 + 1) - texel(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
};

/**
 * How hard the wind gusts at a point, 0 to 1: the same broad waves, rolling downwind across the
 * meadow, that the grass's vertex shader bends the blades by.
 *
 * @param {Meadow} meadow - The meadow.
 * @param {number} x - World x.
 * @param {number} z - World z.
 * @param {number} rolledX - How far the gusts have rolled in x, in meters at 1 m/s.
 * @param {number} rolledZ - How far the gusts have rolled in z, in meters at 1 m/s.
 * @returns {number} The gust.
 */
const gustAt = (meadow, x, z, rolledX, rolledZ) => {
    const gx = x - rolledX * 5.5;
    const gz = z - rolledZ * 5.5;
    const broad = sampleNoise(meadow.noise, gx / 47, gz / 47, 0);
    const fine = sampleNoise(meadow.noise, gx / 13 + 0.5, gz / 13 + 0.5, 1);
    return smoothstep(0.3, 0.75, broad * 0.7 + fine * 0.3);
};

// ---------------------------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------------------------

/**
 * The wind over the meadow: its heading, its strength, and the clock the grass sways by, handed
 * to every shader at once as global uniforms - and the sound of it in the grass, which is silent
 * in a calm, grows with the wind's strength, and swells as each gust the grass shows passes over
 * the listener.
 */
export class MeadowWind extends Script {
    static scriptName = 'meadowWind';

    /**
     * The compass heading the wind blows toward, in degrees: 0 is toward -z.
     *
     * @attribute
     * @type {number}
     */
    heading = 60;

    /**
     * How hard the wind blows: 0 is still, 1 a stiff breeze.
     *
     * @attribute
     * @type {number}
     */
    strength = 0.6;

    /**
     * The entity whose sound component plays the wind, in a slot named wind.
     *
     * @attribute
     * @type {Entity}
     */
    sound = null;

    /**
     * Where the wind is heard from, whose gusts it swells with: the camera.
     *
     * @attribute
     * @type {Entity}
     */
    listener = null;

    /**
     * How loud the wind sounds in a stiff breeze, 0 to 1.
     *
     * @attribute
     * @type {number}
     */
    loudness = 0.55;

    _time = 0;

    _wind = new Float32Array(4);

    /**
     * How far the wind has carried things: x and z for its gusts, which roll on at a steady
     * pace, and x and z for the air itself, and whatever floats on it, which moves faster the
     * harder the wind blows.
     */
    _drift = new Float32Array(4);

    /** The gust being heard, following the one passing over the listener a moment behind. */
    _gust = 0.5;

    initialize() {
        this._meadow = getMeadow(this.app);
    }

    update(dt) {
        this._time += dt;
        const a = this.heading * math.DEG_TO_RAD;
        this._wind[0] = Math.sin(a);
        this._wind[1] = -Math.cos(a);
        this._wind[2] = this.strength;
        this._wind[3] = this._time;

        // Added up a frame at a time, so that turning the wind or changing its strength changes
        // how fast things drift from then on, rather than moving everything at once
        const airSpeed = 0.35 + 0.9 * Math.max(this.strength, 0);
        this._drift[0] += this._wind[0] * dt;
        this._drift[1] += this._wind[1] * dt;
        this._drift[2] += this._wind[0] * airSpeed * dt;
        this._drift[3] += this._wind[1] * airSpeed * dt;

        const scope = this.app.graphicsDevice.scope;
        scope.resolve('meadowWind').setValue(this._wind);
        scope.resolve('meadowDrift').setValue(this._drift);

        // The wind's sound: a light air barely stirs the grass, a gale roars through it, and each
        // gust swells it gently as it passes
        const slot = this.sound?.sound?.slot('wind');
        if (slot) {
            const at = this.listener?.getPosition();
            const gust = at ? gustAt(this._meadow, at.x, at.z, this._drift[0], this._drift[1]) : 0.5;
            this._gust += (gust - this._gust) * (1 - Math.exp(-dt / 0.8));
            const level = Math.min(Math.pow(Math.max(this.strength, 0), 1.3), 1.25);
            slot.volume = this.loudness * level * (0.4 + 0.6 * this._gust);
        }
    }
}

/**
 * The sky over the meadow: a broken layer of fair weather cloud drifting past, lit by the sun, and
 * the haze in the air below it - which the ground, the grass and the clouds all fade into with
 * distance, glowing gold toward the sun.
 */
export class MeadowSky extends Script {
    static scriptName = 'meadowSky';

    /**
     * The directional light that is the sun.
     *
     * @attribute
     * @type {Entity}
     */
    sun = null;

    /**
     * How much of the sky the clouds cover, 0 to 1.
     *
     * @attribute
     * @type {number}
     */
    cover = 0.45;

    /**
     * The color of the clear sky overhead, which lights the clouds' shaded sides.
     *
     * @attribute
     * @type {Color}
     */
    skyColor = new Color(0.32, 0.45, 0.68);

    /**
     * How brightly the haze glows toward the sun, as a share of the sunlight.
     *
     * @attribute
     * @type {number}
     */
    sunHaze = 0.22;

    /**
     * How quickly the haze thins with height: it halves every 0.69 / falloff meters.
     *
     * @attribute
     * @type {number}
     */
    hazeFalloff = 0.006;

    _sunDirection = new Float32Array(3);

    _sunColor = new Float32Array(3);

    _sunHaze = new Float32Array(3);

    _skyColor = new Float32Array(3);

    initialize() {
        const meadow = getMeadow(this.app);
        const device = this.app.graphicsDevice;
        const mesh = Mesh.fromGeometry(
            device,
            new SphereGeometry({ radius: 1, latitudeBands: 24, longitudeBands: 48 })
        );
        const material = new ShaderMaterial({
            uniqueName: 'meadow-clouds',
            vertexGLSL: cloudVertexGLSL,
            fragmentGLSL: cloudFragmentGLSL,
            vertexWGSL: cloudVertexWGSL,
            fragmentWGSL: cloudFragmentWGSL,
            attributes: { vertex_position: SEMANTIC_POSITION }
        });
        material.blendType = BLEND_NORMAL;
        material.depthWrite = false;
        material.cull = CULLFACE_NONE;
        material.setParameter('meadowNoiseMap', meadow.noiseMap);
        material.update();
        this._material = material;

        const meshInstance = new MeshInstance(mesh, material);
        meshInstance.cull = false;
        this.entity.addComponent('render', {
            meshInstances: [meshInstance],
            castShadows: false,
            receiveShadows: false
        });

        this.on('destroy', () => {
            mesh.destroy();
            material.destroy();
        });
    }

    update() {
        const light = this.sun?.light;
        if (!light) {
            return;
        }
        // A directional light shines down its entity's -y axis
        const up = this.sun.up;
        this._sunDirection[0] = up.x;
        this._sunDirection[1] = up.y;
        this._sunDirection[2] = up.z;
        const c = light.color;
        const i = light.intensity;
        this._sunColor[0] = c.r * i * 0.55;
        this._sunColor[1] = c.g * i * 0.55;
        this._sunColor[2] = c.b * i * 0.55;
        this._sunHaze[0] = c.r * i * this.sunHaze;
        this._sunHaze[1] = c.g * i * this.sunHaze;
        this._sunHaze[2] = c.b * i * this.sunHaze;
        // The sky dims as the sun sinks, and the clouds' shaded sides with it
        const dusk = math.clamp(up.y * 6, 0.3, 1);
        this._skyColor[0] = this.skyColor.r * dusk;
        this._skyColor[1] = this.skyColor.g * dusk;
        this._skyColor[2] = this.skyColor.b * dusk;

        // The haze is global, for every material that fades into it
        const scope = this.app.graphicsDevice.scope;
        scope.resolve('meadowSunDirection').setValue(this._sunDirection);
        scope.resolve('meadowSunHaze').setValue(this._sunHaze);
        scope.resolve('meadowHazeFalloff').setValue(this.hazeFalloff);

        const material = this._material;
        material.setParameter('cloudSunDirection', this._sunDirection);
        material.setParameter('cloudSunColor', this._sunColor);
        material.setParameter('cloudSkyColor', this._skyColor);
        material.setParameter('cloudCover', this.cover);
    }
}

/**
 * Pollen and seed fluff, drifting on the wind around the camera and catching the low sun.
 */
export class MeadowPollen extends Script {
    static scriptName = 'meadowPollen';

    /**
     * The directional light that is the sun.
     *
     * @attribute
     * @type {Entity}
     */
    sun = null;

    /**
     * How many motes drift about the camera.
     *
     * @attribute
     * @type {number}
     */
    count = 1400;

    /**
     * The size of the box of air around the camera they drift in, in meters.
     *
     * @attribute
     * @type {Vec3}
     */
    box = new Vec3(18, 5, 18);

    _sunDirection = new Float32Array(3);

    _sunColor = new Float32Array(3);

    initialize() {
        const device = this.app.graphicsDevice;
        const rng = random(4242);
        const count = this.count;
        const corners = new Float32Array(count * 16);
        const seeds = new Float32Array(count * 16);
        const indices = new Uint32Array(count * 6);
        for (let m = 0; m < count; m++) {
            // Mostly specks of pollen a millimeter or two across, and now and then a tuft of fluff
            const size = rng() < 0.04 ? 0.0025 + rng() * 0.0025 : 0.0008 + rng() * 0.0012;
            const phase = rng();
            const sx = rng();
            const sy = rng();
            const sz = rng();
            for (let c = 0; c < 4; c++) {
                const v = m * 4 + c;
                corners[v * 4] = c & 1 ? 1 : -1;
                corners[v * 4 + 1] = c & 2 ? 1 : -1;
                corners[v * 4 + 2] = size;
                corners[v * 4 + 3] = phase;
                seeds[v * 4] = sx;
                seeds[v * 4 + 1] = sy;
                seeds[v * 4 + 2] = sz;
            }
            indices.set([m * 4, m * 4 + 1, m * 4 + 2, m * 4 + 2, m * 4 + 1, m * 4 + 3], m * 6);
        }
        const mesh = new Mesh(device);
        mesh.setVertexStream(SEMANTIC_POSITION, corners, 4);
        mesh.setVertexStream(SEMANTIC_ATTR8, seeds, 4);
        mesh.setIndices(indices);
        mesh.update();
        mesh.aabb = new BoundingBox(new Vec3(), new Vec3(1e5, 1e5, 1e5));

        const material = new ShaderMaterial({
            uniqueName: 'meadow-pollen',
            vertexGLSL: pollenVertexGLSL,
            fragmentGLSL: pollenFragmentGLSL,
            vertexWGSL: pollenVertexWGSL,
            fragmentWGSL: pollenFragmentWGSL,
            attributes: { vertex_position: SEMANTIC_POSITION, pollenSeed: SEMANTIC_ATTR8 }
        });
        material.blendType = BLEND_ADDITIVE;
        material.depthWrite = false;
        material.cull = CULLFACE_NONE;
        material.setParameter('pollenBox', [this.box.x, this.box.y, this.box.z]);
        material.update();
        this._material = material;

        const meshInstance = new MeshInstance(mesh, material);
        meshInstance.cull = false;
        this.entity.addComponent('render', {
            meshInstances: [meshInstance],
            castShadows: false,
            receiveShadows: false
        });

        this.on('destroy', () => {
            mesh.destroy();
            material.destroy();
        });
    }

    update() {
        const light = this.sun?.light;
        if (!light) {
            return;
        }
        const up = this.sun.up;
        this._sunDirection[0] = up.x;
        this._sunDirection[1] = up.y;
        this._sunDirection[2] = up.z;
        const c = light.color;
        const i = light.intensity;
        this._sunColor[0] = c.r * i;
        this._sunColor[1] = c.g * i;
        this._sunColor[2] = c.b * i;
        this._material.setParameter('pollenSunDirection', this._sunDirection);
        this._material.setParameter('pollenSunColor', this._sunColor);
    }
}

/**
 * A slow walk through the meadow, for the camera: it follows a long loop over the hills at eye
 * height, looking ahead and idly about, and you can look around yourself by dragging.
 */
export class MeadowGlide extends Script {
    static scriptName = 'meadowGlide';

    /**
     * How fast the walk goes, in meters per second.
     *
     * @attribute
     * @type {number}
     */
    speed = 1.1;

    /**
     * The eye's height above the ground, in meters.
     *
     * @attribute
     * @type {number}
     */
    height = 1.3;

    /**
     * Whether the walk has stopped, leaving you to look around.
     *
     * @attribute
     * @type {boolean}
     */
    paused = false;

    /**
     * Where on the loop the walk starts, in meters along it.
     *
     * @attribute
     * @type {number}
     */
    start = 165;

    /** How far along the loop the walk is, in meters. */
    _along = 0;

    _time = 0;

    /** Where you have turned to look, in degrees, on top of where the walk looks. */
    _yaw = 0;

    _pitch = 0;

    _targetYaw = 0;

    _targetPitch = 0;

    _eyeY = null;

    /** The loop, sampled evenly: x and z every meter of its length. */
    _loop = null;

    _here = new Vec3();

    _ahead = new Vec3();

    initialize() {
        this._meadow = getMeadow(this.app);
        this._buildLoop();
        this._along = this.start;

        // Dragging looks around; a press is captured so the drag keeps going off the canvas
        const canvas = this.app.graphicsDevice.canvas;
        let dragging = null;
        const down = (event) => {
            if (event.isPrimary) {
                dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
                canvas.setPointerCapture(event.pointerId);
            }
        };
        const move = (event) => {
            if (dragging?.id !== event.pointerId) {
                return;
            }
            const scale = 180 / Math.max(canvas.clientHeight, 1);
            this._targetYaw -= (event.clientX - dragging.x) * scale * 0.6;
            this._targetPitch = math.clamp(this._targetPitch - (event.clientY - dragging.y) * scale * 0.6, -55, 40);
            dragging.x = event.clientX;
            dragging.y = event.clientY;
        };
        const up = (event) => {
            if (dragging?.id === event.pointerId) {
                dragging = null;
            }
        };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        this.on('destroy', () => {
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', up);
        });
    }

    /**
     * Samples the loop evenly by length, so the walk keeps a steady pace: a long, lopsided oval
     * over the hills, crossing and following the path now and then.
     *
     * @private
     */
    _buildLoop() {
        const at = (a) => [70 * Math.sin(a) + 22 * Math.sin(2 * a + 0.7), 105 * Math.cos(a) + 14 * Math.sin(3 * a)];
        const fine = [];
        let length = 0;
        let [px, pz] = at(0);
        for (let i = 1; i <= 20000; i++) {
            const [x, z] = at((i / 20000) * Math.PI * 2);
            length += Math.hypot(x - px, z - pz);
            fine.push([length, x, z]);
            px = x;
            pz = z;
        }
        const meters = Math.floor(length);
        const loop = new Float32Array(meters * 2);
        let j = 0;
        for (let m = 0; m < meters; m++) {
            while (fine[j][0] < m) {
                j++;
            }
            loop[m * 2] = fine[j][1];
            loop[m * 2 + 1] = fine[j][2];
        }
        this._loop = loop;
    }

    /**
     * A point on the loop.
     *
     * @param {number} along - How far along, in meters.
     * @param {Vec3} out - Receives the point's x and z.
     * @returns {Vec3} `out`.
     * @private
     */
    _pointAt(along, out) {
        const loop = this._loop;
        const meters = loop.length / 2;
        const m = ((along % meters) + meters) % meters;
        const i = Math.floor(m);
        const f = m - i;
        const k = (i + 1) % meters;
        out.x = loop[i * 2] + (loop[k * 2] - loop[i * 2]) * f;
        out.z = loop[i * 2 + 1] + (loop[k * 2 + 1] - loop[i * 2 + 1]) * f;
        return out;
    }

    update(dt) {
        // Stopped, the gaze holds still too, and only your own looking around moves it
        if (!this.paused) {
            this._time += dt;
            this._along += this.speed * dt;
        }
        const here = this._pointAt(this._along, this._here);
        const ahead = this._pointAt(this._along + 6, this._ahead);
        const meadow = this._meadow;

        // The eye rides smoothly over the ground rather than every bump in it
        const ground = (meadow.heightAt(here.x, here.z) + meadow.heightAt(ahead.x, ahead.z)) * 0.5;
        const eyeY = ground + this.height;
        this._eyeY = this._eyeY === null ? eyeY : math.lerp(this._eyeY, eyeY, 1 - Math.exp(-dt * 2));

        // Look where the walk goes, drifting slowly from side to side as a walker's gaze does
        const t = this._time;
        const heading = Math.atan2(-(ahead.x - here.x), -(ahead.z - here.z)) * math.RAD_TO_DEG;
        const wander = Math.sin(t * 0.07) * 28 + Math.sin(t * 0.031 + 1.3) * 16;
        const nod = Math.sin(t * 0.05 + 0.4) * 2.5 - 3;
        const ease = 1 - Math.exp(-dt * 8);
        this._yaw += (this._targetYaw - this._yaw) * ease;
        this._pitch += (this._targetPitch - this._pitch) * ease;

        this.entity.setPosition(here.x, this._eyeY, here.z);
        this.entity.setEulerAngles(nod + this._pitch, heading + wander + this._yaw, 0);
    }
}

/**
 * Paints a spray of leaves onto a canvas, for the leaf cards: overlapping leaves of a few greens,
 * each with a paler midrib, on a transparent ground.
 *
 * @param {number} size - The canvas's size, in pixels.
 * @returns {HTMLCanvasElement} The canvas.
 */
const paintLeaves = (size) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rng = random(99);
    const scale = size / 256;
    for (let i = 0; i < 70; i++) {
        const x = 24 * scale + rng() * (size - 48 * scale);
        const y = 24 * scale + rng() * (size - 48 * scale);
        const length = (16 + rng() * 10) * scale;
        const width = length * (0.42 + rng() * 0.15);
        const shade = rng();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.fillStyle = `rgb(${Math.round(38 + shade * 50)}, ${Math.round(62 + shade * 55)}, ${Math.round(18 + shade * 22)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, length, width, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${Math.round(120 + shade * 40)}, ${Math.round(140 + shade * 40)}, 70, 0.5)`;
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(-length * 0.9, 0);
        ctx.lineTo(length * 0.9, 0);
        ctx.stroke();
        ctx.restore();
    }
    return canvas;
};

/**
 * Grows a broadleaf tree: a trunk that forks into spreading limbs, which fork twice more into
 * twigs, each carrying a clump of leaf cards.
 *
 * @param {() => number} rng - The random numbers to grow it by.
 * @returns {{ bark: object, leaves: object }} The bark's and the leaves' geometry: positions,
 * normals, uvs and indices.
 */
const growTree = (rng) => {
    const bark = { positions: [], normals: [], uvs: [], indices: [] };
    const leaves = { positions: [], normals: [], uvs: [], indices: [] };
    const clumps = [];
    const up = new Vec3(0, 1, 0);
    const side = new Vec3();
    const other = new Vec3();

    // A tapered, six-sided limb from a to b
    const limb = (a, b, r0, r1) => {
        const axis = new Vec3().sub2(b, a).normalize();
        side.cross(axis, Math.abs(axis.y) < 0.95 ? up : Vec3.RIGHT).normalize();
        other.cross(axis, side);
        const first = bark.positions.length / 3;
        const sides = 6;
        for (let end = 0; end < 2; end++) {
            const p = end ? b : a;
            const r = end ? r1 : r0;
            for (let k = 0; k < sides; k++) {
                const angle = (k / sides) * Math.PI * 2;
                const nx = side.x * Math.cos(angle) + other.x * Math.sin(angle);
                const ny = side.y * Math.cos(angle) + other.y * Math.sin(angle);
                const nz = side.z * Math.cos(angle) + other.z * Math.sin(angle);
                bark.positions.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
                bark.normals.push(nx, ny, nz);
                bark.uvs.push(k / sides, end);
            }
        }
        for (let k = 0; k < sides; k++) {
            const k1 = (k + 1) % sides;
            bark.indices.push(
                first + k,
                first + k1,
                first + sides + k,
                first + k1,
                first + sides + k1,
                first + sides + k
            );
        }
    };

    // A direction turned away from another by an angle, around it at a random bearing
    const turn = (dir, degrees) => {
        side.cross(dir, Math.abs(dir.y) < 0.95 ? up : Vec3.RIGHT).normalize();
        other.cross(dir, side);
        const bearing = rng() * Math.PI * 2;
        const a = degrees * math.DEG_TO_RAD;
        const out = new Vec3().copy(dir).mulScalar(Math.cos(a));
        out.add(side.clone().mulScalar(Math.sin(a) * Math.cos(bearing)));
        out.add(other.clone().mulScalar(Math.sin(a) * Math.sin(bearing)));
        return out.normalize();
    };

    const branch = (from, dir, length, radius, depth) => {
        const to = new Vec3().copy(dir).mulScalar(length).add(from);
        limb(from, to, radius, radius * 0.68);
        if (depth === 3) {
            clumps.push(to);
            return;
        }
        if (depth >= 1) {
            clumps.push(new Vec3().lerp(from, to, 0.75));
        }
        const forks = depth === 0 ? 4 : depth === 1 ? 3 : 2;
        for (let f = 0; f < forks; f++) {
            const spread = depth === 0 ? 38 + rng() * 22 : 22 + rng() * 22;
            const next = turn(dir, spread);
            // Limbs reach up and out, not down
            next.y = Math.max(next.y, 0.15);
            next.normalize();
            branch(to, next, length * (depth === 0 ? 1.15 : 0.7) * (0.8 + rng() * 0.35), radius * 0.62, depth + 1);
        }
    };

    const lean = turn(up, rng() * 6);
    branch(new Vec3(0, -0.3, 0), lean, 3.8 + rng() * 1.4, 0.42, 0);

    // The crown's heart, which the leaves' normals point away from
    const heart = new Vec3();
    for (const c of clumps) {
        heart.add(c);
    }
    heart.mulScalar(1 / clumps.length);
    heart.y -= 1;

    // Leaf cards around each clump, some tilted toward the sky
    const normal = new Vec3();
    const u = new Vec3();
    const v = new Vec3();
    const corner = new Vec3();
    for (const c of clumps) {
        const cards = 12;
        for (let q = 0; q < cards; q++) {
            const offset = turn(up, rng() * 180).mulScalar(0.3 + rng() * 1.6);
            const center = new Vec3().add2(c, offset);
            normal.copy(turn(up, rng() * 180));
            u.cross(normal, Math.abs(normal.y) < 0.95 ? up : Vec3.RIGHT).normalize();
            v.cross(normal, u);
            const s = 0.85 + rng() * 0.5;
            const first = leaves.positions.length / 3;
            for (let k = 0; k < 4; k++) {
                const su = k & 1 ? 1 : -1;
                const sv = k & 2 ? 1 : -1;
                corner
                    .copy(center)
                    .add(u.clone().mulScalar(su * s))
                    .add(v.clone().mulScalar(sv * s));
                leaves.positions.push(corner.x, corner.y, corner.z);
                const out = new Vec3().sub2(corner, heart).normalize();
                const clump = new Vec3().sub2(corner, c).normalize();
                out.mulScalar(0.65).add(clump.mulScalar(0.35)).normalize();
                leaves.normals.push(out.x, out.y, out.z);
                leaves.uvs.push(k & 1 ? 1 : 0, k & 2 ? 1 : 0);
            }
            leaves.indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
        }
    }
    return { bark, leaves };
};

/**
 * Builds a mesh from geometry grown by growTree.
 *
 * @param {import('playcanvas').GraphicsDevice} device - The graphics device.
 * @param {{ positions: number[], normals: number[], uvs: number[], indices: number[] }} geometry -
 * The geometry.
 * @returns {Mesh} The mesh.
 */
const buildMesh = (device, geometry) => {
    const mesh = new Mesh(device);
    mesh.setPositions(new Float32Array(geometry.positions));
    mesh.setNormals(new Float32Array(geometry.normals));
    mesh.setVertexStream(SEMANTIC_TEXCOORD0, new Float32Array(geometry.uvs), 2);
    mesh.setIndices(new Uint32Array(geometry.indices));
    mesh.update();
    return mesh;
};

/**
 * The woods around the meadow: a few hundred broadleaf trees in groves along its edge, where the
 * hills begin to rise, and a handful standing alone out in the grass. They are grown here from a
 * few random seeds - a trunk forking into limbs and twigs, with clumps of leaf cards - and each
 * kind is drawn in one instanced draw call.
 */
export class MeadowTrees extends Script {
    static scriptName = 'meadowTrees';

    /**
     * How many trees to plant around the edge of the meadow.
     *
     * @attribute
     * @type {number}
     */
    count = 220;

    /**
     * Where lone trees stand out in the grass, as x and z pairs.
     *
     * @attribute
     * @type {number[]}
     */
    lone = [-96, -42, 118, 62, -58, 142, 34, -150];

    initialize() {
        const meadow = getMeadow(this.app);
        const device = this.app.graphicsDevice;

        const leafCanvas = paintLeaves(256);
        const leafTexture = new Texture(device, {
            name: 'meadow-leaves',
            width: leafCanvas.width,
            height: leafCanvas.height,
            format: PIXELFORMAT_SRGBA8,
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        leafTexture.setSource(leafCanvas);

        const bark = new StandardMaterial();
        bark.name = 'meadow-bark';
        bark.diffuse = new Color(0.1, 0.085, 0.07);
        bark.useMetalness = true;
        bark.metalness = 0;
        bark.gloss = 0.2;
        setChunks(bark, barkChunks);
        bark.setParameter('treeFlutter', 0);
        bark.update();

        const leaves = new StandardMaterial();
        leaves.name = 'meadow-leaves';
        leaves.diffuseMap = leafTexture;
        leaves.opacityMap = leafTexture;
        leaves.opacityMapChannel = 'a';
        leaves.alphaTest = 0.4;
        leaves.cull = CULLFACE_NONE;
        leaves.useMetalness = true;
        leaves.metalness = 0;
        leaves.gloss = 0.35;
        setChunks(leaves, leafChunks);
        leaves.setParameter('treeFlutter', 1);
        leaves.update();

        // Where the trees stand: groves scattered around the edge of the meadow, where the hills
        // begin to rise, each a loose knot of trees, and a few lone trees out in the grass
        const rng = random(31337);
        const spots = [];
        const clear = (x, z, gap) => spots.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > gap * gap);
        for (let i = 0; i < this.lone.length; i += 2) {
            spots.push({ x: this.lone[i], z: this.lone[i + 1], scale: 1.45 + rng() * 0.25 });
        }
        const planted = () => spots.length - this.lone.length / 2;
        for (let groves = 0; planted() < this.count && groves < 400; groves++) {
            const angle = rng() * Math.PI * 2;
            const r = 165 + Math.sqrt(rng()) * 290;
            const gx = Math.cos(angle) * r;
            const gz = (Math.sin(angle) * r) / 1.25;
            const size = 3 + Math.floor(rng() * 12);
            const reach = 10 + size * 2.5;
            for (let t = 0, tries = 0; t < size && tries < 60 && planted() < this.count; tries++) {
                const a = rng() * Math.PI * 2;
                const d = Math.sqrt(rng()) * reach;
                const x = gx + Math.cos(a) * d;
                const z = gz + Math.sin(a) * d;
                if (clear(x, z, 7.5)) {
                    spots.push({ x, z, scale: 1.05 + rng() * 0.55 });
                    t++;
                }
            }
        }

        const kinds = [growTree(random(7)), growTree(random(8)), growTree(random(12))];
        const matrices = kinds.map(() => []);
        const matrix = new Mat4();
        const rotation = new Quat();
        const position = new Vec3();
        const scale = new Vec3();
        spots.forEach((spot, i) => {
            position.set(spot.x, meadow.heightAt(spot.x, spot.z), spot.z);
            rotation.setFromEulerAngles(0, rng() * 360, 0);
            scale.set(spot.scale, spot.scale * (0.9 + rng() * 0.2), spot.scale);
            matrix.setTRS(position, rotation, scale);
            matrices[i % kinds.length].push(...matrix.data);
        });

        const meshInstances = [];
        const buffers = [];
        kinds.forEach((kind, k) => {
            const data = new Float32Array(matrices[k]);
            const buffer = new VertexBuffer(device, VertexFormat.getDefaultInstancingFormat(device), data.length / 16, {
                data
            });
            buffers.push(buffer);
            for (const [geometry, material] of [
                [kind.bark, bark],
                [kind.leaves, leaves]
            ]) {
                const meshInstance = new MeshInstance(buildMesh(device, geometry), material);
                meshInstance.setInstancing(buffer);
                meshInstances.push(meshInstance);
            }
        });

        this.entity.addComponent('render', {
            meshInstances,
            castShadows: true,
            receiveShadows: true
        });

        this.on('destroy', () => {
            for (const meshInstance of meshInstances) {
                meshInstance.setInstancing(null);
                meshInstance.mesh.destroy();
            }
            for (const buffer of buffers) {
                buffer.destroy();
            }
            bark.destroy();
            leaves.destroy();
            leafTexture.destroy();
        });
    }
}

/**
 * The land: rolling hills in a ring of mountains, built from the meadow's heightfield, with
 * ground colored to match the grass that grows on it.
 */
export class MeadowTerrain extends Script {
    static scriptName = 'meadowTerrain';

    /** The terrain is built in this many chunks along each side, so each can be culled. */
    static CHUNKS = 8;

    initialize() {
        const meadow = getMeadow(this.app);
        const device = this.app.graphicsDevice;
        const n = HEIGHT_SAMPLES;
        const { heights, origin, spacing } = meadow;

        const material = new StandardMaterial();
        material.name = 'meadow-ground';
        material.useMetalness = true;
        material.metalness = 0;
        material.gloss = 0.15;
        setChunks(material, terrainChunks);
        for (const [name, value] of Object.entries(meadow.parameters)) {
            material.setParameter(name, value);
        }
        material.update();

        // The normal at a sample, from the slope across its neighbors
        const normalAt = (i, j, out, o) => {
            const nx = heights[j * n + Math.max(i - 1, 0)] - heights[j * n + Math.min(i + 1, n - 1)];
            const nz = heights[Math.max(j - 1, 0) * n + i] - heights[Math.min(j + 1, n - 1) * n + i];
            const ny = 2 * spacing;
            const len = Math.hypot(nx, ny, nz);
            out[o] = nx / len;
            out[o + 1] = ny / len;
            out[o + 2] = nz / len;
        };

        const chunks = MeadowTerrain.CHUNKS;
        const cells = (n - 1) / chunks;
        const side = cells + 1;
        const meshInstances = [];
        for (let cj = 0; cj < chunks; cj++) {
            for (let ci = 0; ci < chunks; ci++) {
                const positions = new Float32Array(side * side * 3);
                const normals = new Float32Array(side * side * 3);
                for (let j = 0; j < side; j++) {
                    for (let i = 0; i < side; i++) {
                        const gi = ci * cells + i;
                        const gj = cj * cells + j;
                        const v = (j * side + i) * 3;
                        positions[v] = origin + gi * spacing;
                        positions[v + 1] = heights[gj * n + gi];
                        positions[v + 2] = origin + gj * spacing;
                        normalAt(gi, gj, normals, v);
                    }
                }

                // Two triangles per cell, split along the same diagonal the shaders interpolate
                // across
                const indices = new Uint16Array(cells * cells * 6);
                let w = 0;
                for (let j = 0; j < cells; j++) {
                    for (let i = 0; i < cells; i++) {
                        const v00 = j * side + i;
                        const v10 = v00 + 1;
                        const v01 = v00 + side;
                        const v11 = v01 + 1;
                        indices[w++] = v00;
                        indices[w++] = v11;
                        indices[w++] = v10;
                        indices[w++] = v00;
                        indices[w++] = v01;
                        indices[w++] = v11;
                    }
                }

                const mesh = new Mesh(device);
                mesh.setPositions(positions);
                mesh.setNormals(normals);
                mesh.setIndices(indices);
                mesh.update();
                meshInstances.push(new MeshInstance(mesh, material));
            }
        }

        this.entity.addComponent('render', {
            meshInstances,
            castShadows: true,
            receiveShadows: true
        });

        this.on('destroy', () => {
            for (const meshInstance of meshInstances) {
                meshInstance.mesh.destroy();
            }
            material.destroy();
        });
    }
}

/**
 * One level of detail of a tile of grass.
 *
 * @typedef {object} GrassLod
 * @property {number} segments - Segments along each blade.
 * @property {number} keep - The share of the tile's blades it draws: those ranked below this.
 * @property {number} from - How near the camera a tile may come and still be drawn this way.
 * @property {number} capacity - The most tiles drawn this way at once.
 */

/**
 * The grass: blades drawn in tiles a few meters across, laid over the meadow wherever the camera
 * can see, nearer tiles in finer detail. Each level of detail is one mesh of blades - fewer and
 * simpler the farther off it is drawn - instanced once per tile in a single draw call, and the
 * blades are planted, shaped, colored and bent by the wind in the vertex shader.
 */
export class MeadowGrass extends Script {
    static scriptName = 'meadowGrass';

    /**
     * The camera the grass is laid out around.
     *
     * @attribute
     * @type {Entity}
     */
    camera = null;

    /**
     * Blades per square meter, close up.
     *
     * @attribute
     * @type {number}
     */
    density = 480;

    /**
     * The height of the tallest blades, in meters.
     *
     * @attribute
     * @type {number}
     */
    height = 0.85;

    /**
     * The width of a blade at its root, in meters.
     *
     * @attribute
     * @type {number}
     */
    width = 0.01;

    /**
     * Within this distance every blade is drawn; beyond it the grass thins out, each blade
     * standing for more of its neighbors.
     *
     * @attribute
     * @type {number}
     */
    fullDensity = 5.5;

    /**
     * How far off the grass is drawn at all. The ground carries its color on beyond.
     *
     * @attribute
     * @type {number}
     */
    distance = 240;

    /**
     * How much of the sun comes through a blade lit from behind.
     *
     * @attribute
     * @type {number}
     */
    translucency = 1;

    /** Meters along each side of a tile. */
    static TILE = 4;

    /**
     * How far up the blade each row of vertices is, for blades of 1, 2, 3 and 5 segments:
     * closer together toward the tip, where the blade bends most, and where a stem carries its
     * head. The grass shader picks the rows a stem's head is drawn on out of these, level by
     * level, so the two must change together.
     */
    static ROWS = {
        1: [0, 1],
        2: [0, 0.6, 1],
        3: [0, 0.45, 0.78, 1],
        5: [0, 0.3, 0.55, 0.75, 0.88, 1]
    };

    /** The meadow's grass reaches this far from the origin in x and z. */
    static EXTENT = 480;

    /** @type {GrassLod[]} */
    _lods = [];

    /** @type {MeshInstance[]} */
    _meshInstances = [];

    /** @type {VertexBuffer[]} */
    _buffers = [];

    /** @type {Float32Array[]} */
    _instances = [];

    _frustum = new Frustum();

    _view = new Mat4();

    _viewProjection = new Mat4();

    _box = new BoundingBox();

    _eye = new Float32Array(3);

    initialize() {
        const meadow = getMeadow(this.app);
        const device = this.app.graphicsDevice;
        const tile = MeadowGrass.TILE;

        // A phone has a fraction of a desktop GPU's vertex throughput: grow it a thinner meadow
        if (platform.mobile) {
            this.density *= 0.5;
            this.distance *= 0.75;
        }

        // The levels of detail: each a subset of the one before, so a tile changing level keeps
        // every blade still visible at that distance, drawn with fewer segments
        const keepAt = (share) => this.fullDensity / Math.sqrt(share);
        this._lods = [
            { segments: 5, keep: 1, from: 0, capacity: 96 },
            { segments: 3, keep: 0.3, from: keepAt(0.3), capacity: 256 },
            { segments: 2, keep: 0.08, from: keepAt(0.08), capacity: 768 },
            { segments: 1, keep: 0.02, from: keepAt(0.02), capacity: 1536 },
            { segments: 1, keep: 0.004, from: keepAt(0.004), capacity: 4096 }
        ];

        const blades = this._plantTile(Math.round(this.density * tile * tile), tile);

        const material = new StandardMaterial();
        material.name = 'meadow-grass';
        material.useMetalness = true;
        material.metalness = 0;
        material.gloss = 0.5;
        material.cull = CULLFACE_NONE;
        setChunks(material, grassChunks);
        material.setAttribute('grassBlade', SEMANTIC_ATTR8);
        material.setAttribute('grassTile', SEMANTIC_ATTR12);
        for (const [name, value] of Object.entries(meadow.parameters)) {
            material.setParameter(name, value);
        }
        material.setParameter('grassShape', [this.height, this.width, this.fullDensity, tile]);
        material.setParameter('grassFade', [this.distance * 0.55, this.distance, 0, 0]);
        material.setParameter('grassTranslucency', this.translucency);
        material.update();
        this._material = material;

        const format = new VertexFormat(device, [{ semantic: SEMANTIC_ATTR12, components: 4, type: TYPE_FLOAT32 }]);
        for (const lod of this._lods) {
            const mesh = this._buildMesh(blades, lod);
            const buffer = new VertexBuffer(device, format, lod.capacity, { usage: BUFFER_DYNAMIC });
            const meshInstance = new MeshInstance(mesh, material);
            meshInstance.setInstancing(buffer);
            meshInstance.instancingCount = 0;
            this._meshInstances.push(meshInstance);
            this._buffers.push(buffer);
            this._instances.push(new Float32Array(lod.capacity * 4));
        }

        this.entity.addComponent('render', {
            meshInstances: this._meshInstances,
            castShadows: false,
            receiveShadows: true
        });

        // The tiles, and the lowest and highest ground in each, for culling
        const perSide = Math.ceil((MeadowGrass.EXTENT * 2) / tile);
        this._perSide = perSide;
        this._groundMin = new Float32Array(perSide * perSide);
        this._groundMax = new Float32Array(perSide * perSide);
        this._variants = new Uint8Array(perSide * perSide);
        const rng = random(77);
        for (let j = 0; j < perSide; j++) {
            for (let i = 0; i < perSide; i++) {
                const x0 = -MeadowGrass.EXTENT + i * tile;
                const z0 = -MeadowGrass.EXTENT + j * tile;
                let lo = Infinity;
                let hi = -Infinity;
                for (let s = 0; s <= 2; s++) {
                    for (let u = 0; u <= 2; u++) {
                        const h = meadow.heightAt(x0 + (u * tile) / 2, z0 + (s * tile) / 2);
                        lo = Math.min(lo, h);
                        hi = Math.max(hi, h);
                    }
                }
                const k = j * perSide + i;
                this._groundMin[k] = lo - 0.1;
                this._groundMax[k] = hi + 0.1;
                this._variants[k] = Math.floor(rng() * 8);
            }
        }

        // The tiles around the camera's, nearest first, so each level's tiles draw front to back
        const reach = Math.ceil(this.distance / tile) + 1;
        const ring = [];
        for (let dz = -reach; dz <= reach; dz++) {
            for (let dx = -reach; dx <= reach; dx++) {
                if (dx * dx + dz * dz <= reach * reach) {
                    ring.push([dx, dz, dx * dx + dz * dz]);
                }
            }
        }
        ring.sort((a, b) => a[2] - b[2]);
        this._ring = ring;

        this.on('destroy', () => {
            for (const meshInstance of this._meshInstances) {
                meshInstance.setInstancing(null);
                meshInstance.mesh.destroy();
            }
            for (const buffer of this._buffers) {
                buffer.destroy();
            }
            material.destroy();
        });
    }

    /**
     * Plants a tile's blades: in clumps, as grass grows, each clump a loose tuft of blades
     * around its heart, the clumps close enough that their edges mingle.
     *
     * @param {number} count - How many blades.
     * @param {number} tile - The tile's size, in meters.
     * @returns {Float32Array} Six floats per blade: its root's x and z, its rank, its clump's seed,
     * and the way from the root to its clump's heart in x and z.
     * @private
     */
    _plantTile(count, tile) {
        const rng = random(2024);
        const spacing = 0.3;
        const across = Math.round(tile / spacing);
        const clumps = [];
        for (let j = 0; j < across; j++) {
            for (let i = 0; i < across; i++) {
                clumps.push([(i + rng()) * spacing, (j + rng()) * spacing, rng()]);
            }
        }
        const blades = new Float32Array(count * 6);
        for (let b = 0; b < count; b++) {
            const [cx, cz, seed] = clumps[Math.floor(rng() * clumps.length)];
            // A normally distributed offset from the heart of the clump
            const radius = 0.075 * Math.sqrt(-2 * Math.log(1 - rng() * 0.999));
            const angle = rng() * Math.PI * 2;
            const ox = Math.cos(angle) * radius;
            const oz = Math.sin(angle) * radius;
            blades[b * 6] = (((cx + ox) % tile) + tile) % tile;
            blades[b * 6 + 1] = (((cz + oz) % tile) + tile) % tile;
            blades[b * 6 + 2] = rng();
            blades[b * 6 + 3] = seed;
            blades[b * 6 + 4] = -ox;
            blades[b * 6 + 5] = -oz;
        }
        return blades;
    }

    /**
     * Builds the mesh for one level of detail: the tile's blades ranked below its share, each a
     * strip of quads narrowing to a point.
     *
     * @param {Float32Array} blades - The tile's blades, from _plantTile.
     * @param {GrassLod} lod - The level of detail.
     * @returns {Mesh} The mesh.
     * @private
     */
    _buildMesh(blades, lod) {
        const count = blades.length / 6;
        const chosen = [];
        for (let b = 0; b < count; b++) {
            if (blades[b * 6 + 2] < lod.keep) {
                chosen.push(b);
            }
        }
        const s = lod.segments;
        const rows = MeadowGrass.ROWS[s];
        const perBlade = s * 2 + 1;
        const vertexCount = chosen.length * perBlade;
        const positions = new Float32Array(vertexCount * 4);
        const data = new Float32Array(vertexCount * 4);
        const normals = new Int8Array(vertexCount * 4);
        const indices = new Uint32Array(chosen.length * (s * 2 - 1) * 3);
        let v = 0;
        let w = 0;
        for (const b of chosen) {
            const first = v;
            for (let row = 0; row <= s; row++) {
                const t = rows[row];
                const edges = row === s ? [0] : [-1, 1];
                for (const edge of edges) {
                    positions[v * 4] = blades[b * 6];
                    positions[v * 4 + 1] = t;
                    positions[v * 4 + 2] = blades[b * 6 + 1];
                    positions[v * 4 + 3] = edge;
                    data[v * 4] = blades[b * 6 + 2];
                    data[v * 4 + 1] = blades[b * 6 + 3];
                    data[v * 4 + 2] = blades[b * 6 + 4];
                    data[v * 4 + 3] = blades[b * 6 + 5];
                    normals[v * 4 + 1] = 127;
                    v++;
                }
            }
            for (let row = 0; row < s - 1; row++) {
                const l0 = first + row * 2;
                const r0 = l0 + 1;
                const l1 = l0 + 2;
                const r1 = l0 + 3;
                indices[w++] = l0;
                indices[w++] = r0;
                indices[w++] = l1;
                indices[w++] = r0;
                indices[w++] = r1;
                indices[w++] = l1;
            }
            const l = first + (s - 1) * 2;
            indices[w++] = l;
            indices[w++] = l + 1;
            indices[w++] = l + 2;
        }

        const mesh = new Mesh(this.app.graphicsDevice);
        mesh.setVertexStream(SEMANTIC_POSITION, positions, 4);
        mesh.setVertexStream(SEMANTIC_NORMAL, normals, 4, vertexCount, TYPE_INT8, true);
        mesh.setVertexStream(SEMANTIC_ATTR8, data, 4);
        mesh.setIndices(indices);
        mesh.update();
        // The blades are laid out in the shader, so the mesh's own bounds mean nothing
        mesh.aabb = new BoundingBox(new Vec3(), new Vec3(1e5, 1e5, 1e5));
        return mesh;
    }

    postUpdate() {
        const cameraEntity = this.camera;
        if (!cameraEntity?.camera) {
            return;
        }
        const eye = cameraEntity.getPosition();
        this._eye[0] = eye.x;
        this._eye[1] = eye.y;
        this._eye[2] = eye.z;
        this.app.graphicsDevice.scope.resolve('meadowEye').setValue(this._eye);

        // Cull against where the camera is now: its own view matrix is only brought up to date
        // just before it renders
        this._view.copy(cameraEntity.getWorldTransform()).invert();
        this._viewProjection.mul2(cameraEntity.camera.projectionMatrix, this._view);
        this._frustum.setFromMat4(this._viewProjection);

        const tile = MeadowGrass.TILE;
        const perSide = this._perSide;
        const extent = MeadowGrass.EXTENT;
        const ci = Math.floor((eye.x + extent) / tile);
        const cj = Math.floor((eye.z + extent) / tile);
        const lods = this._lods;
        const counts = [0, 0, 0, 0, 0];
        const box = this._box;
        const reach = this.height + 0.6;
        for (const [dx, dz] of this._ring) {
            const i = ci + dx;
            const j = cj + dz;
            if (i < 0 || j < 0 || i >= perSide || j >= perSide) {
                continue;
            }
            const k = j * perSide + i;
            const x0 = -extent + i * tile;
            const z0 = -extent + j * tile;
            const y0 = this._groundMin[k];
            const y1 = this._groundMax[k] + reach;
            const ox = Math.max(x0 - eye.x, 0, eye.x - x0 - tile);
            const oy = Math.max(y0 - eye.y, 0, eye.y - y1);
            const oz = Math.max(z0 - eye.z, 0, eye.z - z0 - tile);
            const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
            if (d > this.distance) {
                continue;
            }
            box.center.set(x0 + tile / 2, (y0 + y1) / 2, z0 + tile / 2);
            box.halfExtents.set(tile / 2 + 0.6, (y1 - y0) / 2, tile / 2 + 0.6);
            if (!this._frustum.containsAabb(box)) {
                continue;
            }
            let level = lods.length - 1;
            while (level > 0 && d < lods[level].from) {
                level--;
            }
            if (counts[level] >= lods[level].capacity) {
                continue;
            }
            const out = this._instances[level];
            const o = counts[level]++ * 4;
            out[o] = x0;
            out[o + 1] = z0;
            out[o + 2] = this._variants[k];
            out[o + 3] = level;
        }
        for (let level = 0; level < lods.length; level++) {
            const meshInstance = this._meshInstances[level];
            meshInstance.instancingCount = counts[level];
            meshInstance.visible = counts[level] > 0;
            if (counts[level] > 0) {
                this._buffers[level].setData(this._instances[level]);
            }
        }
    }
}
