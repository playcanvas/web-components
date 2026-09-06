// Estimate in-place stride speed from the low, planted portion of each foot trajectory.
import fs from 'node:fs';
import { Mat4, Quat, Vec3 } from 'playcanvas';

const buffer = fs.readFileSync(new URL('./motion-source/quaternius-locomotion.glb', import.meta.url));
const length = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + length));
const bin = buffer.subarray(28 + length);
const components = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const read = (index) => {
    const a = gltf.accessors[index],
        v = gltf.bufferViews[a.bufferView];
    return new Float32Array(
        bin.buffer,
        bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
        a.count * components[a.type]
    );
};
const parents = new Map();
gltf.nodes.forEach((node, i) => node.children?.forEach((child) => parents.set(child, i)));
const feet = ['ball_l', 'ball_r'].map((name) => gltf.nodes.findIndex((node) => node.name === name));
const results = [];
for (const name of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop']) {
    const animation = gltf.animations.find((a) => a.name === name);
    const channels = animation.channels.map((c) => ({
        ...c,
        time: read(animation.samplers[c.sampler].input),
        data: read(animation.samplers[c.sampler].output)
    }));
    const duration = Math.max(...channels.map((c) => c.time.at(-1)));
    const samples = [];
    for (let step = 0; step <= 120; step++) {
        const time = (step / 120) * duration;
        const poses = gltf.nodes.map((n) => ({
            translation: n.translation ?? [0, 0, 0],
            rotation: n.rotation ?? [0, 0, 0, 1],
            scale: n.scale ?? [1, 1, 1]
        }));
        for (const c of channels) {
            let i = 0;
            while (i + 1 < c.time.length && c.time[i + 1] <= time) i++;
            const j = Math.min(i + 1, c.time.length - 1),
                t = j === i ? 0 : (time - c.time[i]) / (c.time[j] - c.time[i]);
            const size = c.target.path === 'rotation' ? 4 : 3;
            const a = Array.from(c.data.subarray(i * size, (i + 1) * size)),
                b = Array.from(c.data.subarray(j * size, (j + 1) * size));
            poses[c.target.node][c.target.path] =
                size === 4
                    ? new Quat().slerp(new Quat(...a), new Quat(...b), t).toArray()
                    : a.map((v, k) => v + (b[k] - v) * t);
        }
        const matrices = new Map();
        const world = (index) => {
            if (matrices.has(index)) return matrices.get(index);
            const p = poses[index],
                m = new Mat4().setTRS(new Vec3(...p.translation), new Quat(...p.rotation), new Vec3(...p.scale));
            if (parents.has(index)) m.mul2(world(parents.get(index)), m);
            matrices.set(index, m);
            return m;
        };
        samples.push(feet.map((index) => world(index).transformPoint(Vec3.ZERO).toArray()));
    }
    const speeds = [];
    for (let foot = 0; foot < 2; foot++) {
        const low = Math.min(...samples.map((s) => s[foot][1]));
        for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1][foot],
                b = samples[i][foot],
                dt = duration / 120;
            if (b[1] < low + 0.035 && Math.abs((b[1] - a[1]) / dt) < 0.4 && (b[2] - a[2]) / dt < -0.1)
                speeds.push(-(b[2] - a[2]) / dt);
        }
    }
    speeds.sort((a, b) => a - b);
    results.push({
        name,
        duration,
        plantedSamples: speeds.length,
        strideSpeed: speeds[Math.floor(speeds.length / 2)] ?? null
    });
}
console.log(JSON.stringify(results, null, 2));
