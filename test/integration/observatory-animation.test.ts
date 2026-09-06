import type { Entity } from 'playcanvas';
import { expect, it } from 'vitest';

import example from '../../examples/third-person-controller.html?raw';
import type { AnimComponentElement } from '../../src/components/anim-component';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

useGuard();

// Exercise the example's actual markup against a tiny animated model. A monotonic
// takeoff trajectory makes a restarted outgoing clip visible as backward motion.
const setup = async () => {
    const clips = [
        { name: 'Idle', duration: 1, heights: [0, 0.1, 0] },
        { name: 'Walk', duration: 1, heights: [0, 0.4, 0] },
        { name: 'Run', duration: 1, heights: [0, 0.6, 0] },
        { name: 'JumpStart', duration: 11 / 30, heights: [0, 1] },
        { name: 'FallLoop', duration: 1, heights: [1, 1.1, 1] },
        { name: 'Land', duration: 0.3, heights: [1, 0] }
    ];
    const values: number[] = [];
    const views: object[] = [];
    const accessors: object[] = [];
    const append = (data: number[], components: number) => {
        views.push({ buffer: 0, byteOffset: values.length * 4, byteLength: data.length * 4 });
        values.push(...data);
        accessors.push({
            bufferView: views.length - 1,
            componentType: 5126,
            count: data.length / components,
            type: components === 1 ? 'SCALAR' : 'VEC3',
            ...(components === 1 ? { min: [0], max: [data.at(-1)] } : {})
        });
        return accessors.length - 1;
    };
    const animations = clips.map(({ name, duration, heights }) => ({
        name,
        channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
        samplers: [
            {
                input: append(
                    heights.map((_, i) => (duration * i) / (heights.length - 1)),
                    1
                ),
                output: append(
                    heights.flatMap((y) => [0, y, 0]),
                    3
                )
            }
        ]
    }));
    const bytes = new Uint8Array(new Float32Array(values).buffer);
    const src = `data:application/json,${encodeURIComponent(
        JSON.stringify({
            asset: { version: '2.0' },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: 'joint' }],
            animations,
            accessors,
            bufferViews: views,
            buffers: [
                {
                    byteLength: bytes.length,
                    uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bytes))}`
                }
            ]
        })
    )}`;
    const markup = example.match(/<pc-anim id="explorer-animation"[\s\S]*?<\/pc-anim>/)![0];
    const { app, get } = await bootApp(`
        <pc-asset id="character" type="container" src="${src}"></pc-asset>
        <pc-model asset="character">${markup}</pc-model>
    `);
    const anim = get<AnimComponentElement>('#explorer-animation');
    const joint = app.root.findByName('joint') as Entity;
    const step = (duration: number) => {
        for (let time = 0; time < duration - 1e-8; time += 1 / 120) anim.component!.update(1 / 120);
        return joint.getLocalPosition().y;
    };
    return { anim, joint, step };
};

it('takeoff does not restart while blending into the airborne pose', async () => {
    const { anim, joint, step } = await setup();
    anim.transition('JumpStart');
    step(0.28);
    anim.transition('FallLoop');
    let previous = joint.getLocalPosition().y;
    for (let i = 0; i < 20; i++) {
        const height = step(1 / 120);
        expect(height, 'takeoff restarted during the blend').toBeGreaterThanOrEqual(previous - 1e-6);
        previous = height;
    }
    expect(anim.component!.baseLayer!.activeState).toBe('FallLoop');
    expect(joint.getLocalPosition().y).toBeGreaterThanOrEqual(1);
});

it('landing holds its final pose after the clip ends', async () => {
    const { anim, step } = await setup();
    anim.transition('Land', 0.06);
    step(0.4);
    for (let i = 0; i < 60; i++) expect(Math.abs(step(1 / 120)), 'landing replayed').toBeLessThan(1e-6);
});

it.each(['Idle', 'Walk', 'Run', 'FallLoop'])('%s keeps animating across its loop boundary', async (name) => {
    const { anim, step } = await setup();
    anim.transition(name);
    const first = step(1.1);
    const second = step(0.2);
    expect(anim.component!.baseLayer!.activeStateProgress).toBeGreaterThan(1);
    expect(Math.abs(second - first)).toBeGreaterThan(0.01);
});
