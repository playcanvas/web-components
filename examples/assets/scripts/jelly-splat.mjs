import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA32F,
    Quat,
    Script,
    Texture,
    Vec3,
    WORKBUFFER_UPDATE_ALWAYS,
    WORKBUFFER_UPDATE_AUTO
} from 'playcanvas';

/**
 * Soft body physics for a gaussian splat, so it wobbles like jelly when it is pulled.
 *
 * The splat itself is never simulated. A coarse lattice of cubic cells is fitted around it, filled
 * in (splats only sample an object's surface), and simulated with XPBD, extended position based
 * dynamics: distance constraints along the edges of the tetrahedra the cells are split into, and
 * volume constraints on the tetrahedra themselves, which keep the body incompressible the way
 * jelly is. Each frame the engine's work buffer copy moves every splat to the blend of its cell's
 * eight simulated corners, and stretches and turns its shape with the local deformation.
 */

// The copy stage modifier, in GLSL for WebGL 2 and in WGSL for WebGPU. Both hooks work from the
// splat's own model space data (its center, and its rotation and scale with the placement
// transform the copy applied taken back out), so the result never depends on which entity
// transform the copy was made with. The deformed covariance F R S S R^T F^T has no hook of its
// own, so it is factored back into a rotation and a scale with a few Jacobi sweeps, done in the
// splat's frame, where the rest pose is already diagonal and they converge at once.
const glsl = /* glsl */ `
uniform highp sampler2D uJellyNodes;    // RGBA32F node world positions, texel (x, y + z * ny)
uniform mat4 uJellyModelToGrid;         // model space splat center -> lattice coordinates
uniform vec3 uJellyDims;                // lattice node counts

// the deformation gradient, model space to world space, from modifySplatCenter
mat3 jellyF;

vec3 jellyNode(ivec3 n) {
    return texelFetch(uJellyNodes, ivec2(n.x, n.y + n.z * int(uJellyDims.y)), 0).xyz;
}

mat3 jellyQuatToMat3(vec4 q) {
    vec3 q2 = q.xyz * 2.0;
    float xx = q.x * q2.x, yy = q.y * q2.y, zz = q.z * q2.z;
    float xy = q.x * q2.y, xz = q.x * q2.z, yz = q.y * q2.z;
    float wx = q.w * q2.x, wy = q.w * q2.y, wz = q.w * q2.z;
    return mat3(
        1.0 - (yy + zz), xy + wz, xz - wy,
        xy - wz, 1.0 - (xx + zz), yz + wx,
        xz + wy, yz - wx, 1.0 - (xx + yy)
    );
}

vec4 jellyQuatMul(vec4 a, vec4 b) {
    return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}

vec4 jellyMat3ToQuat(vec3 c0, vec3 c1, vec3 c2) {
    float tr = c0.x + c1.y + c2.z;
    vec4 q;
    if (tr > 0.0) {
        float s = sqrt(tr + 1.0) * 2.0;
        q = vec4((c1.z - c2.y) / s, (c2.x - c0.z) / s, (c0.y - c1.x) / s, 0.25 * s);
    } else if (c0.x > c1.y && c0.x > c2.z) {
        float s = sqrt(1.0 + c0.x - c1.y - c2.z) * 2.0;
        q = vec4(0.25 * s, (c1.x + c0.y) / s, (c2.x + c0.z) / s, (c1.z - c2.y) / s);
    } else if (c1.y > c2.z) {
        float s = sqrt(1.0 + c1.y - c0.x - c2.z) * 2.0;
        q = vec4((c1.x + c0.y) / s, 0.25 * s, (c2.y + c1.z) / s, (c2.x - c0.z) / s);
    } else {
        float s = sqrt(1.0 + c2.z - c0.x - c1.y) * 2.0;
        q = vec4((c2.x + c0.z) / s, (c2.y + c1.z) / s, 0.25 * s, (c0.y - c1.x) / s);
    }
    return normalize(q);
}

// one Jacobi rotation zeroing apq of a symmetric 3x3 matrix, r being the remaining index
void jellyRotate(inout float app, inout float aqq, inout float apq, inout float arp, inout float arq, inout vec3 vp, inout vec3 vq) {
    if (apq == 0.0) {
        return;
    }
    float theta = (aqq - app) / (2.0 * apq);
    float t = (theta >= 0.0 ? 1.0 : -1.0) / (abs(theta) + sqrt(theta * theta + 1.0));
    float c = inversesqrt(t * t + 1.0);
    float s = t * c;
    app -= t * apq;
    aqq += t * apq;
    apq = 0.0;
    float rp = arp;
    float rq = arq;
    arp = c * rp - s * rq;
    arq = s * rp + c * rq;
    vec3 p = vp;
    vec3 q = vq;
    vp = c * p - s * q;
    vq = s * p + c * q;
}

void modifySplatCenter(inout vec3 center) {
    vec3 g = (uJellyModelToGrid * vec4(getCenter(), 1.0)).xyz;
    ivec3 c = clamp(ivec3(floor(g)), ivec3(0), ivec3(uJellyDims) - 2);
    vec3 f = g - vec3(c);

    vec3 p000 = jellyNode(c);
    vec3 p100 = jellyNode(c + ivec3(1, 0, 0));
    vec3 p010 = jellyNode(c + ivec3(0, 1, 0));
    vec3 p110 = jellyNode(c + ivec3(1, 1, 0));
    vec3 p001 = jellyNode(c + ivec3(0, 0, 1));
    vec3 p101 = jellyNode(c + ivec3(1, 0, 1));
    vec3 p011 = jellyNode(c + ivec3(0, 1, 1));
    vec3 p111 = jellyNode(c + ivec3(1, 1, 1));

    // derivatives of the trilinear blend along the lattice axes
    vec3 du = mix(mix(p100 - p000, p110 - p010, f.y), mix(p101 - p001, p111 - p011, f.y), f.z);
    vec3 dv = mix(mix(p010 - p000, p110 - p100, f.x), mix(p011 - p001, p111 - p101, f.x), f.z);
    vec3 dw = mix(mix(p001 - p000, p101 - p100, f.x), mix(p011 - p010, p111 - p110, f.x), f.y);

    vec3 x0 = mix(mix(p000, p100, f.x), mix(p010, p110, f.x), f.y);
    vec3 x1 = mix(mix(p001, p101, f.x), mix(p011, p111, f.x), f.y);
    center = mix(x0, x1, f.z);

    jellyF = mat3(du, dv, dw) * mat3(uJellyModelToGrid);
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    vec4 srcRotation = jellyQuatMul(vec4(-model_rotation.xyz, model_rotation.w), rotation);
    vec3 srcScale = scale / model_scale;

    // the deformed covariance, in the frame of the splat's current world rotation
    mat3 G = transpose(jellyQuatToMat3(rotation)) * jellyF * jellyQuatToMat3(srcRotation);
    mat3 M = mat3(G[0] * srcScale.x, G[1] * srcScale.y, G[2] * srcScale.z);
    mat3 B = M * transpose(M);

    float a00 = B[0][0];
    float a11 = B[1][1];
    float a22 = B[2][2];
    float a01 = B[1][0];
    float a02 = B[2][0];
    float a12 = B[2][1];
    vec3 v0 = vec3(1.0, 0.0, 0.0);
    vec3 v1 = vec3(0.0, 1.0, 0.0);
    vec3 v2 = vec3(0.0, 0.0, 1.0);
    for (int i = 0; i < 3; i++) {
        jellyRotate(a00, a11, a01, a02, a12, v0, v1);
        jellyRotate(a00, a22, a02, a01, a12, v0, v2);
        jellyRotate(a11, a22, a12, a01, a02, v1, v2);
    }

    scale = sqrt(max(vec3(a00, a11, a22), vec3(0.0)));
    rotation = jellyQuatMul(rotation, jellyMat3ToQuat(v0, v1, v2));
    // the copy stage keeps w positive, so keep it that way
    if (rotation.w < 0.0) {
        rotation = -rotation;
    }
}

void modifySplatColor(vec3 center, inout vec4 color) {
}
`;

const wgsl = /* wgsl */ `
var uJellyNodes: texture_2d<f32>;
uniform uJellyModelToGrid: mat4x4f;
uniform uJellyDims: vec3f;

var<private> jellyF: mat3x3f;

fn jellyNode(n: vec3i) -> vec3f {
    return textureLoad(uJellyNodes, vec2i(n.x, n.y + n.z * i32(uniform.uJellyDims.y)), 0).xyz;
}

fn jellyQuatToMat3(q: vec4f) -> mat3x3f {
    let q2 = q.xyz * 2.0;
    let xx = q.x * q2.x;
    let yy = q.y * q2.y;
    let zz = q.z * q2.z;
    let xy = q.x * q2.y;
    let xz = q.x * q2.z;
    let yz = q.y * q2.z;
    let wx = q.w * q2.x;
    let wy = q.w * q2.y;
    let wz = q.w * q2.z;
    return mat3x3f(
        1.0 - (yy + zz), xy + wz, xz - wy,
        xy - wz, 1.0 - (xx + zz), yz + wx,
        xz + wy, yz - wx, 1.0 - (xx + yy)
    );
}

fn jellyQuatMul(a: vec4f, b: vec4f) -> vec4f {
    return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}

fn jellyMat3ToQuat(c0: vec3f, c1: vec3f, c2: vec3f) -> vec4f {
    let tr = c0.x + c1.y + c2.z;
    var q: vec4f;
    if (tr > 0.0) {
        let s = sqrt(tr + 1.0) * 2.0;
        q = vec4f((c1.z - c2.y) / s, (c2.x - c0.z) / s, (c0.y - c1.x) / s, 0.25 * s);
    } else if (c0.x > c1.y && c0.x > c2.z) {
        let s = sqrt(1.0 + c0.x - c1.y - c2.z) * 2.0;
        q = vec4f(0.25 * s, (c1.x + c0.y) / s, (c2.x + c0.z) / s, (c1.z - c2.y) / s);
    } else if (c1.y > c2.z) {
        let s = sqrt(1.0 + c1.y - c0.x - c2.z) * 2.0;
        q = vec4f((c1.x + c0.y) / s, 0.25 * s, (c2.y + c1.z) / s, (c2.x - c0.z) / s);
    } else {
        let s = sqrt(1.0 + c2.z - c0.x - c1.y) * 2.0;
        q = vec4f((c2.x + c0.z) / s, (c2.y + c1.z) / s, 0.25 * s, (c0.y - c1.x) / s);
    }
    return normalize(q);
}

fn jellyRotate(app: ptr<function, f32>, aqq: ptr<function, f32>, apq: ptr<function, f32>, arp: ptr<function, f32>, arq: ptr<function, f32>, vp: ptr<function, vec3f>, vq: ptr<function, vec3f>) {
    if (*apq == 0.0) {
        return;
    }
    let theta = (*aqq - *app) / (2.0 * *apq);
    let t = select(-1.0, 1.0, theta >= 0.0) / (abs(theta) + sqrt(theta * theta + 1.0));
    let c = inverseSqrt(t * t + 1.0);
    let s = t * c;
    *app = *app - t * *apq;
    *aqq = *aqq + t * *apq;
    *apq = 0.0;
    let rp = *arp;
    let rq = *arq;
    *arp = c * rp - s * rq;
    *arq = s * rp + c * rq;
    let p = *vp;
    let q = *vq;
    *vp = c * p - s * q;
    *vq = s * p + c * q;
}

fn modifySplatCenter(center: ptr<function, vec3f>) {
    let g = (uniform.uJellyModelToGrid * vec4f(getCenter(), 1.0)).xyz;
    let c = clamp(vec3i(floor(g)), vec3i(0), vec3i(uniform.uJellyDims) - vec3i(2));
    let f = g - vec3f(c);

    let p000 = jellyNode(c);
    let p100 = jellyNode(c + vec3i(1, 0, 0));
    let p010 = jellyNode(c + vec3i(0, 1, 0));
    let p110 = jellyNode(c + vec3i(1, 1, 0));
    let p001 = jellyNode(c + vec3i(0, 0, 1));
    let p101 = jellyNode(c + vec3i(1, 0, 1));
    let p011 = jellyNode(c + vec3i(0, 1, 1));
    let p111 = jellyNode(c + vec3i(1, 1, 1));

    let du = mix(mix(p100 - p000, p110 - p010, f.y), mix(p101 - p001, p111 - p011, f.y), f.z);
    let dv = mix(mix(p010 - p000, p110 - p100, f.x), mix(p011 - p001, p111 - p101, f.x), f.z);
    let dw = mix(mix(p001 - p000, p101 - p100, f.x), mix(p011 - p010, p111 - p110, f.x), f.y);

    let x0 = mix(mix(p000, p100, f.x), mix(p010, p110, f.x), f.y);
    let x1 = mix(mix(p001, p101, f.x), mix(p011, p111, f.x), f.y);
    *center = mix(x0, x1, f.z);

    let m = uniform.uJellyModelToGrid;
    jellyF = mat3x3f(du, dv, dw) * mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
    let mr = uniform.model_rotation;
    let srcRotation = jellyQuatMul(vec4f(-mr.xyz, mr.w), *rotation);
    let s = *scale / uniform.model_scale;

    let G = transpose(jellyQuatToMat3(*rotation)) * jellyF * jellyQuatToMat3(srcRotation);
    let M = mat3x3f(G[0] * s.x, G[1] * s.y, G[2] * s.z);
    let B = M * transpose(M);

    var a00 = B[0][0];
    var a11 = B[1][1];
    var a22 = B[2][2];
    var a01 = B[1][0];
    var a02 = B[2][0];
    var a12 = B[2][1];
    var v0 = vec3f(1.0, 0.0, 0.0);
    var v1 = vec3f(0.0, 1.0, 0.0);
    var v2 = vec3f(0.0, 0.0, 1.0);
    for (var i = 0; i < 3; i++) {
        jellyRotate(&a00, &a11, &a01, &a02, &a12, &v0, &v1);
        jellyRotate(&a00, &a22, &a02, &a01, &a12, &v0, &v2);
        jellyRotate(&a11, &a22, &a12, &a01, &a02, &v1, &v2);
    }

    *scale = sqrt(max(vec3f(a00, a11, a22), vec3f(0.0)));
    let r = jellyQuatMul(*rotation, jellyMat3ToQuat(v0, v1, v2));
    *rotation = select(r, -r, r.w < 0.0);
}

fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
}
`;

// The 6 tetrahedra of a cube split along its 0-7 diagonal (corner bits: x = 1, y = 2, z = 4).
// Every cube is split the same way, so the tetrahedra of neighboring cells share their faces.
const CUBE_TETS = [
    [0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]
];

// The simulation runs in fixed steps, in seconds, each split into solver substeps. The step must
// not follow the frame time: XPBD's soft constraints gain energy when it varies, and a body never
// settles.
const STEP = 1 / 120;
const SUBSTEPS = 8;

// The edge compliance (the inverse of stiffness) at floppiness 0 and 1, spaced logarithmically in
// between. The body's total mass is 1, whatever its size; at the floppy end a body 2 m tall
// slumps under its own weight but still stands, and a little beyond it collapses.
const COMPLIANCE_FIRM = 0.0005;
const COMPLIANCE_FLOPPY = 0.45;

// How softly grabbed nodes follow the pointer
const GRAB_COMPLIANCE = 0.0005;

// How far the pointer can pull the body, as a fraction of its size. The limit is what keeps the
// body inside its grown culling bounds.
const PULL_LIMIT = 0.5;

// Resources whose bounds have been grown already, so a second body sharing one doesn't grow them
// again
const grownResources = new WeakSet();

const v1 = new Vec3();
const v2 = new Vec3();
const q1 = new Quat();

/**
 * Makes the gaussian splat on this entity a soft body that can be pulled around with the pointer
 * and wobbles back. Add it to an entity with a gsplat component.
 *
 * By default the body is glued to a floor at y = 0: its bottom stays exactly still, and the rest
 * bends and springs back. A pointer press on the splat grabs it, and the camera controls never
 * see the press, so the camera stays put while dragging; a press anywhere else orbits as usual.
 * A body that is not anchored is free, and falls onto the floor and can be pushed over.
 */
class JellySplat extends Script {
    static scriptName = 'jellySplat';

    /**
     * The number of lattice cells along the splat's longest side. More cells let smaller parts
     * bend on their own, at a cost that grows with the cube of it.
     * @type {number}
     * @attribute
     */
    resolution = 10;

    /**
     * How quickly wobbles die away, per second.
     * @type {number}
     * @attribute
     */
    damping = 1.6;

    /**
     * The acceleration of gravity, in meters per second squared.
     * @type {number}
     * @attribute
     */
    gravity = 9.81;

    /**
     * How strongly the floor and the wall resist sliding along them, from 0 to 1.
     * @type {number}
     * @attribute
     */
    friction = 0.9;

    /**
     * What the body is glued to when anchored: 'floor', or 'wall' for a wall at z = wall behind
     * it. The body is moved to touch it.
     * @type {string}
     * @attribute
     */
    mount = 'floor';

    /**
     * The height of the floor.
     * @type {number}
     * @attribute
     */
    floor = 0;

    /**
     * The z position of the wall, for a body mounted on one.
     * @type {number}
     * @attribute
     */
    wall = 0;

    /**
     * Whether the body is glued to its mount, so pulling it bends it rather than moving it.
     * @type {boolean}
     * @attribute
     */
    anchor = true;

    /**
     * How much of the body is held still when anchored, as a fraction of its extent away from
     * the mount. Whole lattice cells are held, so the still part can reach up to a cell further.
     * @type {number}
     * @attribute
     */
    anchorBand = 0.12;

    _floppiness = 0.37;

    _built = false;

    _awake = true;

    _still = 0;

    _accum = 0;

    _pinned = false;

    _refit = false;

    _grab = null;

    /**
     * How floppy the body is, from 0 (firm) to 1 (very floppy). Changing it wakes the body, which
     * sags or firms up into its new shape.
     * @type {number}
     * @attribute
     */
    set floppiness(value) {
        this._floppiness = value;
        this.wake();
    }

    get floppiness() {
        return this._floppiness;
    }

    initialize() {
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        // capture phase, ahead of the camera controls. A cancelled pointer, like a touch the
        // browser takes over, lets go the same as one that is lifted.
        window.addEventListener('pointerdown', this._onPointerDown, true);
        window.addEventListener('pointermove', this._onPointerMove, true);
        window.addEventListener('pointerup', this._onPointerUp, true);
        window.addEventListener('pointercancel', this._onPointerUp, true);
        this.on('destroy', () => this._cleanup());
    }

    update(dt) {
        if ((!this._built && !this._build()) || !this._awake) {
            return;
        }

        this._accum = Math.min(this._accum + dt, 4 * STEP);
        while (this._accum >= STEP) {
            this._simulate(STEP, this.damping);
            this._accum -= STEP;
        }

        // An anchored body goes nowhere, so its entity stays put. Moving it would also turn the
        // view direction its spherical harmonics are evaluated with, shifting the colors of the
        // part held still.
        if (!this._pinned || this._refit) {
            this._fitRigid();
            this._refit = false;
        }
        this._upload();

        // Once still for a second, stop simulating and stop copying the splats every frame: the
        // work buffer keeps the last deformed state
        if (!this._grab && this._maxSpeed() < 0.01 * this._cellSizeWorld) {
            this._still += dt;
            if (this._still > 1) {
                this._awake = false;
                this.entity.gsplat.workBufferUpdate = WORKBUFFER_UPDATE_AUTO;
            }
        } else {
            this._still = 0;
        }
    }

    /**
     * Puts the body back in its rest pose, still, and glued to its mount if anchor is set.
     */
    reset() {
        if (!this._built) {
            return;
        }
        this._pos.set(this._stand);
        this._prev.set(this._stand);
        this._vel.fill(0);
        this._fit.set(0, 0, 0, 1);
        this._grab = null;
        this._setPinned(this.anchor);
        this._refit = true;
        this.wake();
    }

    /**
     * Resumes the simulation of a body that has come to rest. Pulling it, resetting it and
     * changing its floppiness all do this already.
     */
    wake() {
        this._still = 0;
        if (!this._awake) {
            this._awake = true;
            this.entity.gsplat.workBufferUpdate = WORKBUFFER_UPDATE_ALWAYS;
        }
    }

    // ------------------------------------------------------------------------------ setup

    _build() {
        const gsplat = this.entity.gsplat;
        const centers = gsplat?.resource?.centers;
        if (!centers) {
            return false;
        }

        this._fitLattice(centers);
        const solid = this._findSolid(centers);
        this._buildBody(solid);
        this._sampleSurface(centers, solid);
        this._placeOnMount(solid);
        this._growBounds(gsplat);

        this._tex = new Texture(this.app.graphicsDevice, {
            name: 'JellyNodes',
            width: this._dims[0],
            height: this._dims[1] * this._dims[2],
            format: PIXELFORMAT_RGBA32F,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        gsplat.setWorkBufferModifier({ glsl, wgsl });
        gsplat.workBufferUpdate = WORKBUFFER_UPDATE_ALWAYS;
        this._built = true;

        // let an anchored body sag under gravity (heavily damped), so it starts out still
        this.reset();
        if (this.anchor) {
            for (let i = 0; i < 480; i++) {
                this._simulate(STEP, 20);
            }
            this._stand.set(this._pos);
            this.reset();
        }
        return true;
    }

    // Fits the lattice to the splat's model space bounds, ignoring the outermost 0.2% of splats
    // along each axis (a few floaters), then growing back to cover everything within 10% of that
    // box, so sparse real surfaces like the bottom face of a base stay inside.
    _fitLattice(centers) {
        const count = centers.length / 3;
        const stride = Math.max(1, Math.floor(count / 60000));
        const n = Math.floor(count / stride);
        const lo = [];
        const hi = [];
        for (let a = 0; a < 3; a++) {
            const values = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                values[i] = centers[i * stride * 3 + a];
            }
            values.sort();
            lo[a] = values[Math.floor(0.002 * (n - 1))];
            hi[a] = values[Math.ceil(0.998 * (n - 1))];
        }
        const grow = 0.1 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const min = [lo[0], lo[1], lo[2]];
        const max = [hi[0], hi[1], hi[2]];
        for (let i = 0; i < count; i++) {
            for (let a = 0; a < 3; a++) {
                const v = centers[i * 3 + a];
                if (v >= lo[a] - grow && v <= hi[a] + grow) {
                    min[a] = Math.min(min[a], v);
                    max[a] = Math.max(max[a], v);
                }
            }
        }

        const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        const margin = 0.02 * longest;
        const h = (longest + 2 * margin) / this.resolution;
        this._h = h;
        this._cells = [];
        this._origin = [];
        for (let a = 0; a < 3; a++) {
            this._cells[a] = Math.max(1, Math.ceil((max[a] - min[a] + 2 * margin) / h - 1e-6));
            this._origin[a] = (min[a] + max[a]) * 0.5 - this._cells[a] * h * 0.5;
        }
        this._dims = this._cells.map(c => c + 1);

        // maps a model space splat center to lattice coordinates, in the copy shader
        this._modelToGrid = new Float32Array([
            1 / h, 0, 0, 0,
            0, 1 / h, 0, 0,
            0, 0, 1 / h, 0,
            -this._origin[0] / h, -this._origin[1] / h, -this._origin[2] / h, 1
        ]);
    }

    _cellIndex(i, j, k) {
        return i + this._cells[0] * (j + this._cells[1] * k);
    }

    _nodeIndex(i, j, k) {
        return i + this._dims[0] * (j + this._dims[1] * k);
    }

    _cornerNode(i, j, k, bit) {
        return this._nodeIndex(i + (bit & 1), j + ((bit >> 1) & 1), k + ((bit >> 2) & 1));
    }

    // the cell holding a model space point, or -1 outside the lattice
    _cellOf(centers, s) {
        const [cx, cy, cz] = this._cells;
        const i = Math.floor((centers[s * 3] - this._origin[0]) / this._h);
        const j = Math.floor((centers[s * 3 + 1] - this._origin[1]) / this._h);
        const k = Math.floor((centers[s * 3 + 2] - this._origin[2]) / this._h);
        return (i < 0 || j < 0 || k < 0 || i >= cx || j >= cy || k >= cz) ? -1 : this._cellIndex(i, j, k);
    }

    // The cells the body is made of: those holding splats, plus the interior they enclose, keeping
    // only the largest connected piece so stray floaters don't become bodies of their own
    _findSolid(centers) {
        const [cx, cy, cz] = this._cells;
        const numCells = cx * cy * cz;
        const occupied = new Uint8Array(numCells);
        for (let s = 0; s < centers.length / 3; s++) {
            const c = this._cellOf(centers, s);
            if (c >= 0) {
                occupied[c] = 1;
            }
        }

        // A cell is interior if occupied cells lie in at least 5 of the 6 axis directions from
        // it, which tolerates one open side, like the uncaptured underside of a scanned object
        const hits = new Uint8Array(numCells);
        const scan = (length, cellAt) => {
            for (const [from, to, step] of [[0, length, 1], [length - 1, -1, -1]]) {
                let seen = false;
                for (let t = from; t !== to; t += step) {
                    const c = cellAt(t);
                    if (seen) {
                        hits[c]++;
                    }
                    seen = seen || occupied[c] === 1;
                }
            }
        };
        for (let k = 0; k < cz; k++) {
            for (let j = 0; j < cy; j++) {
                scan(cx, t => this._cellIndex(t, j, k));
            }
            for (let i = 0; i < cx; i++) {
                scan(cy, t => this._cellIndex(i, t, k));
            }
        }
        for (let j = 0; j < cy; j++) {
            for (let i = 0; i < cx; i++) {
                scan(cz, t => this._cellIndex(i, j, t));
            }
        }
        const filled = occupied.map((o, c) => (o || hits[c] >= 5 ? 1 : 0));

        // flood fill each 6-connected piece, and keep the largest
        const label = new Int32Array(numCells).fill(-1);
        let largest = -1;
        let largestSize = 0;
        for (let seed = 0, id = 0; seed < numCells; seed++, id++) {
            if (!filled[seed] || label[seed] >= 0) {
                continue;
            }
            const stack = [seed];
            label[seed] = id;
            let size = 0;
            while (stack.length) {
                const c = stack.pop();
                const i = c % cx;
                const j = Math.floor(c / cx) % cy;
                const k = Math.floor(c / (cx * cy));
                size++;
                for (const [di, dj, dk] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
                    const ni = i + di;
                    const nj = j + dj;
                    const nk = k + dk;
                    if (ni < 0 || nj < 0 || nk < 0 || ni >= cx || nj >= cy || nk >= cz) {
                        continue;
                    }
                    const d = this._cellIndex(ni, nj, nk);
                    if (filled[d] && label[d] < 0) {
                        label[d] = id;
                        stack.push(d);
                    }
                }
            }
            if (size > largestSize) {
                largestSize = size;
                largest = id;
            }
        }
        return label.map(l => (l === largest ? 1 : 0));
    }

    // The simulated nodes (the corners of solid cells), their masses, and the constraints
    _buildBody(solid) {
        const [cx, cy, cz] = this._cells;
        const [nx, ny, nz] = this._dims;
        const numNodes = nx * ny * nz;
        const world = this.entity.getWorldTransform();
        const scale = world.getScale();
        this._cellSizeWorld = this._h * (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
        // the lattice's longest side, in world units
        this._size = this._cellSizeWorld * this.resolution;

        // node positions at rest, in model space and in world space
        this._restModel = new Float64Array(numNodes * 3);
        this._restWorld = new Float64Array(numNodes * 3);
        for (let k = 0; k < nz; k++) {
            for (let j = 0; j < ny; j++) {
                for (let i = 0; i < nx; i++) {
                    const n = this._nodeIndex(i, j, k) * 3;
                    v1.set(this._origin[0] + i * this._h, this._origin[1] + j * this._h, this._origin[2] + k * this._h);
                    world.transformPoint(v1, v2);
                    this._restModel[n] = v1.x;
                    this._restModel[n + 1] = v1.y;
                    this._restModel[n + 2] = v1.z;
                    this._restWorld[n] = v2.x;
                    this._restWorld[n + 1] = v2.y;
                    this._restWorld[n + 2] = v2.z;
                }
            }
        }

        // uniform density: each solid cell gives an eighth of its mass to each corner
        const mass = new Float64Array(numNodes);
        const cellMass = 1 / solid.reduce((sum, s) => sum + s, 0);
        const tets = [];
        for (let k = 0; k < cz; k++) {
            for (let j = 0; j < cy; j++) {
                for (let i = 0; i < cx; i++) {
                    if (!solid[this._cellIndex(i, j, k)]) {
                        continue;
                    }
                    for (let b = 0; b < 8; b++) {
                        mass[this._cornerNode(i, j, k, b)] += cellMass / 8;
                    }
                    for (const tet of CUBE_TETS) {
                        tets.push(...tet.map(b => this._cornerNode(i, j, k, b)));
                    }
                }
            }
        }
        const sim = [];
        const invMass = new Float64Array(numNodes);
        for (let n = 0; n < numNodes; n++) {
            if (mass[n] > 0) {
                sim.push(n);
                invMass[n] = 1 / mass[n];
            }
        }

        // each tetrahedron edge once
        const keys = new Set();
        const edges = [];
        for (let t = 0; t < tets.length; t += 4) {
            for (let a = 0; a < 4; a++) {
                for (let b = a + 1; b < 4; b++) {
                    const i = Math.min(tets[t + a], tets[t + b]);
                    const j = Math.max(tets[t + a], tets[t + b]);
                    if (!keys.has(i * numNodes + j)) {
                        keys.add(i * numNodes + j);
                        edges.push(i, j);
                    }
                }
            }
        }

        this._numNodes = numNodes;
        this._sim = Int32Array.from(sim);
        this._mass = mass;
        this._invMassFree = invMass;
        this._invMass = invMass.slice();
        this._tets = Int32Array.from(tets);
        this._edges = Int32Array.from(edges);
        this._pos = Float64Array.from(this._restWorld);
        this._prev = Float64Array.from(this._restWorld);
        this._vel = new Float64Array(numNodes * 3);

        const rest = this._restWorld;
        this._edgeRest = new Float64Array(edges.length / 2);
        for (let e = 0; e < edges.length; e += 2) {
            const a = edges[e] * 3;
            const b = edges[e + 1] * 3;
            this._edgeRest[e / 2] = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]);
        }
        this._tetRest = new Float64Array(tets.length / 4);
        for (let t = 0; t < tets.length; t += 4) {
            this._tetRest[t / 4] = this._tetVolume(rest, t);
        }

        // the rest center of mass and the entity's spawn transform, for the rigid fit
        this._center = new Vec3();
        for (const n of sim) {
            this._center.x += rest[n * 3] * mass[n];
            this._center.y += rest[n * 3 + 1] * mass[n];
            this._center.z += rest[n * 3 + 2] * mass[n];
        }
        this._spawnPosition = this.entity.getPosition().clone();
        this._spawnRotation = this.entity.getRotation().clone();
        this._fit = new Quat();
    }

    // Splat centers embedded in the lattice: the extremes of every solid cell along each axis
    // touch the floor and the wall, so the visible surface is what rests on them, and an even
    // sparse subset is what the pointer picks against
    _sampleSurface(centers, solid) {
        const count = centers.length / 3;
        const extremes = new Int32Array(solid.length * 6).fill(-1);
        const pickStride = Math.max(1, Math.floor(count / 6000));
        const pick = [];
        for (let s = 0; s < count; s++) {
            const c = this._cellOf(centers, s);
            if (c < 0 || !solid[c]) {
                continue;
            }
            for (let a = 0; a < 3; a++) {
                const v = centers[s * 3 + a];
                const low = extremes[c * 6 + a * 2];
                const high = extremes[c * 6 + a * 2 + 1];
                if (low < 0 || v < centers[low * 3 + a]) {
                    extremes[c * 6 + a * 2] = s;
                }
                if (high < 0 || v > centers[high * 3 + a]) {
                    extremes[c * 6 + a * 2 + 1] = s;
                }
            }
            if (s % pickStride === 0) {
                pick.push(s);
            }
        }
        this._contact = this._embed(centers, [...new Set(extremes.filter(s => s >= 0))]);
        this._pick = this._embed(centers, pick);
    }

    // The rest pose moved along the mount axis (up for the floor, forward for a wall) until its
    // splat surface just touches the mount, and the nodes the anchor holds still: every corner
    // of each solid cell reaching into the band nearest the mount, so the splats in the band stay
    // exactly still
    _placeOnMount(solid) {
        const axis = this.mount === 'wall' ? 2 : 1;
        const plane = axis === 1 ? this.floor : this.wall;
        const p = new Vec3();
        let near = Infinity;
        for (let s = 0; s < this._contact.count; s++) {
            this._embeddedPoint(this._contact, s, this._restWorld, p);
            near = Math.min(near, axis === 1 ? p.y : p.z);
        }
        this._stand = Float64Array.from(this._restWorld);
        for (const n of this._sim) {
            this._stand[n * 3 + axis] += plane - near;
        }

        let far = -Infinity;
        for (let s = 0; s < this._contact.count; s++) {
            this._embeddedPoint(this._contact, s, this._stand, p);
            far = Math.max(far, axis === 1 ? p.y : p.z);
        }
        const band = plane + this.anchorBand * (far - plane);
        const [cx, cy, cz] = this._cells;
        const anchors = new Set();
        for (let k = 0; k < cz; k++) {
            for (let j = 0; j < cy; j++) {
                for (let i = 0; i < cx; i++) {
                    if (!solid[this._cellIndex(i, j, k)]) {
                        continue;
                    }
                    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => this._cornerNode(i, j, k, b));
                    if (corners.some(n => this._stand[n * 3 + axis] < band)) {
                        corners.forEach(n => anchors.add(n));
                    }
                }
            }
        }
        this._anchorNodes = Int32Array.from(anchors);
    }

    // Grows the splat's culling bounds by the body's size on every side, which covers everywhere
    // it can reach: a pull is limited to half its size, the swing back after one is no bigger,
    // and even the floppiest sag stays within the rest. Engine 2.22 culls a unified splat on
    // WebGPU with a sphere around its resource's bounds, which ignores customAabb and is only
    // read when the work buffer is rebuilt, so the resource's box is grown in place, ahead of the
    // first rebuild, and customAabb is set to match for the rest of the engine.
    _growBounds(gsplat) {
        const aabb = gsplat.resource.aabb;
        if (!grownResources.has(gsplat.resource)) {
            grownResources.add(gsplat.resource);
            const grow = this._h * this.resolution;
            aabb.halfExtents.add(v1.set(grow, grow, grow));
        }
        gsplat.customAabb = aabb;
    }

    // trilinear embedding of splat centers in the lattice: 8 node indices and weights each
    _embed(centers, list) {
        const nodes = new Int32Array(list.length * 8);
        const weights = new Float64Array(list.length * 8);
        list.forEach((s, p) => {
            const g = [];
            const c = [];
            for (let a = 0; a < 3; a++) {
                g[a] = (centers[s * 3 + a] - this._origin[a]) / this._h;
                c[a] = Math.min(this._cells[a] - 1, Math.max(0, Math.floor(g[a])));
            }
            for (let b = 0; b < 8; b++) {
                const bx = b & 1;
                const by = (b >> 1) & 1;
                const bz = (b >> 2) & 1;
                const fx = g[0] - c[0];
                const fy = g[1] - c[1];
                const fz = g[2] - c[2];
                nodes[p * 8 + b] = this._cornerNode(c[0], c[1], c[2], b);
                weights[p * 8 + b] = (bx ? fx : 1 - fx) * (by ? fy : 1 - fy) * (bz ? fz : 1 - fz);
            }
        });
        return { count: list.length, nodes, weights };
    }

    _embeddedPoint(set, s, pos, out) {
        out.set(0, 0, 0);
        for (let b = 0; b < 8; b++) {
            const n = set.nodes[s * 8 + b] * 3;
            const w = set.weights[s * 8 + b];
            out.x += pos[n] * w;
            out.y += pos[n + 1] * w;
            out.z += pos[n + 2] * w;
        }
        return out;
    }

    _tetVolume(pos, t) {
        const a = this._tets[t] * 3;
        const b = this._tets[t + 1] * 3;
        const c = this._tets[t + 2] * 3;
        const d = this._tets[t + 3] * 3;
        const e1x = pos[b] - pos[a];
        const e1y = pos[b + 1] - pos[a + 1];
        const e1z = pos[b + 2] - pos[a + 2];
        const e2x = pos[c] - pos[a];
        const e2y = pos[c + 1] - pos[a + 1];
        const e2z = pos[c + 2] - pos[a + 2];
        const e3x = pos[d] - pos[a];
        const e3y = pos[d + 1] - pos[a + 1];
        const e3z = pos[d + 2] - pos[a + 2];
        return ((e1y * e2z - e1z * e2y) * e3x + (e1z * e2x - e1x * e2z) * e3y + (e1x * e2y - e1y * e2x) * e3z) / 6;
    }

    // ------------------------------------------------------------------------------ simulation

    _setPinned(pinned) {
        this._pinned = pinned;
        this._invMass.set(this._invMassFree);
        if (pinned) {
            for (const n of this._anchorNodes) {
                this._invMass[n] = 0;
            }
        }
    }

    _simulate(dt, damping) {
        const sdt = dt / SUBSTEPS;
        const pos = this._pos;
        const prev = this._prev;
        const vel = this._vel;
        const sim = this._sim;
        const w = this._invMass;
        for (let step = 0; step < SUBSTEPS; step++) {
            for (let n = 0; n < sim.length; n++) {
                const i = sim[n] * 3;
                prev[i] = pos[i];
                prev[i + 1] = pos[i + 1];
                prev[i + 2] = pos[i + 2];
                if (w[sim[n]] > 0) {
                    vel[i + 1] -= this.gravity * sdt;
                    pos[i] += vel[i] * sdt;
                    pos[i + 1] += vel[i + 1] * sdt;
                    pos[i + 2] += vel[i + 2] * sdt;
                }
            }
            this._solveEdges(sdt);
            this._solveVolumes();
            this._solveGrab(sdt);
            this._solvePlane(1, this.floor);
            if (this.mount === 'wall') {
                this._solvePlane(2, this.wall);
            }
            for (let n = 0; n < sim.length; n++) {
                const i = sim[n] * 3;
                vel[i] = (pos[i] - prev[i]) / sdt;
                vel[i + 1] = (pos[i + 1] - prev[i + 1]) / sdt;
                vel[i + 2] = (pos[i + 2] - prev[i + 2]) / sdt;
            }
        }
        this._damp(dt, damping);
    }

    _solveEdges(sdt) {
        const compliance = COMPLIANCE_FIRM * (COMPLIANCE_FLOPPY / COMPLIANCE_FIRM) ** this._floppiness;
        const alpha = compliance / (sdt * sdt);
        const pos = this._pos;
        const w = this._invMass;
        const edges = this._edges;
        const rest = this._edgeRest;
        for (let e = 0; e < rest.length; e++) {
            const i = edges[e * 2] * 3;
            const j = edges[e * 2 + 1] * 3;
            const wi = w[edges[e * 2]];
            const wj = w[edges[e * 2 + 1]];
            const dx = pos[i] - pos[j];
            const dy = pos[i + 1] - pos[j + 1];
            const dz = pos[i + 2] - pos[j + 2];
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (length === 0 || wi + wj === 0) {
                continue;
            }
            const s = -(length - rest[e]) / ((wi + wj + alpha) * length);
            pos[i] += dx * s * wi;
            pos[i + 1] += dy * s * wi;
            pos[i + 2] += dz * s * wi;
            pos[j] -= dx * s * wj;
            pos[j + 1] -= dy * s * wj;
            pos[j + 2] -= dz * s * wj;
        }
    }

    // incompressible: the volume constraints are hard (zero compliance)
    _solveVolumes() {
        const pos = this._pos;
        const w = this._invMass;
        const tets = this._tets;
        const rest = this._tetRest;
        const g = this._gradients ??= new Float64Array(12);
        const ids = this._ids ??= new Int32Array(4);
        for (let t = 0; t < rest.length; t++) {
            for (let k = 0; k < 4; k++) {
                ids[k] = tets[t * 4 + k] * 3;
            }
            const a = ids[0];
            const b = ids[1];
            const c = ids[2];
            const d = ids[3];
            const e1x = pos[b] - pos[a];
            const e1y = pos[b + 1] - pos[a + 1];
            const e1z = pos[b + 2] - pos[a + 2];
            const e2x = pos[c] - pos[a];
            const e2y = pos[c + 1] - pos[a + 1];
            const e2z = pos[c + 2] - pos[a + 2];
            const e3x = pos[d] - pos[a];
            const e3y = pos[d + 1] - pos[a + 1];
            const e3z = pos[d + 2] - pos[a + 2];
            // the volume's gradients for b, c and d; a's is minus their sum
            g[3] = (e2y * e3z - e2z * e3y) / 6;
            g[4] = (e2z * e3x - e2x * e3z) / 6;
            g[5] = (e2x * e3y - e2y * e3x) / 6;
            g[6] = (e3y * e1z - e3z * e1y) / 6;
            g[7] = (e3z * e1x - e3x * e1z) / 6;
            g[8] = (e3x * e1y - e3y * e1x) / 6;
            g[9] = (e1y * e2z - e1z * e2y) / 6;
            g[10] = (e1z * e2x - e1x * e2z) / 6;
            g[11] = (e1x * e2y - e1y * e2x) / 6;
            g[0] = -(g[3] + g[6] + g[9]);
            g[1] = -(g[4] + g[7] + g[10]);
            g[2] = -(g[5] + g[8] + g[11]);
            const volume = g[9] * e3x + g[10] * e3y + g[11] * e3z;
            let wsum = 0;
            for (let k = 0; k < 4; k++) {
                wsum += w[ids[k] / 3] * (g[k * 3] ** 2 + g[k * 3 + 1] ** 2 + g[k * 3 + 2] ** 2);
            }
            if (wsum === 0) {
                continue;
            }
            const s = -(volume - rest[t]) / wsum;
            for (let k = 0; k < 4; k++) {
                const wk = w[ids[k] / 3] * s;
                pos[ids[k]] += g[k * 3] * wk;
                pos[ids[k] + 1] += g[k * 3 + 1] * wk;
                pos[ids[k] + 2] += g[k * 3 + 2] * wk;
            }
        }
    }

    _solveGrab(sdt) {
        const grab = this._grab;
        if (!grab) {
            return;
        }
        const pos = this._pos;
        const w = this._invMass;
        for (let k = 0; k < grab.nodes.length; k++) {
            const n = grab.nodes[k];
            const s = w[n] / (w[n] + GRAB_COMPLIANCE / (grab.weights[k] * sdt * sdt));
            pos[n * 3] += (grab.target.x + grab.offsets[k * 3] - pos[n * 3]) * s;
            pos[n * 3 + 1] += (grab.target.y + grab.offsets[k * 3 + 1] - pos[n * 3 + 1]) * s;
            pos[n * 3 + 2] += (grab.target.z + grab.offsets[k * 3 + 2] - pos[n * 3 + 2]) * s;
        }
    }

    // contact with the plane where the axis coordinate is offset, at the embedded splat extremes;
    // friction resists sliding along it
    _solvePlane(axis, offset) {
        const set = this._contact;
        const pos = this._pos;
        const prev = this._prev;
        const w = this._invMass;
        const t1 = (axis + 1) % 3;
        const t2 = (axis + 2) % 3;
        for (let s = 0; s < set.count; s++) {
            let d = 0;
            for (let b = 0; b < 8; b++) {
                d += pos[set.nodes[s * 8 + b] * 3 + axis] * set.weights[s * 8 + b];
            }
            if (d >= offset) {
                continue;
            }
            let wsum = 0;
            let slide1 = 0;
            let slide2 = 0;
            for (let b = 0; b < 8; b++) {
                const n = set.nodes[s * 8 + b];
                const wb = set.weights[s * 8 + b];
                wsum += wb * wb * w[n];
                slide1 += (pos[n * 3 + t1] - prev[n * 3 + t1]) * wb;
                slide2 += (pos[n * 3 + t2] - prev[n * 3 + t2]) * wb;
            }
            if (wsum === 0) {
                continue;
            }
            const push = (offset - d) / wsum;
            const hold1 = -slide1 * this.friction / wsum;
            const hold2 = -slide2 * this.friction / wsum;
            for (let b = 0; b < 8; b++) {
                const n = set.nodes[s * 8 + b];
                const k = set.weights[s * 8 + b] * w[n];
                pos[n * 3 + axis] += k * push;
                pos[n * 3 + t1] += k * hold1;
                pos[n * 3 + t2] += k * hold2;
            }
        }
    }

    // Damps the motion that is not the body's best fit rigid motion, so wobbles die out while
    // falling and tumbling are left alone. Held by its anchor, all of its motion is deformation.
    _damp(dt, damping) {
        const k = 1 - Math.exp(-damping * dt);
        const pos = this._pos;
        const vel = this._vel;
        const w = this._invMass;
        const mass = this._mass;
        const sim = this._sim;
        if (this._pinned) {
            for (let n = 0; n < sim.length; n++) {
                const i = sim[n] * 3;
                vel[i] *= 1 - k;
                vel[i + 1] *= 1 - k;
                vel[i + 2] *= 1 - k;
            }
            return;
        }

        // the center of mass and its velocity
        const c = [0, 0, 0];
        const v = [0, 0, 0];
        for (let n = 0; n < sim.length; n++) {
            const i = sim[n];
            for (let a = 0; a < 3; a++) {
                c[a] += pos[i * 3 + a] * mass[i];
                v[a] += vel[i * 3 + a] * mass[i];
            }
        }

        // the angular momentum L and the inertia tensor I about it
        const L = [0, 0, 0];
        const I = [0, 0, 0, 0, 0, 0];
        for (let n = 0; n < sim.length; n++) {
            const i = sim[n];
            const m = mass[i];
            const rx = pos[i * 3] - c[0];
            const ry = pos[i * 3 + 1] - c[1];
            const rz = pos[i * 3 + 2] - c[2];
            const ux = vel[i * 3];
            const uy = vel[i * 3 + 1];
            const uz = vel[i * 3 + 2];
            L[0] += m * (ry * uz - rz * uy);
            L[1] += m * (rz * ux - rx * uz);
            L[2] += m * (rx * uy - ry * ux);
            I[0] += m * (ry * ry + rz * rz);
            I[1] += m * (rx * rx + rz * rz);
            I[2] += m * (rx * rx + ry * ry);
            I[3] -= m * rx * ry;
            I[4] -= m * rx * rz;
            I[5] -= m * ry * rz;
        }

        // the angular velocity, I^-1 L
        const [ixx, iyy, izz, ixy, ixz, iyz] = I;
        const det = ixx * (iyy * izz - iyz * iyz) - ixy * (ixy * izz - iyz * ixz) + ixz * (ixy * iyz - iyy * ixz);
        if (Math.abs(det) < 1e-20) {
            return;
        }
        const i00 = (iyy * izz - iyz * iyz) / det;
        const i01 = (ixz * iyz - ixy * izz) / det;
        const i02 = (ixy * iyz - ixz * iyy) / det;
        const i11 = (ixx * izz - ixz * ixz) / det;
        const i12 = (ixy * ixz - ixx * iyz) / det;
        const i22 = (ixx * iyy - ixy * ixy) / det;
        const wx = i00 * L[0] + i01 * L[1] + i02 * L[2];
        const wy = i01 * L[0] + i11 * L[1] + i12 * L[2];
        const wz = i02 * L[0] + i12 * L[1] + i22 * L[2];

        for (let n = 0; n < sim.length; n++) {
            if (w[sim[n]] === 0) {
                continue;
            }
            const i = sim[n] * 3;
            const rx = pos[i] - c[0];
            const ry = pos[i + 1] - c[1];
            const rz = pos[i + 2] - c[2];
            vel[i] += k * (v[0] + wy * rz - wz * ry - vel[i]);
            vel[i + 1] += k * (v[1] + wz * rx - wx * rz - vel[i + 1]);
            vel[i + 2] += k * (v[2] + wx * ry - wy * rx - vel[i + 2]);
        }
    }

    _maxSpeed() {
        const vel = this._vel;
        let max = 0;
        for (const n of this._sim) {
            max = Math.max(max, vel[n * 3] ** 2 + vel[n * 3 + 1] ** 2 + vel[n * 3 + 2] ** 2);
        }
        return Math.sqrt(max);
    }

    // ------------------------------------------------------------------------------ rendering

    // Moves the entity with the body's best fit rigid motion, so sorting and culling follow it:
    // the rotation that best maps the rest pose onto the nodes (Mueller et al. 2016, "A Robust
    // Method to Extract the Rotational Part of Deformations"), warm started from the last frame
    _fitRigid() {
        const pos = this._pos;
        const rest = this._restWorld;
        const mass = this._mass;
        const sim = this._sim;
        const c0 = this._center;
        const c = [0, 0, 0];
        for (let n = 0; n < sim.length; n++) {
            const i = sim[n];
            for (let a = 0; a < 3; a++) {
                c[a] += pos[i * 3 + a] * mass[i];
            }
        }

        // A = sum of m (x - c)(p - c0)^T, by columns
        const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let n = 0; n < sim.length; n++) {
            const i = sim[n];
            const p = [rest[i * 3] - c0.x, rest[i * 3 + 1] - c0.y, rest[i * 3 + 2] - c0.z];
            for (let col = 0; col < 3; col++) {
                for (let row = 0; row < 3; row++) {
                    A[col * 3 + row] += mass[i] * (pos[i * 3 + row] - c[row]) * p[col];
                }
            }
        }

        const q = this._fit;
        const axes = [Vec3.RIGHT, Vec3.UP, Vec3.BACK];
        for (let iter = 0; iter < 20; iter++) {
            let ox = 0;
            let oy = 0;
            let oz = 0;
            let dot = 0;
            for (let col = 0; col < 3; col++) {
                const r = q.transformVector(axes[col], v1);
                const ax = A[col * 3];
                const ay = A[col * 3 + 1];
                const az = A[col * 3 + 2];
                ox += r.y * az - r.z * ay;
                oy += r.z * ax - r.x * az;
                oz += r.x * ay - r.y * ax;
                dot += r.x * ax + r.y * ay + r.z * az;
            }
            const inv = 1 / (Math.abs(dot) + 1e-12);
            const angle = Math.hypot(ox, oy, oz) * inv;
            if (angle < 1e-9) {
                break;
            }
            const s = Math.sin(angle / 2) / angle * inv;
            q1.set(ox * s, oy * s, oz * s, Math.cos(angle / 2));
            q.mul2(q1, q).normalize();
        }

        // the entity transform: T(c) * R * T(-c0) * spawn transform
        v1.sub2(this._spawnPosition, c0);
        q.transformVector(v1, v1);
        v1.x += c[0];
        v1.y += c[1];
        v1.z += c[2];
        this.entity.setPosition(v1);
        q1.mul2(q, this._spawnRotation);
        this.entity.setRotation(q1);
    }

    _upload() {
        const world = this.entity.getWorldTransform();
        const data = this._tex.lock();
        const pos = this._pos;
        const rest = this._restModel;
        for (let n = 0; n < this._numNodes; n++) {
            if (this._mass[n] > 0) {
                // a simulated node, pinned or not
                data[n * 4] = pos[n * 3];
                data[n * 4 + 1] = pos[n * 3 + 1];
                data[n * 4 + 2] = pos[n * 3 + 2];
            } else {
                // a node outside the body, following it rigidly
                v1.set(rest[n * 3], rest[n * 3 + 1], rest[n * 3 + 2]);
                world.transformPoint(v1, v2);
                data[n * 4] = v2.x;
                data[n * 4 + 1] = v2.y;
                data[n * 4 + 2] = v2.z;
            }
            data[n * 4 + 3] = 1;
        }
        this._tex.unlock();

        const gsplat = this.entity.gsplat;
        gsplat.setParameter('uJellyNodes', this._tex);
        gsplat.setParameter('uJellyModelToGrid', this._modelToGrid);
        gsplat.setParameter('uJellyDims', this._dims);
    }

    // ------------------------------------------------------------------------------ input

    _ray(e) {
        const camera = this.app.root.findComponents('camera')[0];
        if (!camera) {
            return null;
        }
        const rect = this.app.graphicsDevice.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const origin = camera.screenToWorld(x, y, camera.nearClip);
        const dir = camera.screenToWorld(x, y, camera.farClip).sub(origin).normalize();
        return { origin, dir, forward: camera.entity.forward.clone() };
    }

    _onPointerDown(e) {
        if (!this._built || e.button !== 0 || e.target !== this.app.graphicsDevice.canvas) {
            return;
        }
        const ray = this._ray(e);
        if (!ray) {
            return;
        }

        // the nearest embedded splat along the ray, within a small radius of it
        const radius = 0.3 * this._cellSizeWorld;
        const p = new Vec3();
        let hit = null;
        let nearest = Infinity;
        for (let s = 0; s < this._pick.count; s++) {
            this._embeddedPoint(this._pick, s, this._pos, p).sub(ray.origin);
            const t = p.dot(ray.dir);
            if (t > 0 && t < nearest && p.lengthSq() - t * t < radius * radius) {
                nearest = t;
                hit = ray.dir.clone().mulScalar(t).add(ray.origin);
            }
        }
        if (!hit) {
            return;
        }

        // grab the nodes around the hit, weighted by their distance from it
        const reach = 1.5 * this._cellSizeWorld;
        const nodes = [];
        const weights = [];
        const offsets = [];
        for (const n of this._sim) {
            const dx = this._pos[n * 3] - hit.x;
            const dy = this._pos[n * 3 + 1] - hit.y;
            const dz = this._pos[n * 3 + 2] - hit.z;
            const d = Math.hypot(dx, dy, dz);
            if (d < reach) {
                nodes.push(n);
                weights.push((1 - d / reach) ** 2);
                offsets.push(dx, dy, dz);
            }
        }
        // dragged across the plane facing the camera through the hit
        this._grab = {
            nodes,
            weights,
            offsets,
            point: hit,
            normal: ray.forward,
            target: hit.clone(),
            pointerId: e.pointerId
        };
        this.wake();
        e.stopImmediatePropagation();
        e.preventDefault();
    }

    _onPointerMove(e) {
        const grab = this._grab;
        if (!grab || e.pointerId !== grab.pointerId) {
            return;
        }
        const ray = this._ray(e);
        const denom = ray?.dir.dot(grab.normal) ?? 0;
        if (Math.abs(denom) > 1e-6) {
            const t = v1.sub2(grab.point, ray.origin).dot(grab.normal) / denom;
            grab.target.copy(ray.dir).mulScalar(t).add(ray.origin);

            // no further than the pull limit, which keeps the body inside its culling bounds
            const limit = PULL_LIMIT * this._size;
            const pull = v1.sub2(grab.target, grab.point).length();
            if (pull > limit) {
                grab.target.copy(grab.point).add(v1.mulScalar(limit / pull));
            }
        }
        e.stopImmediatePropagation();
    }

    _onPointerUp(e) {
        if (this._grab && e.pointerId === this._grab.pointerId) {
            this._grab = null;
            e.stopImmediatePropagation();
        }
    }

    _cleanup() {
        window.removeEventListener('pointerdown', this._onPointerDown, true);
        window.removeEventListener('pointermove', this._onPointerMove, true);
        window.removeEventListener('pointerup', this._onPointerUp, true);
        window.removeEventListener('pointercancel', this._onPointerUp, true);
        const gsplat = this.entity.gsplat;
        if (gsplat) {
            gsplat.setWorkBufferModifier(null);
            gsplat.workBufferUpdate = WORKBUFFER_UPDATE_AUTO;
        }
        this._tex?.destroy();
    }
}

export { JellySplat };
