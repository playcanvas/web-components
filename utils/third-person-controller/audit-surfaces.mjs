// Find positive-area overlaps between (near-)coplanar triangles in the delivered GLB.
// Adjacent triangles sharing only an edge are not overlaps. All coordinates are world metres.
import { GraphNode, Vec3 } from 'playcanvas';

import { readGlb } from './glb-io.mjs';

const filename = process.argv[2] ?? 'examples/assets/models/observatory-environment.glb';
const tolerance = Number(process.argv[3] ?? 0.0001);
const { gltf, bin } = await readGlb(filename);
const nodes = gltf.nodes.map((source) => {
    const node = new GraphNode(source.name);
    node.setLocalPosition(...(source.translation ?? [0, 0, 0]));
    node.setLocalRotation(...(source.rotation ?? [0, 0, 0, 1]));
    node.setLocalScale(...(source.scale ?? [1, 1, 1]));
    if (source.matrix) throw new Error('Matrix nodes need decoding');
    return node;
});
gltf.nodes.forEach((source, i) => source.children?.forEach((child) => nodes[i].addChild(nodes[child])));
const root = new GraphNode();
gltf.scenes[gltf.scene ?? 0].nodes.forEach((index) => root.addChild(nodes[index]));
const read = (index) => {
    const a = gltf.accessors[index],
        v = gltf.bufferViews[a.bufferView];
    const size = a.type === 'VEC3' ? 3 : 1;
    const bytes = a.componentType === 5123 ? 2 : 4;
    const method =
        a.componentType === 5126 ? 'readFloatLE' : a.componentType === 5123 ? 'readUInt16LE' : 'readUInt32LE';
    const out = new Float64Array(a.count * size);
    for (let i = 0; i < a.count; i++)
        for (let c = 0; c < size; c++) {
            out[i * size + c] = bin[method](
                (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? size * bytes) + c * bytes
            );
        }
    return out;
};
const groups = new Map(),
    sources = [],
    point = new Vec3();
let triangles = 0;
for (let ni = 0; ni < nodes.length; ni++) {
    const source = gltf.nodes[ni];
    if (source.mesh === undefined) continue;
    const node = nodes[ni],
        matrix = node.getWorldTransform();
    for (const primitive of gltf.meshes[source.mesh].primitives) {
        const positions = read(primitive.attributes.POSITION),
            indices = read(primitive.indices);
        const si = sources.length;
        sources.push({
            node: source.name,
            material: gltf.materials[primitive.material]?.name,
            doubleSided: gltf.materials[primitive.material]?.doubleSided ?? false
        });
        for (let i = 0; i < positions.length; i += 3) {
            point.set(positions[i], positions[i + 1], positions[i + 2]);
            matrix.transformPoint(point, point);
            positions.set([point.x, point.y, point.z], i);
        }
        for (let i = 0; i < indices.length; i += 3) {
            triangles++;
            const p = Array.from(indices.subarray(i, i + 3), (index) =>
                Array.from(positions.subarray(index * 3, index * 3 + 3))
            );
            const u = p[1].map((v, c) => v - p[0][c]),
                v = p[2].map((v, c) => v - p[0][c]);
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const length = Math.hypot(...n);
            if (length < 1e-10) continue;
            n = n.map((x) => x / length);
            const axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
            const facing = Math.sign(n[axis]);
            n = n.map((x) => x * facing);
            const d = n.reduce((s, v, c) => s + v * p[0][c], 0);
            const axes = [0, 1, 2].filter((c) => c !== axis);
            const q = p.map((p) => axes.map((c) => p[c]));
            const bounds = [
                Math.min(...q.map((p) => p[0])),
                Math.min(...q.map((p) => p[1])),
                Math.max(...q.map((p) => p[0])),
                Math.max(...q.map((p) => p[1]))
            ];
            const triangle = { p, q, n, d, bounds, si, facing, area: length / 2, index: i / 3 };
            const key = n.map((v) => Math.round(v * 10000)).join(',');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(triangle);
        }
    }
}
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const intersectionArea = (a, b) => {
    let polygon = a;
    const sign = Math.sign(cross(b[0], b[1], b[2]));
    for (let i = 0; i < 3 && polygon.length; i++) {
        const start = b[i],
            end = b[(i + 1) % 3],
            clipped = [];
        for (let j = 0; j < polygon.length; j++) {
            const p = polygon[j],
                q = polygon[(j + 1) % polygon.length];
            const dp = sign * cross(start, end, p),
                dq = sign * cross(start, end, q);
            if (dp >= 0) clipped.push(p);
            if (dp >= 0 !== dq >= 0) {
                const t = dp / (dp - dq);
                clipped.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
            }
        }
        polygon = clipped;
    }
    return (
        Math.abs(
            polygon.reduce((s, p, i) => {
                const q = polygon[(i + 1) % polygon.length];
                return s + p[0] * q[1] - p[1] * q[0];
            }, 0)
        ) / 2
    );
};
const pairs = new Map();
let checks = 0,
    overlaps = 0;
const compare = (a, b) => {
    if (
        a.bounds[0] >= b.bounds[2] ||
        b.bounds[0] >= a.bounds[2] ||
        a.bounds[1] >= b.bounds[3] ||
        b.bounds[1] >= a.bounds[3]
    )
        return;
    if (Math.abs(a.d - b.d) > tolerance || a.n.reduce((s, v, c) => s + v * b.n[c], 0) < 0.999999999) return;
    checks++;
    const offset = Math.max(...b.p.map((p) => Math.abs(a.n.reduce((s, v, c) => s + v * p[c], 0) - a.d)));
    if (offset > tolerance) return;
    const area = intersectionArea(a.q, b.q);
    if (area < Math.max(1e-8, Math.min(a.area, b.area) * 1e-5)) return;
    overlaps++;
    const sameFacing = a.facing === b.facing;
    const key = `${Math.min(a.si, b.si)}:${Math.max(a.si, b.si)}:${sameFacing}`;
    if (!pairs.has(key))
        pairs.set(key, {
            a: sources[a.si],
            b: sources[b.si],
            sameFacing,
            count: 0,
            projectedArea: 0,
            maxOffset: 0,
            examples: []
        });
    const pair = pairs.get(key);
    pair.count++;
    pair.projectedArea += area;
    pair.maxOffset = Math.max(pair.maxOffset, offset);
    if (pair.examples.length < 5)
        pair.examples.push({
            center: a.p[0].map((_, c) => Number((a.p.reduce((s, p) => s + p[c], 0) / 3).toFixed(5))),
            normal: a.n.map((v) => Number((v * a.facing).toFixed(5))),
            verticesA: a.p,
            verticesB: b.p,
            triangleA: a.index,
            triangleB: b.index,
            area,
            offset
        });
};
for (const group of groups.values()) {
    if (group.length < 20) {
        for (let i = 0; i < group.length; i++) for (let j = 0; j < i; j++) compare(group[i], group[j]);
    } else {
        const cells = new Map();
        for (const tri of group) {
            const plane = Math.floor(tri.d / Math.max(tolerance * 2, 0.001));
            const seen = new Set();
            for (let x = Math.floor(tri.bounds[0] / 2); x <= Math.floor(tri.bounds[2] / 2); x++)
                for (let y = Math.floor(tri.bounds[1] / 2); y <= Math.floor(tri.bounds[3] / 2); y++) {
                    for (let z = plane - 1; z <= plane + 1; z++) {
                        for (const other of cells.get(`${x},${y},${z}`) ?? [])
                            if (!seen.has(other)) {
                                seen.add(other);
                                compare(tri, other);
                            }
                    }
                    const key = `${x},${y},${plane}`;
                    if (!cells.has(key)) cells.set(key, []);
                    cells.get(key).push(tri);
                }
        }
    }
}
console.log(
    JSON.stringify(
        {
            filename,
            tolerance,
            triangles,
            checks,
            overlaps,
            pairs: [...pairs.values()].sort((a, b) => b.projectedArea - a.projectedArea)
        },
        null,
        2
    )
);

// Opposing caps at closed-solid joints are reported for inspection but are not
// competing exterior surfaces. Fail the regression check on same-facing overlap.
if (process.argv.includes('--check') && [...pairs.values()].some((pair) => pair.sameFacing)) process.exitCode = 1;
