/**
 * The golden meadow's shaders, for golden-meadow.mjs: the grass, the ground, the trees, the clouds
 * and the pollen, each in GLSL for WebGL 2 and in WGSL for WebGPU.
 *
 * Most of them are overrides of the engine's own shader chunks, which keep everything the engine's
 * standard material does - image based lighting from the sky, the sun's shadows, the camera's tone
 * mapping - and change only what the meadow needs: where a vertex is, what color a surface is, how
 * light passes through a blade of grass, and how the air hazes the view. The clouds and the
 * pollen, which need nothing of the standard material, are whole shaders of their own.
 */

// The meadow's patchwork, shared by the grass and the ground below it: how dry the grass is, how
// tall and how dense it grows, and how many flowers grow among it. Broad patches of dry and lush
// grass come from the noise at a large scale, and the path flattens and thins it.
const fieldGLSL = /* glsl */ `
    uniform sampler2D meadowNoiseMap;
    uniform sampler2D meadowPathMap;
    uniform vec4 meadowPathParams;

    float meadowPathDistance(vec2 xz) {
        return textureLod(meadowPathMap, (xz - meadowPathParams.xy) * meadowPathParams.z, 0.0).r * meadowPathParams.w;
    }

    vec4 meadowField(vec2 xz) {
        vec4 broad = textureLod(meadowNoiseMap, xz * (1.0 / 173.0), 0.0);
        vec4 mid = textureLod(meadowNoiseMap, xz * (1.0 / 41.0) + vec2(0.31, 0.67), 0.0);
        vec4 fine = textureLod(meadowNoiseMap, xz * (1.0 / 9.7) + vec2(0.53, 0.19), 0.0);
        float dry = smoothstep(0.36, 0.7, broad.r * 0.7 + mid.g * 0.3);
        float tall = smoothstep(0.2, 0.8, broad.g * 0.45 + mid.r * 0.4 + fine.b * 0.15);
        float path = meadowPathDistance(xz);
        float onPath = 1.0 - smoothstep(0.45, 1.3, path);
        float verge = 1.0 - smoothstep(1.3, 3.5, path);
        float height = mix(0.45, 1.0, tall) * mix(1.0, 0.12, onPath) * mix(1.0, 0.75, verge);
        float density = mix(1.0, 0.5, onPath);
        float flowers = smoothstep(0.58, 0.8, mid.a * 0.7 + fine.a * 0.3) * (1.0 - verge);
        return vec4(dry, height, density, flowers);
    }
`;

const fieldWGSL = /* wgsl */ `
    var meadowNoiseMap: texture_2d<f32>;
    var meadowNoiseMapSampler: sampler;
    var meadowPathMap: texture_2d<f32>;
    var meadowPathMapSampler: sampler;
    uniform meadowPathParams: vec4f;

    fn meadowPathDistance(xz: vec2f) -> f32 {
        return textureSampleLevel(meadowPathMap, meadowPathMapSampler, (xz - uniform.meadowPathParams.xy) * uniform.meadowPathParams.z, 0.0).r * uniform.meadowPathParams.w;
    }

    fn meadowField(xz: vec2f) -> vec4f {
        let broad: vec4f = textureSampleLevel(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 173.0), 0.0);
        let mid: vec4f = textureSampleLevel(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 41.0) + vec2f(0.31, 0.67), 0.0);
        let fine: vec4f = textureSampleLevel(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 9.7) + vec2f(0.53, 0.19), 0.0);
        let dry: f32 = smoothstep(0.36, 0.7, broad.r * 0.7 + mid.g * 0.3);
        let tall: f32 = smoothstep(0.2, 0.8, broad.g * 0.45 + mid.r * 0.4 + fine.b * 0.15);
        let path: f32 = meadowPathDistance(xz);
        let onPath: f32 = 1.0 - smoothstep(0.45, 1.3, path);
        let verge: f32 = 1.0 - smoothstep(1.3, 3.5, path);
        let height: f32 = mix(0.45, 1.0, tall) * mix(1.0, 0.12, onPath) * mix(1.0, 0.75, verge);
        let density: f32 = mix(1.0, 0.5, onPath);
        let flowers: f32 = smoothstep(0.58, 0.8, mid.a * 0.7 + fine.a * 0.3) * (1.0 - verge);
        return vec4f(dry, height, density, flowers);
    }
`;

// The air: haze that thickens toward the valley floor and thins with height, so the far hills
// fade into it from their feet up, and that glows gold where you look toward the sun, as sunlit
// haze does. It replaces the engine's fog for the ground, the grass and the trees, taking its color
// and density from the scene's fog settings: the density is the haze's at sea level. The material
// including it declares meadowEye, the camera's position.
const aerialGLSL = /* glsl */ `
    float dBlendModeFogFactor = 1.0;
    uniform vec3 fog_color;
    uniform float fog_density;
    uniform vec3 meadowSunDirection;
    uniform vec3 meadowSunHaze;
    uniform float meadowHazeFalloff;

    vec3 meadowAerial(vec3 color, vec3 position) {
        vec3 ray = position - meadowEye;
        float dist = length(ray);
        vec3 dir = ray / max(dist, 1e-4);
        float k = meadowHazeFalloff * dir.y * dist;
        float along = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0;
        float amount = fog_density * exp(-meadowHazeFalloff * meadowEye.y) * dist * along;
        float haze = 1.0 - exp(-amount);
        float sun = pow(max(dot(dir, meadowSunDirection), 0.0), 6.0);
        return mix(color, (fog_color + meadowSunHaze * sun) * dBlendModeFogFactor, haze);
    }

    #ifdef VERTEXSHADER
        vec3 addFog(vec3 color, float depth) {
            return color;
        }
    #else
        vec3 addFog(vec3 color) {
            return meadowAerial(color, vPositionW);
        }
    #endif
`;

const aerialWGSL = /* wgsl */ `
    var<private> dBlendModeFogFactor: f32 = 1.0;
    uniform fog_color: vec3f;
    uniform fog_density: f32;
    uniform meadowSunDirection: vec3f;
    uniform meadowSunHaze: vec3f;
    uniform meadowHazeFalloff: f32;

    fn meadowAerial(color: vec3f, position: vec3f) -> vec3f {
        let ray: vec3f = position - uniform.meadowEye;
        let dist: f32 = length(ray);
        let dir: vec3f = ray / max(dist, 1e-4);
        let k: f32 = uniform.meadowHazeFalloff * dir.y * dist;
        let along: f32 = select(1.0, (1.0 - exp(-k)) / k, abs(k) > 1e-4);
        let amount: f32 = uniform.fog_density * exp(-uniform.meadowHazeFalloff * uniform.meadowEye.y) * dist * along;
        let haze: f32 = 1.0 - exp(-amount);
        let sun: f32 = pow(max(dot(dir, uniform.meadowSunDirection), 0.0), 6.0);
        return mix(color, (uniform.fog_color + uniform.meadowSunHaze * sun) * dBlendModeFogFactor, haze);
    }

    #ifdef VERTEXSHADER
        fn addFog(color: vec3f, depth: f32) -> vec3f {
            return color;
        }
    #else
        fn addFog(color: vec3f) -> vec3f {
            return meadowAerial(color, vPositionW);
        }
    #endif
`;

// The grass's vertex shader, which replaces the engine's transform: every vertex works out which
// blade it belongs to and where on the blade it is, plants the blade on the ground, and bends it.
//
// A blade's vertex carries only where its blade grows within a tile, how far up the blade it is,
// which edge it is on, and a few random numbers. The tile is placed by the instance, so the same
// few meshes cover the whole meadow; every tile is turned or mirrored by the instance too, so the
// pattern of roots never visibly repeats.
const grassTransformGLSL = /* glsl */ `
    attribute vec4 vertex_position;     // x, z: the root in the tile; y: how far up; w: which edge
    attribute vec4 grassBlade;          // x: rank; y: clump seed; z, w: from the root to its clump
    #ifdef INSTANCING
        attribute vec4 grassTile;       // x, y: the tile's corner in x and z; z: its turn and mirror; w: its level of detail
    #endif

    uniform mat4 matrix_viewProjection;
    uniform mat4 matrix_model;

    uniform highp sampler2D meadowHeightMap;
    uniform vec4 meadowHeightParams;
    uniform vec4 meadowWind;            // x, y: the wind's heading; z: its strength; w: time
    uniform vec4 meadowDrift;           // x, y: how far the gusts have rolled; z, w: the air
    uniform vec3 meadowEye;

    uniform vec4 grassShape;            // x: tallest blade; y: widest; z: density radius; w: tile size
    uniform vec4 grassFade;             // x, y: where the grass fades out

    uniform vec3 meadowLushBase;
    uniform vec3 meadowLushTip;
    uniform vec3 meadowDryBase;
    uniform vec3 meadowDryTip;

    #include "meadowFieldVS"

    // The ground's height at a point, interpolated across the same two triangles per cell the
    // terrain is built from, so every root sits exactly on the ground drawn
    float meadowGround(vec2 xz, out vec3 normal) {
        vec2 g = clamp((xz - meadowHeightParams.xy) * meadowHeightParams.z, vec2(0.0), vec2(meadowHeightParams.w - 0.001));
        vec2 cell = floor(g);
        vec2 f = g - cell;
        ivec2 i = ivec2(cell);
        float spacing = 1.0 / meadowHeightParams.z;
        float h00 = texelFetch(meadowHeightMap, i, 0).r;
        float h11 = texelFetch(meadowHeightMap, i + ivec2(1, 1), 0).r;
        if (f.x > f.y) {
            float h10 = texelFetch(meadowHeightMap, i + ivec2(1, 0), 0).r;
            normal = normalize(vec3(h00 - h10, spacing, h10 - h11));
            return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
        }
        float h01 = texelFetch(meadowHeightMap, i + ivec2(0, 1), 0).r;
        normal = normalize(vec3(h01 - h11, spacing, h00 - h01));
        return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    }

    vec4 grassHash(vec2 p) {
        vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        p4 += dot(p4, p4.wzxy + 33.33);
        return fract((p4.xxyz + p4.yzzw) * p4.zywx);
    }

    mat4 getModelMatrix() {
        return matrix_model;
    }

    vec3 getLocalPosition(vec3 vertexPosition) {
        return vertexPosition;
    }

    vec3 grassPosition() {
        float t = vertex_position.y;
        float edge = vertex_position.w;
        float rank = grassBlade.x;
        vec2 toClump = grassBlade.zw;

        // Place the tile, turned a quarter turn at a time and mirrored as its instance says
        #ifdef INSTANCING
            vec4 tile = grassTile;
        #else
            vec4 tile = vec4(0.0);
        #endif
        float halfTile = grassShape.w * 0.5;
        vec2 local = vertex_position.xz - halfTile;
        float variant = tile.z;
        if (variant >= 4.0) {
            local.x = -local.x;
            toClump.x = -toClump.x;
            variant -= 4.0;
        }
        vec2 turn = vec2(1.0, 0.0);
        if (variant >= 3.0) turn = vec2(0.0, -1.0);
        else if (variant >= 2.0) turn = vec2(-1.0, 0.0);
        else if (variant >= 1.0) turn = vec2(0.0, 1.0);
        local = vec2(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
        toClump = vec2(toClump.x * turn.x - toClump.y * turn.y, toClump.x * turn.y + toClump.y * turn.x);
        vec2 rootXZ = tile.xy + halfTile + local;

        vec3 groundNormal;
        vec3 root = vec3(rootXZ.x, meadowGround(rootXZ, groundNormal), rootXZ.y);
        vec4 field = meadowField(rootXZ);
        vec4 r = grassHash(rootXZ * 7.31);
        vec4 q = grassHash(rootXZ * 3.17 + 11.3);
        vec4 clump = grassHash(tile.xy * 0.173 + grassBlade.y * 97.13);

        // A few blades are flowering stems, taller and finer, with a head of seed at the top;
        // a few more are last year's, dead and the color of straw. In the meadow's flowery
        // patches some stems bloom instead: those ranked lowest, which are the last to thin out
        // with distance, so a flower is there to see from far off rather than growing up out of
        // the grass as you come near it.
        float flower = 1.0 - step(0.08 * smoothstep(0.3, 0.7, field.w + (q.z - 0.5) * 0.3), rank);
        float stem = max(step(0.93, q.x), flower);
        float dead = step(0.9, q.y) * (1.0 - stem);

        // Thin the grass with distance, and fade it out far away. Past a few meters each blade
        // stands for more of its neighbors, and is drawn wider to fill the gaps they leave, so
        // the sward keeps covering the ground; blades on their way out shrink rather than pop.
        float dist = distance(root, meadowEye);
        float near = grassShape.z * grassShape.z / max(dist * dist, 1e-4);
        float keep = min(near, 1.0) * field.z;
        float grow = clamp((keep - rank) / max(keep * 0.35, 1e-3), 0.0, 1.0);
        grow *= 1.0 - smoothstep(grassFade.x, grassFade.y, dist);
        float tall = mix(mix(0.2, 1.0, pow(r.x, 1.3)), mix(1.0, 1.3, r.x), stem);
        float height = grassShape.x * field.y * tall * mix(0.75, 1.15, clump.x) * mix(grow, 1.0, flower);
        if (height < 0.004 || (flower > 0.5 && grow < 1e-3)) {
            grassNormal = groundNormal;
            grassColor = vec4(0.0);
            grassUp = vec4(groundNormal, 1.0);
            return root;
        }
        // The shortest leaves are broad and arch right over, carpeting the ground between
        // the taller blades as the lower leaves of a tussock do
        float low = (1.0 - smoothstep(0.2, 0.35, r.x)) * (1.0 - stem);
        float widen = min(inversesqrt(min(near, 1.0)), 24.0);
        float width = grassShape.y * mix(0.7, 1.3, r.y) * widen * mix(0.5, 1.0, grow) * (1.0 + low);

        // Which way it faces: blades lean out from the heart of their clump, each turned a little
        // its own way, and droop over the way they face
        float outward = length(toClump);
        float yaw = r.z * 6.2831853;
        vec2 facing = vec2(cos(yaw), sin(yaw));
        if (outward > 1e-4) {
            facing = normalize(mix(facing, -toClump / outward, 0.65 * smoothstep(0.0, 0.06, outward)));
        }
        float droop = mix(0.1, 0.55, r.w) * mix(0.7, 1.3, clump.y) * mix(1.0, 0.3, stem) * mix(1.0, 1.5, dead) * (1.0 + low * 1.5);

        // The wind: gusts roll across the meadow as broad waves, and every blade sways and
        // flutters on top of them at its own pace
        vec2 windDir = meadowWind.xy;
        float time = meadowWind.w;
        vec2 gustAt = rootXZ - meadowDrift.xy * 5.5;
        float gust = textureLod(meadowNoiseMap, gustAt * (1.0 / 47.0), 0.0).r * 0.7 + textureLod(meadowNoiseMap, gustAt * (1.0 / 13.0) + vec2(0.5), 0.0).g * 0.3;
        gust = smoothstep(0.3, 0.75, gust);
        float phase = time * mix(1.7, 2.6, r.x) + r.y * 6.2831853 - dot(rootXZ, windDir) * 0.4;
        float sway = sin(phase) * 0.6 + sin(phase * 2.3 + 1.7) * 0.4;
        vec2 across = vec2(-windDir.y, windDir.x);
        vec2 push = windDir * (0.15 + gust * 0.85 + sway * (0.12 + 0.25 * gust)) + across * sin(phase * 1.37 + r.z * 5.0) * 0.12;
        vec2 bend = facing * droop + push * meadowWind.z * mix(0.7, 1.3, r.y);

        // The blade's spine: a curve rising straight from the root and bowing over to its tip,
        // kept to the blade's length however far it bends
        vec3 tipDir = normalize(vec3(bend.x, 1.0, bend.y));
        vec3 p2 = tipDir * height;
        vec3 p1 = vec3(0.0, p2.y, 0.0);
        float chord = length(p2);
        float around = length(p1) + length(p2 - p1);
        float fit = height / ((2.0 * chord + around) / 3.0);
        p1 *= fit;
        p2 *= fit;
        // A stem carries a head: a spindle of seed on its last quarter, or a bloom on its top.
        // Every level of detail gives the head three rows - its base, its widest ring and its tip
        // - which make the same head at every level, so it keeps its shape when its tile changes
        // level. The finer levels have rows to spare for the stalk below it; the coarser draw the
        // head alone, its stalk being too fine to see from so far off.
        float lod = tile.w;
        float baseRow = lod < 0.5 ? 0.75 : (lod < 1.5 ? 0.45 : 0.0);
        float wideRow = lod < 0.5 ? 0.88 : (lod < 1.5 ? 0.78 : (lod < 2.5 ? 0.6 : 0.0));
        float isTip = step(0.95, t);
        float isWide = (1.0 - isTip) * step(wideRow - 0.01, t);
        float isBase = (1.0 - isTip) * (1.0 - isWide) * step(baseRow - 0.01, t);
        float isHead = isTip + isWide + isBase;
        float headBase = mix(0.72, 0.96, flower);
        float headWide = lod > 2.5 ? headBase : 0.86;
        float stalk = t / max(baseRow, 0.01) * headBase;
        float head = mix(isTip + isWide * headWide + isBase * headBase, headBase, flower);
        float along = mix(t, mix(stalk, head, isHead), stem);
        vec3 spine = 2.0 * along * (1.0 - along) * p1 + along * along * p2;
        vec3 tangent = normalize(2.0 * (1.0 - along) * p1 + 2.0 * along * (p2 - p1) + vec3(0.0, 1e-4, 0.0));

        // Its flat side turns into the wind as it bends
        vec2 faceDir = normalize(facing + push * meadowWind.z * 1.5 + vec2(1e-4, 0.0));
        vec3 side = vec3(-faceDir.y, 0.0, faceDir.x);

        // A leaf narrows to its point; a stalk stays thin up to its head, which swells to a
        // spindle of seed
        float stemTaper = isWide > 0.5 ? 0.9 : mix(0.3, 0.25, flower);
        if (isTip > 0.5) stemTaper = 0.0;
        float taper = width * mix(1.0 - t * t * t, stemTaper, stem);
        vec3 position = root + spine + side * (edge * taper * 0.5);

        // A bloom opens on top of its stalk, upright however the stalk leans and turned to face
        // you: a cup a few centimeters across, of a size with its kind, which shrinks away with
        // its stalk when the blade thins out, as the blades do. Blooms of a kind grow together:
        // poppies, daisies, buttercups and cornflowers.
        vec3 bloom = vec3(0.62, 0.035, 0.015);
        float bloomSize = 0.055;
        if (clump.w > 0.35) { bloom = vec3(0.85, 0.83, 0.74); bloomSize = 0.042; }
        if (clump.w > 0.65) { bloom = vec3(0.75, 0.5, 0.02); bloomSize = 0.03; }
        if (clump.w > 0.9) { bloom = vec3(0.08, 0.15, 0.62); bloomSize = 0.04; }
        if (flower > 0.5 && isHead > 0.5) {
            vec3 toEye = meadowEye - (root + spine);
            side = normalize(vec3(-toEye.z, 0.0, toEye.x) + vec3(1e-4, 0.0, 0.0));
            tangent = normalize(mix(tangent, vec3(0.0, 1.0, 0.0), 0.6));
            float size = bloomSize * clamp(dist / 20.0, 1.0, 2.5) * grow;
            float rise = isWide * 0.3 + isTip * 0.8;
            float open = isWide + isBase * 0.2;
            position = root + spine + tangent * (rise * size) + side * (edge * open * size * 0.5);
        }

        // Lit as if rounded across its width, and more and more like the ground it covers with
        // distance, where single blades are too small to shade on their own
        vec3 normal = normalize(cross(side, tangent));
        grassNormal = normalize(normal + side * edge * 0.4);
        grassUp = vec4(groundNormal, smoothstep(6.0, 55.0, dist) * 0.85);

        // Its color: lush or dry with the patch it grows in, varied by clump and blade, paler
        // toward the tip, and darker low in the sward where little light reaches
        float dry = clamp(field.x + (clump.z - 0.5) * 0.4 + (r.w - 0.5) * 0.2, 0.0, 1.0);
        vec3 base = mix(meadowLushBase, meadowDryBase, dry);
        vec3 tip = mix(meadowLushTip, meadowDryTip, dry);
        vec3 color = mix(base, tip, smoothstep(0.0, 1.0, t)) * mix(0.75, 1.2, r.z) * (1.0 + gust * meadowWind.z * 0.3 * t);
        color = mix(color, mix(vec3(0.06, 0.045, 0.022), vec3(0.34, 0.25, 0.12), t) * mix(0.8, 1.2, q.z), dead);
        vec3 seed = mix(vec3(0.4, 0.31, 0.16), vec3(0.17, 0.1, 0.085), step(0.6, q.w));
        // The head's base is still stalk, green as the calyx a bloom sits in
        color = mix(color, seed, stem * (isWide + isTip));
        color = mix(color, bloom, flower * (isWide + isTip));
        float above = (position.y - root.y) / max(grassShape.x * field.y, 0.05);
        grassColor = vec4(color, clamp(above, 0.0, 1.0));
        return position;
    }
`;

const grassTransformWGSL = /* wgsl */ `
    attribute vertex_position: vec4f;
    attribute grassBlade: vec4f;
    #ifdef INSTANCING
        attribute grassTile: vec4f;
    #endif

    uniform matrix_viewProjection: mat4x4f;
    uniform matrix_model: mat4x4f;

    var meadowHeightMap: texture_2d<uff>;
    uniform meadowHeightParams: vec4f;
    uniform meadowWind: vec4f;
    uniform meadowDrift: vec4f;
    uniform meadowEye: vec3f;

    uniform grassShape: vec4f;
    uniform grassFade: vec4f;

    uniform meadowLushBase: vec3f;
    uniform meadowLushTip: vec3f;
    uniform meadowDryBase: vec3f;
    uniform meadowDryTip: vec3f;

    #include "meadowFieldVS"

    fn meadowGround(xz: vec2f, normal: ptr<function, vec3f>) -> f32 {
        let g: vec2f = clamp((xz - uniform.meadowHeightParams.xy) * uniform.meadowHeightParams.z, vec2f(0.0), vec2f(uniform.meadowHeightParams.w - 0.001));
        let cell: vec2f = floor(g);
        let f: vec2f = g - cell;
        let i: vec2i = vec2i(cell);
        let spacing: f32 = 1.0 / uniform.meadowHeightParams.z;
        let h00: f32 = textureLoad(meadowHeightMap, i, 0).r;
        let h11: f32 = textureLoad(meadowHeightMap, i + vec2i(1, 1), 0).r;
        if (f.x > f.y) {
            let h10: f32 = textureLoad(meadowHeightMap, i + vec2i(1, 0), 0).r;
            *normal = normalize(vec3f(h00 - h10, spacing, h10 - h11));
            return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
        }
        let h01: f32 = textureLoad(meadowHeightMap, i + vec2i(0, 1), 0).r;
        *normal = normalize(vec3f(h01 - h11, spacing, h00 - h01));
        return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    }

    fn grassHash(p: vec2f) -> vec4f {
        var p4: vec4f = fract(vec4f(p.xyxy) * vec4f(0.1031, 0.1030, 0.0973, 0.1099));
        p4 = p4 + dot(p4, p4.wzxy + 33.33);
        return fract((p4.xxyz + p4.yzzw) * p4.zywx);
    }

    fn getModelMatrix() -> mat4x4f {
        return uniform.matrix_model;
    }

    fn getLocalPosition(vertexPosition: vec3f) -> vec3f {
        return vertexPosition;
    }

    fn grassPosition() -> vec3f {
        let t: f32 = vertex_position.y;
        let edge: f32 = vertex_position.w;
        let rank: f32 = grassBlade.x;
        var toClump: vec2f = grassBlade.zw;

        #ifdef INSTANCING
            let tile: vec4f = grassTile;
        #else
            let tile: vec4f = vec4f(0.0);
        #endif
        let halfTile: f32 = uniform.grassShape.w * 0.5;
        var local: vec2f = vertex_position.xz - halfTile;
        var variant: f32 = tile.z;
        if (variant >= 4.0) {
            local.x = -local.x;
            toClump.x = -toClump.x;
            variant = variant - 4.0;
        }
        var turn: vec2f = vec2f(1.0, 0.0);
        if (variant >= 3.0) {
            turn = vec2f(0.0, -1.0);
        } else if (variant >= 2.0) {
            turn = vec2f(-1.0, 0.0);
        } else if (variant >= 1.0) {
            turn = vec2f(0.0, 1.0);
        }
        local = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
        toClump = vec2f(toClump.x * turn.x - toClump.y * turn.y, toClump.x * turn.y + toClump.y * turn.x);
        let rootXZ: vec2f = tile.xy + halfTile + local;

        var groundNormal: vec3f;
        let root: vec3f = vec3f(rootXZ.x, meadowGround(rootXZ, &groundNormal), rootXZ.y);
        let field: vec4f = meadowField(rootXZ);
        let r: vec4f = grassHash(rootXZ * 7.31);
        let q: vec4f = grassHash(rootXZ * 3.17 + 11.3);
        let clump: vec4f = grassHash(tile.xy * 0.173 + grassBlade.y * 97.13);

        let flower: f32 = 1.0 - step(0.08 * smoothstep(0.3, 0.7, field.w + (q.z - 0.5) * 0.3), rank);
        let stem: f32 = max(step(0.93, q.x), flower);
        let dead: f32 = step(0.9, q.y) * (1.0 - stem);

        let dist: f32 = distance(root, uniform.meadowEye);
        let near: f32 = uniform.grassShape.z * uniform.grassShape.z / max(dist * dist, 1e-4);
        let keep: f32 = min(near, 1.0) * field.z;
        var grow: f32 = clamp((keep - rank) / max(keep * 0.35, 1e-3), 0.0, 1.0);
        grow = grow * (1.0 - smoothstep(uniform.grassFade.x, uniform.grassFade.y, dist));
        let tall: f32 = mix(mix(0.2, 1.0, pow(r.x, 1.3)), mix(1.0, 1.3, r.x), stem);
        let height: f32 = uniform.grassShape.x * field.y * tall * mix(0.75, 1.15, clump.x) * mix(grow, 1.0, flower);
        if (height < 0.004 || (flower > 0.5 && grow < 1e-3)) {
            grassNormal = groundNormal;
            grassColor = vec4f(0.0);
            grassUp = vec4f(groundNormal, 1.0);
            return root;
        }
        let low: f32 = (1.0 - smoothstep(0.2, 0.35, r.x)) * (1.0 - stem);
        let widen: f32 = min(inverseSqrt(min(near, 1.0)), 24.0);
        let width: f32 = uniform.grassShape.y * mix(0.7, 1.3, r.y) * widen * mix(0.5, 1.0, grow) * (1.0 + low);

        let outward: f32 = length(toClump);
        let yaw: f32 = r.z * 6.2831853;
        var facing: vec2f = vec2f(cos(yaw), sin(yaw));
        if (outward > 1e-4) {
            facing = normalize(mix(facing, -toClump / outward, 0.65 * smoothstep(0.0, 0.06, outward)));
        }
        let droop: f32 = mix(0.1, 0.55, r.w) * mix(0.7, 1.3, clump.y) * mix(1.0, 0.3, stem) * mix(1.0, 1.5, dead) * (1.0 + low * 1.5);

        let windDir: vec2f = uniform.meadowWind.xy;
        let time: f32 = uniform.meadowWind.w;
        let gustAt: vec2f = rootXZ - uniform.meadowDrift.xy * 5.5;
        var gust: f32 = textureSampleLevel(meadowNoiseMap, meadowNoiseMapSampler, gustAt * (1.0 / 47.0), 0.0).r * 0.7 + textureSampleLevel(meadowNoiseMap, meadowNoiseMapSampler, gustAt * (1.0 / 13.0) + vec2f(0.5), 0.0).g * 0.3;
        gust = smoothstep(0.3, 0.75, gust);
        let phase: f32 = time * mix(1.7, 2.6, r.x) + r.y * 6.2831853 - dot(rootXZ, windDir) * 0.4;
        let sway: f32 = sin(phase) * 0.6 + sin(phase * 2.3 + 1.7) * 0.4;
        let across: vec2f = vec2f(-windDir.y, windDir.x);
        let push: vec2f = windDir * (0.15 + gust * 0.85 + sway * (0.12 + 0.25 * gust)) + across * sin(phase * 1.37 + r.z * 5.0) * 0.12;
        let bend: vec2f = facing * droop + push * uniform.meadowWind.z * mix(0.7, 1.3, r.y);

        let tipDir: vec3f = normalize(vec3f(bend.x, 1.0, bend.y));
        var p2: vec3f = tipDir * height;
        var p1: vec3f = vec3f(0.0, p2.y, 0.0);
        let chord: f32 = length(p2);
        let around: f32 = length(p1) + length(p2 - p1);
        let fit: f32 = height / ((2.0 * chord + around) / 3.0);
        p1 = p1 * fit;
        p2 = p2 * fit;
        let lod: f32 = tile.w;
        let baseRow: f32 = select(select(0.0, 0.45, lod < 1.5), 0.75, lod < 0.5);
        let wideRow: f32 = select(select(select(0.0, 0.6, lod < 2.5), 0.78, lod < 1.5), 0.88, lod < 0.5);
        let isTip: f32 = step(0.95, t);
        let isWide: f32 = (1.0 - isTip) * step(wideRow - 0.01, t);
        let isBase: f32 = (1.0 - isTip) * (1.0 - isWide) * step(baseRow - 0.01, t);
        let isHead: f32 = isTip + isWide + isBase;
        let headBase: f32 = mix(0.72, 0.96, flower);
        let headWide: f32 = select(0.86, headBase, lod > 2.5);
        let stalk: f32 = t / max(baseRow, 0.01) * headBase;
        let head: f32 = mix(isTip + isWide * headWide + isBase * headBase, headBase, flower);
        let along: f32 = mix(t, mix(stalk, head, isHead), stem);
        let spine: vec3f = 2.0 * along * (1.0 - along) * p1 + along * along * p2;
        var tangent: vec3f = normalize(2.0 * (1.0 - along) * p1 + 2.0 * along * (p2 - p1) + vec3f(0.0, 1e-4, 0.0));

        let faceDir: vec2f = normalize(facing + push * uniform.meadowWind.z * 1.5 + vec2f(1e-4, 0.0));
        var side: vec3f = vec3f(-faceDir.y, 0.0, faceDir.x);

        var stemTaper: f32 = select(mix(0.3, 0.25, flower), 0.9, isWide > 0.5);
        if (isTip > 0.5) {
            stemTaper = 0.0;
        }
        let taper: f32 = width * mix(1.0 - t * t * t, stemTaper, stem);
        var position: vec3f = root + spine + side * (edge * taper * 0.5);

        var bloom: vec3f = vec3f(0.62, 0.035, 0.015);
        var bloomSize: f32 = 0.055;
        if (clump.w > 0.35) {
            bloom = vec3f(0.85, 0.83, 0.74);
            bloomSize = 0.042;
        }
        if (clump.w > 0.65) {
            bloom = vec3f(0.75, 0.5, 0.02);
            bloomSize = 0.03;
        }
        if (clump.w > 0.9) {
            bloom = vec3f(0.08, 0.15, 0.62);
            bloomSize = 0.04;
        }
        if (flower > 0.5 && isHead > 0.5) {
            let toEye: vec3f = uniform.meadowEye - (root + spine);
            side = normalize(vec3f(-toEye.z, 0.0, toEye.x) + vec3f(1e-4, 0.0, 0.0));
            tangent = normalize(mix(tangent, vec3f(0.0, 1.0, 0.0), vec3f(0.6)));
            let size: f32 = bloomSize * clamp(dist / 20.0, 1.0, 2.5) * grow;
            let rise: f32 = isWide * 0.3 + isTip * 0.8;
            let open: f32 = isWide + isBase * 0.2;
            position = root + spine + tangent * (rise * size) + side * (edge * open * size * 0.5);
        }

        let normal: vec3f = normalize(cross(side, tangent));
        grassNormal = normalize(normal + side * edge * 0.4);
        grassUp = vec4f(groundNormal, smoothstep(6.0, 55.0, dist) * 0.85);

        let dry: f32 = clamp(field.x + (clump.z - 0.5) * 0.4 + (r.w - 0.5) * 0.2, 0.0, 1.0);
        let base: vec3f = mix(uniform.meadowLushBase, uniform.meadowDryBase, dry);
        let tip: vec3f = mix(uniform.meadowLushTip, uniform.meadowDryTip, dry);
        var color: vec3f = mix(base, tip, smoothstep(0.0, 1.0, t)) * mix(0.75, 1.2, r.z) * (1.0 + gust * uniform.meadowWind.z * 0.3 * t);
        color = mix(color, mix(vec3f(0.06, 0.045, 0.022), vec3f(0.34, 0.25, 0.12), t) * mix(0.8, 1.2, q.z), dead);
        let seed: vec3f = mix(vec3f(0.4, 0.31, 0.16), vec3f(0.17, 0.1, 0.085), step(0.6, q.w));
        // The head's base is still stalk, green as the calyx a bloom sits in
        color = mix(color, seed, stem * (isWide + isTip));
        color = mix(color, bloom, flower * (isWide + isTip));
        let above: f32 = (position.y - root.y) / max(uniform.grassShape.x * field.y, 0.05);
        grassColor = vec4f(color, clamp(above, 0.0, 1.0));
        return position;
    }
`;

export const grassChunks = {
    glsl: {
        meadowFieldVS: fieldGLSL,
        litUserDeclarationVS: /* glsl */ `
            varying vec4 vGrassColor;
            varying vec4 vGrassUp;
            vec3 grassNormal;
            vec4 grassColor;
            vec4 grassUp;
        `,
        transformCoreVS: grassTransformGLSL,
        transformInstancingVS: '',
        transformVS: /* glsl */ `
            vec4 getPosition() {
                dModelMatrix = getModelMatrix();
                dPositionW = grassPosition();
                return matrix_viewProjection * vec4(dPositionW, 1.0);
            }
            vec3 getWorldPosition() {
                return dPositionW;
            }
        `,
        normalVS: /* glsl */ `
            mat3 dNormalMatrix;
            vec3 getNormal() {
                dNormalMatrix = mat3(1.0);
                return grassNormal;
            }
        `,
        litUserMainEndVS: /* glsl */ `
            vGrassColor = grassColor;
            vGrassUp = grassUp;
        `,
        litUserDeclarationPS: /* glsl */ `
            varying vec4 vGrassColor;
            varying vec4 vGrassUp;
            uniform float grassTranslucency;
            uniform vec3 meadowEye;
        `,
        fogPS: aerialGLSL,
        diffusePS: /* glsl */ `
            void getAlbedo() {
                dAlbedo = vGrassColor.rgb;
            }
        `,
        // A blade is thin: it is lit on whichever side you see, and far away like the ground
        normalMapPS: /* glsl */ `
            void getNormal() {
                vec3 normal = gl_FrontFacing ? dVertexNormalW : -dVertexNormalW;
                dNormalW = normalize(mix(normal, vGrassUp.xyz, vGrassUp.w));
            }
        `,
        // Light shining on a blade's back comes through it, most brightly when you look toward
        // the light; and low in the sward, the blades around shade it from the light
        lightDiffuseLambertPS: /* glsl */ `
            float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
                float nDotL = dot(worldNormal, -lightDirNorm);
                float through = max(-nDotL, 0.0) * 0.55 + pow(max(dot(dViewDirW, lightDirNorm), 0.0), 6.0) * 1.2;
                float reach = mix(0.1, 1.0, smoothstep(0.05, 0.95, vGrassColor.a));
                return (max(nDotL, 0.0) + through * grassTranslucency) * reach;
            }
        `
    },
    wgsl: {
        meadowFieldVS: fieldWGSL,
        litUserDeclarationVS: /* wgsl */ `
            varying vGrassColor: vec4f;
            varying vGrassUp: vec4f;
            var<private> grassNormal: vec3f;
            var<private> grassColor: vec4f;
            var<private> grassUp: vec4f;
        `,
        transformCoreVS: grassTransformWGSL,
        transformInstancingVS: '',
        transformVS: /* wgsl */ `
            fn getPosition() -> vec4f {
                dModelMatrix = getModelMatrix();
                dPositionW = grassPosition();
                return uniform.matrix_viewProjection * vec4f(dPositionW, 1.0);
            }
            fn getWorldPosition() -> vec3f {
                return dPositionW;
            }
        `,
        normalVS: /* wgsl */ `
            var<private> dNormalMatrix: mat3x3f;
            fn getNormal() -> vec3f {
                dNormalMatrix = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
                return grassNormal;
            }
        `,
        litUserMainEndVS: /* wgsl */ `
            output.vGrassColor = grassColor;
            output.vGrassUp = grassUp;
        `,
        litUserDeclarationPS: /* wgsl */ `
            varying vGrassColor: vec4f;
            varying vGrassUp: vec4f;
            uniform grassTranslucency: f32;
            uniform meadowEye: vec3f;
        `,
        fogPS: aerialWGSL,
        diffusePS: /* wgsl */ `
            fn getAlbedo() {
                dAlbedo = vGrassColor.rgb;
            }
        `,
        normalMapPS: /* wgsl */ `
            fn getNormal() {
                let normal: vec3f = select(-dVertexNormalW, dVertexNormalW, pcFrontFacing);
                dNormalW = normalize(mix(normal, vGrassUp.xyz, vGrassUp.w));
            }
        `,
        lightDiffuseLambertPS: /* wgsl */ `
            fn getLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f) -> f32 {
                let nDotL: f32 = dot(worldNormal, -lightDirNorm);
                let through: f32 = max(-nDotL, 0.0) * 0.55 + pow(max(dot(dViewDirW, lightDirNorm), 0.0), 6.0) * 1.2;
                let reach: f32 = mix(0.1, 1.0, smoothstep(0.05, 0.95, vGrassColor.a));
                return (max(nDotL, 0.0) + through * uniform.grassTranslucency) * reach;
            }
        `
    }
};

// The ground: under the grass near you, bare soil between the roots, and farther off the color of
// the grass itself, which by then covers it completely. Beyond the meadow, wooded hills.
export const terrainChunks = {
    glsl: {
        litUserDeclarationPS: /* glsl */ `
            uniform sampler2D meadowNoiseMap;
            uniform sampler2D meadowPathMap;
            uniform vec4 meadowPathParams;
            uniform vec3 meadowEye;
            uniform vec3 meadowLushBase;
            uniform vec3 meadowLushTip;
            uniform vec3 meadowDryBase;
            uniform vec3 meadowDryTip;
            uniform vec4 meadowWind;
            uniform vec4 meadowDrift;
        `,
        fogPS: aerialGLSL,
        diffusePS: /* glsl */ `
            void getAlbedo() {
                vec2 xz = vPositionW.xz;
                vec4 broad = texture(meadowNoiseMap, xz * (1.0 / 173.0));
                vec4 mid = texture(meadowNoiseMap, xz * (1.0 / 41.0) + vec2(0.31, 0.67));
                vec4 fine = texture(meadowNoiseMap, xz * (1.0 / 9.7) + vec2(0.53, 0.19));
                float dry = smoothstep(0.36, 0.7, broad.r * 0.7 + mid.g * 0.3);
                float path = texture(meadowPathMap, (xz - meadowPathParams.xy) * meadowPathParams.z).r * meadowPathParams.w;
                float onPath = 1.0 - smoothstep(0.45, 1.3, path);

                // Seen from afar the sward is a mottled carpet, and the gusts roll across it as
                // waves of paler grass, where the wind shows the blades' sides
                vec2 gustAt = xz - meadowDrift.xy * 5.5;
                float gust = texture(meadowNoiseMap, gustAt * (1.0 / 47.0)).r * 0.7 + texture(meadowNoiseMap, gustAt * (1.0 / 13.0) + vec2(0.5)).g * 0.3;
                gust = smoothstep(0.3, 0.75, gust) * meadowWind.z;
                vec3 canopy = mix(mix(meadowLushBase, meadowLushTip, 0.72), mix(meadowDryBase, meadowDryTip, 0.72), dry);
                canopy *= mix(0.8, 1.15, fine.b) * (1.0 + gust * 0.3);
                // Under the grass: last year's thatch, matted and shaded by the blades above
                vec4 thatch = texture(meadowNoiseMap, xz * (1.0 / 1.3)) * 0.6 + texture(meadowNoiseMap, xz * (1.0 / 0.31)) * 0.4;
                vec3 under = mix(meadowLushBase, meadowDryBase, max(dry, 0.35)) * mix(0.3, 1.1, smoothstep(0.25, 0.75, thatch.g)) * mix(0.8, 1.2, fine.r);
                vec3 soil = mix(under, vec3(0.12, 0.095, 0.06), onPath);
                float cover = smoothstep(3.0, 40.0, distance(vPositionW, meadowEye)) * (1.0 - onPath * 0.7);
                vec3 meadow = mix(soil, canopy, cover);

                // Beyond the meadow, woods: dark crowns and paler gaps, and rock where it is steep
                float wild = smoothstep(420.0, 620.0, length(vec2(xz.x, xz.y * 1.25)));
                float steep = smoothstep(0.8, 0.55, normalize(vNormalW).y);
                float crowns = texture(meadowNoiseMap, xz * (1.0 / 23.0)).a * 0.6 + fine.g * 0.4;
                vec3 wooded = mix(vec3(0.012, 0.022, 0.01), vec3(0.05, 0.065, 0.025), smoothstep(0.3, 0.7, crowns));
                wooded = mix(wooded, vec3(0.09, 0.085, 0.075), steep);
                dAlbedo = mix(meadow, wooded, wild);
            }
        `
    },
    wgsl: {
        litUserDeclarationPS: /* wgsl */ `
            var meadowNoiseMap: texture_2d<f32>;
            var meadowNoiseMapSampler: sampler;
            var meadowPathMap: texture_2d<f32>;
            var meadowPathMapSampler: sampler;
            uniform meadowPathParams: vec4f;
            uniform meadowEye: vec3f;
            uniform meadowLushBase: vec3f;
            uniform meadowLushTip: vec3f;
            uniform meadowDryBase: vec3f;
            uniform meadowDryTip: vec3f;
            uniform meadowWind: vec4f;
            uniform meadowDrift: vec4f;
        `,
        fogPS: aerialWGSL,
        diffusePS: /* wgsl */ `
            fn getAlbedo() {
                let xz: vec2f = vPositionW.xz;
                let broad: vec4f = textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 173.0));
                let mid: vec4f = textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 41.0) + vec2f(0.31, 0.67));
                let fine: vec4f = textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 9.7) + vec2f(0.53, 0.19));
                let dry: f32 = smoothstep(0.36, 0.7, broad.r * 0.7 + mid.g * 0.3);
                let path: f32 = textureSample(meadowPathMap, meadowPathMapSampler, (xz - uniform.meadowPathParams.xy) * uniform.meadowPathParams.z).r * uniform.meadowPathParams.w;
                let onPath: f32 = 1.0 - smoothstep(0.45, 1.3, path);

                let gustAt: vec2f = xz - uniform.meadowDrift.xy * 5.5;
                var gust: f32 = textureSample(meadowNoiseMap, meadowNoiseMapSampler, gustAt * (1.0 / 47.0)).r * 0.7 + textureSample(meadowNoiseMap, meadowNoiseMapSampler, gustAt * (1.0 / 13.0) + vec2f(0.5)).g * 0.3;
                gust = smoothstep(0.3, 0.75, gust) * uniform.meadowWind.z;
                var canopy: vec3f = mix(mix(uniform.meadowLushBase, uniform.meadowLushTip, 0.72), mix(uniform.meadowDryBase, uniform.meadowDryTip, 0.72), dry);
                canopy = canopy * mix(0.8, 1.15, fine.b) * (1.0 + gust * 0.3);
                let thatch: vec4f = textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 1.3)) * 0.6 + textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 0.31)) * 0.4;
                let under: vec3f = mix(uniform.meadowLushBase, uniform.meadowDryBase, max(dry, 0.35)) * mix(0.3, 1.1, smoothstep(0.25, 0.75, thatch.g)) * mix(0.8, 1.2, fine.r);
                let soil: vec3f = mix(under, vec3f(0.12, 0.095, 0.06), onPath);
                let cover: f32 = smoothstep(3.0, 40.0, distance(vPositionW, uniform.meadowEye)) * (1.0 - onPath * 0.7);
                let meadow: vec3f = mix(soil, canopy, cover);

                let wild: f32 = smoothstep(420.0, 620.0, length(vec2f(xz.x, xz.y * 1.25)));
                let steep: f32 = smoothstep(0.8, 0.55, normalize(vNormalW).y);
                let crowns: f32 = textureSample(meadowNoiseMap, meadowNoiseMapSampler, xz * (1.0 / 23.0)).a * 0.6 + fine.g * 0.4;
                var wooded: vec3f = mix(vec3f(0.012, 0.022, 0.01), vec3f(0.05, 0.065, 0.025), smoothstep(0.3, 0.7, crowns));
                wooded = mix(wooded, vec3f(0.09, 0.085, 0.075), steep);
                dAlbedo = mix(meadow, wooded, wild);
            }
        `
    }
};

// The clouds: a dome around the camera, onto which a layer of cloud a couple of kilometers up is
// projected. Each pixel looks up how thick the cloud is where its view ray meets the layer, and
// how thick it is a little way toward the sun - thick there means this part is in the cloud's own
// shade. Thin cloud near the sun glows, lit through from behind.
export const cloudVertexGLSL = /* glsl */ `
    attribute vec3 vertex_position;
    uniform mat4 matrix_viewProjection;
    uniform vec3 view_position;
    varying vec3 vDirection;

    void main(void) {
        vDirection = vertex_position;
        gl_Position = matrix_viewProjection * vec4(view_position + vertex_position * 3000.0, 1.0);
    }
`;

export const cloudFragmentGLSL = /* glsl */ `
    #include "gammaPS"
    #include "tonemappingPS"

    uniform sampler2D meadowNoiseMap;
    uniform vec4 meadowDrift;
    uniform vec3 view_position;
    uniform vec3 cloudSunDirection;
    uniform vec3 cloudSunColor;
    uniform vec3 cloudSkyColor;
    uniform vec3 fog_color;
    uniform vec3 meadowSunHaze;
    uniform float cloudCover;
    varying vec3 vDirection;

    float cloudDensity(vec2 p) {
        float n = texture(meadowNoiseMap, p * (1.0 / 5200.0)).r * 0.55;
        n += texture(meadowNoiseMap, p * (1.0 / 1900.0) + vec2(0.37, 0.11)).g * 0.28;
        n += texture(meadowNoiseMap, p * (1.0 / 610.0) + vec2(0.71, 0.53)).b * 0.17;
        return smoothstep(1.0 - cloudCover, 1.25 - cloudCover * 0.6, n);
    }

    void main(void) {
        vec3 dir = normalize(vDirection);
        if (dir.y < 0.005) {
            discard;
        }

        // Where the view ray meets the layer, drifting with the wind aloft
        vec2 p = view_position.xz + dir.xz * (2200.0 / (dir.y + 0.04)) - meadowDrift.xy * 9.0;
        float density = cloudDensity(p);
        if (density < 0.003) {
            discard;
        }
        float shade = cloudDensity(p + cloudSunDirection.xz * 420.0);

        // Lit by the low sun on the side facing it, blue with the sky in its own shade, and
        // glowing where it is thin and between you and the sun
        float toSun = max(dot(dir, cloudSunDirection), 0.0);
        float glow = pow(toSun, 10.0) * 3.5 + pow(toSun, 3.0) * 0.6;
        vec3 lit = cloudSunColor * (mix(1.0, 0.18, shade) + glow * (1.0 - density * 0.7));
        vec3 color = cloudSkyColor * mix(0.9, 0.45, density) + lit;

        // Toward the horizon the clouds thin into the haze
        float horizon = smoothstep(0.005, 0.2, dir.y);
        vec3 haze = fog_color + meadowSunHaze * pow(toSun, 6.0);
        color = mix(haze, color, horizon * 0.85 + 0.15);
        float alpha = density * mix(0.2, 1.0, horizon) * smoothstep(0.005, 0.05, dir.y);
        gl_FragColor = vec4(gammaCorrectOutput(toneMap(color)), alpha);
    }
`;

export const cloudVertexWGSL = /* wgsl */ `
    attribute vertex_position: vec3f;
    uniform matrix_viewProjection: mat4x4f;
    uniform view_position: vec3f;
    varying vDirection: vec3f;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        output.vDirection = vertex_position;
        output.position = uniform.matrix_viewProjection * vec4f(uniform.view_position + vertex_position * 3000.0, 1.0);
        return output;
    }
`;

export const cloudFragmentWGSL = /* wgsl */ `
    #include "gammaPS"
    #include "tonemappingPS"

    var meadowNoiseMap: texture_2d<f32>;
    var meadowNoiseMapSampler: sampler;
    uniform meadowDrift: vec4f;
    uniform view_position: vec3f;
    uniform cloudSunDirection: vec3f;
    uniform cloudSunColor: vec3f;
    uniform cloudSkyColor: vec3f;
    uniform fog_color: vec3f;
    uniform meadowSunHaze: vec3f;
    uniform cloudCover: f32;
    varying vDirection: vec3f;

    fn cloudDensity(p: vec2f) -> f32 {
        var n: f32 = textureSample(meadowNoiseMap, meadowNoiseMapSampler, p * (1.0 / 5200.0)).r * 0.55;
        n = n + textureSample(meadowNoiseMap, meadowNoiseMapSampler, p * (1.0 / 1900.0) + vec2f(0.37, 0.11)).g * 0.28;
        n = n + textureSample(meadowNoiseMap, meadowNoiseMapSampler, p * (1.0 / 610.0) + vec2f(0.71, 0.53)).b * 0.17;
        return smoothstep(1.0 - uniform.cloudCover, 1.25 - uniform.cloudCover * 0.6, n);
    }

    @fragment
    fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let dir: vec3f = normalize(input.vDirection);
        let p: vec2f = uniform.view_position.xz + dir.xz * (2200.0 / (max(dir.y, 0.0) + 0.04)) - uniform.meadowDrift.xy * 9.0;
        let density: f32 = cloudDensity(p);
        let shade: f32 = cloudDensity(p + uniform.cloudSunDirection.xz * 420.0);
        if (dir.y < 0.005 || density < 0.003) {
            discard;
        }

        let toSun: f32 = max(dot(dir, uniform.cloudSunDirection), 0.0);
        let glow: f32 = pow(toSun, 10.0) * 3.5 + pow(toSun, 3.0) * 0.6;
        let lit: vec3f = uniform.cloudSunColor * (mix(1.0, 0.18, shade) + glow * (1.0 - density * 0.7));
        var color: vec3f = uniform.cloudSkyColor * mix(0.9, 0.45, density) + lit;

        let horizon: f32 = smoothstep(0.005, 0.2, dir.y);
        let haze: vec3f = uniform.fog_color + uniform.meadowSunHaze * pow(toSun, 6.0);
        color = mix(haze, color, horizon * 0.85 + 0.15);
        let alpha: f32 = density * mix(0.2, 1.0, horizon) * smoothstep(0.005, 0.05, dir.y);
        output.color = vec4f(gammaCorrectOutput(toneMap(color)), alpha);
        return output;
    }
`;

// Motes of pollen and seed fluff drifting on the air around the camera. Every mote is one small
// quad, placed by the vertex shader: it drifts downwind and bobs, and wraps around within a box
// that travels with the camera, so there are always as many about you however far you go. The
// quads face the camera, and glow brightest where you look toward the sun, as dust in a sunbeam.
export const pollenVertexGLSL = /* glsl */ `
    attribute vec4 vertex_position;     // x, y: which corner; z: the mote's size; w: its phase
    attribute vec4 pollenSeed;          // where the mote starts in its box
    uniform mat4 matrix_viewProjection;
    uniform mat4 matrix_view;
    uniform vec3 view_position;
    uniform vec4 meadowWind;
    uniform vec4 meadowDrift;
    uniform vec3 pollenBox;
    uniform vec3 pollenSunDirection;
    varying vec2 vCorner;
    varying float vFade;

    void main(void) {
        float time = meadowWind.w;
        float phase = vertex_position.w;
        vec3 drift = vec3(meadowDrift.z, 0.0, meadowDrift.w);
        drift += vec3(sin(time * 0.31 + phase * 6.28), sin(time * 0.53 + phase * 11.0) * 0.6, cos(time * 0.27 + phase * 4.1)) * 0.35;
        vec3 p = pollenSeed.xyz * pollenBox + drift;
        vec3 origin = view_position - pollenBox * vec3(0.5, 0.45, 0.5);
        p = origin + mod(p - origin, pollenBox);

        // Face the camera
        vec3 right = vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]);
        vec3 up = vec3(matrix_view[0][1], matrix_view[1][1], matrix_view[2][1]);
        float dist = distance(p, view_position);
        float size = max(vertex_position.z, dist * 0.0012);
        vec3 position = p + (right * vertex_position.x + up * vertex_position.y) * size;

        // Fade in and out at the box's edges, and away right in front of the lens
        vec3 inBox = (p - origin) / pollenBox;
        vec3 edge = min(inBox, 1.0 - inBox);
        float fade = smoothstep(0.0, 0.15, min(min(edge.x, edge.y), edge.z)) * smoothstep(0.25, 0.8, dist);
        float toSun = max(dot(normalize(p - view_position), pollenSunDirection), 0.0);
        vFade = fade * (0.06 + pow(toSun, 6.0) * 1.6);
        vCorner = vertex_position.xy;
        gl_Position = matrix_viewProjection * vec4(position, 1.0);
    }
`;

export const pollenFragmentGLSL = /* glsl */ `
    #include "gammaPS"
    #include "tonemappingPS"

    uniform vec3 pollenSunColor;
    varying vec2 vCorner;
    varying float vFade;

    void main(void) {
        float round = 1.0 - smoothstep(0.35, 1.0, length(vCorner));
        gl_FragColor = vec4(gammaCorrectOutput(toneMap(pollenSunColor * round * vFade)), 1.0);
    }
`;

export const pollenVertexWGSL = /* wgsl */ `
    attribute vertex_position: vec4f;
    attribute pollenSeed: vec4f;
    uniform matrix_viewProjection: mat4x4f;
    uniform matrix_view: mat4x4f;
    uniform view_position: vec3f;
    uniform meadowWind: vec4f;
    uniform meadowDrift: vec4f;
    uniform pollenBox: vec3f;
    uniform pollenSunDirection: vec3f;
    varying vCorner: vec2f;
    varying vFade: f32;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        let time: f32 = uniform.meadowWind.w;
        let phase: f32 = vertex_position.w;
        var drift: vec3f = vec3f(uniform.meadowDrift.z, 0.0, uniform.meadowDrift.w);
        drift = drift + vec3f(sin(time * 0.31 + phase * 6.28), sin(time * 0.53 + phase * 11.0) * 0.6, cos(time * 0.27 + phase * 4.1)) * 0.35;
        let box: vec3f = uniform.pollenBox;
        let origin: vec3f = uniform.view_position - box * vec3f(0.5, 0.45, 0.5);
        let q: vec3f = pollenSeed.xyz * box + drift - origin;
        let p: vec3f = origin + q - box * floor(q / box);

        let right: vec3f = vec3f(uniform.matrix_view[0][0], uniform.matrix_view[1][0], uniform.matrix_view[2][0]);
        let up: vec3f = vec3f(uniform.matrix_view[0][1], uniform.matrix_view[1][1], uniform.matrix_view[2][1]);
        let dist: f32 = distance(p, uniform.view_position);
        let size: f32 = max(vertex_position.z, dist * 0.0012);
        let position: vec3f = p + (right * vertex_position.x + up * vertex_position.y) * size;

        let inBox: vec3f = (p - origin) / box;
        let edge: vec3f = min(inBox, 1.0 - inBox);
        let fade: f32 = smoothstep(0.0, 0.15, min(min(edge.x, edge.y), edge.z)) * smoothstep(0.25, 0.8, dist);
        let toSun: f32 = max(dot(normalize(p - uniform.view_position), uniform.pollenSunDirection), 0.0);
        output.vFade = fade * (0.06 + pow(toSun, 6.0) * 1.6);
        output.vCorner = vertex_position.xy;
        output.position = uniform.matrix_viewProjection * vec4f(position, 1.0);
        return output;
    }
`;

export const pollenFragmentWGSL = /* wgsl */ `
    #include "gammaPS"
    #include "tonemappingPS"

    uniform pollenSunColor: vec3f;
    varying vCorner: vec2f;
    varying vFade: f32;

    @fragment
    fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let round: f32 = 1.0 - smoothstep(0.35, 1.0, length(input.vCorner));
        output.color = vec4f(gammaCorrectOutput(toneMap(uniform.pollenSunColor * round * input.vFade)), 1.0);
        return output;
    }
`;

// A tree sways in the wind: its crown leans downwind, more the higher it is, and rocks back and
// forth, each tree at its own pace; the leaves flutter on top of that. The sway replaces the
// engine's transform for the bark and the leaves alike, so twigs and leaves stay together.
const swayGLSL = /* glsl */ `
    uniform vec4 meadowWind;
    uniform float treeFlutter;

    vec4 getPosition() {
        dModelMatrix = getModelMatrix();
        vec3 local = vertex_position.xyz;
        vec4 posW = dModelMatrix * vec4(local, 1.0);
        vec3 origin = dModelMatrix[3].xyz;
        float t = meadowWind.w;
        float phase = dot(origin.xz, vec2(0.13, 0.07));
        float high = max(local.y, 0.0) / 14.0;
        float rock = 0.1 + 0.07 * sin(t * 0.8 + phase) + 0.03 * sin(t * 2.1 + phase * 3.0);
        vec2 sway = meadowWind.xy * meadowWind.z * rock * high * high * 2.5;
        float flutter = sin(t * 6.3 + dot(posW.xyz, vec3(3.1, 2.3, 1.7))) * 0.03 * meadowWind.z * treeFlutter;
        posW.xyz += vec3(sway.x, 0.0, sway.y) + flutter;
        dPositionW = posW.xyz;
        return matrix_viewProjection * posW;
    }

    vec3 getWorldPosition() {
        return dPositionW;
    }
`;

const swayWGSL = /* wgsl */ `
    uniform meadowWind: vec4f;
    uniform treeFlutter: f32;

    fn getPosition() -> vec4f {
        dModelMatrix = getModelMatrix();
        let local: vec3f = vertex_position.xyz;
        var posW: vec4f = dModelMatrix * vec4f(local, 1.0);
        let origin: vec3f = dModelMatrix[3].xyz;
        let t: f32 = uniform.meadowWind.w;
        let phase: f32 = dot(origin.xz, vec2f(0.13, 0.07));
        let high: f32 = max(local.y, 0.0) / 14.0;
        let rock: f32 = 0.1 + 0.07 * sin(t * 0.8 + phase) + 0.03 * sin(t * 2.1 + phase * 3.0);
        let sway: vec2f = uniform.meadowWind.xy * uniform.meadowWind.z * rock * high * high * 2.5;
        let flutter: f32 = sin(t * 6.3 + dot(posW.xyz, vec3f(3.1, 2.3, 1.7))) * 0.03 * uniform.meadowWind.z * uniform.treeFlutter;
        posW = vec4f(posW.xyz + vec3f(sway.x, 0.0, sway.y) + flutter, posW.w);
        dPositionW = posW.xyz;
        return uniform.matrix_viewProjection * posW;
    }

    fn getWorldPosition() -> vec3f {
        return dPositionW;
    }
`;

// Trees fade into the same haze as the land they stand on
const treeHazeGLSL = {
    litUserDeclarationPS: /* glsl */ `
        uniform vec3 meadowEye;
    `,
    fogPS: aerialGLSL
};

const treeHazeWGSL = {
    litUserDeclarationPS: /* wgsl */ `
        uniform meadowEye: vec3f;
    `,
    fogPS: aerialWGSL
};

export const barkChunks = {
    glsl: { transformVS: swayGLSL, ...treeHazeGLSL },
    wgsl: { transformVS: swayWGSL, ...treeHazeWGSL }
};

// A tree's leaves are cards: many small quads, each carrying a spray of leaves, lit as though the
// crown they make up were one soft, rounded mass - their normals point out from the heart of the
// crown - and glowing where the sun shines through them.
export const leafChunks = {
    glsl: {
        ...treeHazeGLSL,
        transformVS: swayGLSL,
        lightDiffuseLambertPS: /* glsl */ `
            float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
                float nDotL = dot(worldNormal, -lightDirNorm);
                float wrap = max((nDotL + 0.35) / 1.35, 0.0);
                float through = pow(max(dot(dViewDirW, lightDirNorm), 0.0), 5.0) * 0.8;
                return wrap + through;
            }
        `
    },
    wgsl: {
        ...treeHazeWGSL,
        transformVS: swayWGSL,
        lightDiffuseLambertPS: /* wgsl */ `
            fn getLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f) -> f32 {
                let nDotL: f32 = dot(worldNormal, -lightDirNorm);
                let wrap: f32 = max((nDotL + 0.35) / 1.35, 0.0);
                let through: f32 = pow(max(dot(dViewDirW, lightDirNorm), 0.0), 5.0) * 0.8;
                return wrap + through;
            }
        `
    }
};
