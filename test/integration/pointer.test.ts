import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';


/** A graph node stand-in. The pick only reads `name` and walks `parent`. */
type Node = { name: string, parent: Node | null };

const node = (name: string, parent: Node | null = null): Node => ({ name, parent });

/**
 * Builds a selection entry. `_pickNode` branches on `instanceof MeshInstance`, so a plain object
 * always takes the gsplat branch and is read through `entity` - which is all this needs.
 *
 * @param target - The node the pick should report.
 * @returns The selection entry.
 */
const hit = (target: Node) => ({ entity: target });

/**
 * Creates a promise plus its resolver, for driving two picks to completion out of order.
 *
 * @returns The promise and its resolve function.
 */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

/**
 * Swaps in a picker whose read back this test controls, and records which of the two read-back
 * APIs the element reached for.
 *
 * The null device renders nothing, so a real Picker can only ever return an empty selection. The
 * substitution keeps the assertions on the element's own logic - the hierarchy walk, the
 * enter/leave bookkeeping and the ordering guard - rather than on the GPU.
 *
 * @param appElement - The booted pc-app.
 * @param queue - Selections to hand out, one per call. A deferred entry is resolved by the test.
 * @returns The per-API call counts.
 */
const stubPicker = (appElement: AppElement, queue: (ReturnType<typeof hit>[] | Promise<ReturnType<typeof hit>[]>)[]) => {
    const calls = { sync: 0, async: 0 };

    (appElement as unknown as { _picker: unknown })._picker = {
        prepare: () => {},
        getSelection: () => {
            calls.sync++;
            return [];
        },
        getSelectionAsync: () => {
            calls.async++;
            return Promise.resolve(queue.shift() ?? []);
        }
    };

    return calls;
};

/**
 * Yields to the task queue so an awaited pick can run to completion.
 *
 * @returns A promise that settles once queued work has run.
 */
const flush = () => new Promise((resolve) => {
    setTimeout(resolve, 0);
});

describe('pc-app pointer picking', () => {
    useGuard();

    /**
     * Boots one pc-entity with pointer listeners attached, which is also what makes pc-app attach
     * its canvas handlers - they are wired lazily, on the first listener of each type.
     *
     * The camera is not decoration: the pick resolves one from the scene and gives up before
     * reading anything back if there is none.
     *
     * @param name - The entity name, matched against the picked node's name.
     * @returns The booted handle plus the canvas and a spy per pointer type.
     */
    const bootTarget = async (name = 'target') => {
        const handle = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="${name}"></pc-entity>
        `);
        const element = handle.get<EntityElement>(`pc-entity[name="${name}"]`);

        const spies = {
            pointerenter: vi.fn(),
            pointerleave: vi.fn(),
            pointerdown: vi.fn(),
            pointerup: vi.fn()
        };
        Object.entries(spies).forEach(([type, spy]) => element.addEventListener(type, spy));

        const canvas = handle.appElement.querySelector('canvas');
        if (!canvas) throw new Error('bootTarget: pc-app created no canvas');

        return { ...handle, element, spies, canvas };
    };

    const move = (x: number, y: number) => new PointerEvent('pointermove', { clientX: x, clientY: y });

    it('dispatches pointerenter when a pick lands on the entity', async () => {
        const { appElement, canvas, spies } = await bootTarget();
        stubPicker(appElement, [[hit(node('target'))]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
        expect(spies.pointerleave).not.toHaveBeenCalled();
    });

    it('reads back asynchronously, because getSelection is unsupported on WebGPU', async () => {
        // The synchronous Picker.getSelection returns an empty selection on WebGPU rather than
        // failing, which silently disabled every onpointer* handler once WebGPU became the
        // resolved backend. Reaching for it again would reintroduce that, invisibly on WebGL2.
        const { appElement, canvas } = await bootTarget();
        const calls = stubPicker(appElement, [[hit(node('target'))]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(calls.async, 'the pick must use getSelectionAsync').toBe(1);
        expect(calls.sync, 'getSelection returns nothing on WebGPU').toBe(0);
    });

    it('walks up to the nearest ancestor that has a pc-entity', async () => {
        // A picked GLB gives back its own internal nodes - Object_8 and friends - never the name
        // on the pc-entity, so the walk is what makes a model pickable at all.
        const { appElement, canvas, spies } = await bootTarget();
        const inner = node('Object_8', node('GLTF_SceneRootNode', node('target')));
        stubPicker(appElement, [[hit(inner)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
    });

    it('dispatches pointerleave once the pointer moves off the entity', async () => {
        const { appElement, canvas, spies } = await bootTarget();
        stubPicker(appElement, [[hit(node('target'))], []]);

        canvas.dispatchEvent(move(400, 300));
        await flush();
        canvas.dispatchEvent(move(10, 10));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
        expect(spies.pointerleave).toHaveBeenCalledTimes(1);
    });

    it('discards a hover pick that resolves after a newer one', async () => {
        // Moves arrive faster than a pick resolves, so results can land out of order. Applying a
        // stale one would flap the hover state against a pointer position already left behind.
        const { appElement, canvas, spies } = await bootTarget();
        const stale = deferred<ReturnType<typeof hit>[]>();
        const fresh = deferred<ReturnType<typeof hit>[]>();
        stubPicker(appElement, [stale.promise, fresh.promise]);

        canvas.dispatchEvent(move(10, 10));   // pick 1, resolved last
        canvas.dispatchEvent(move(400, 300)); // pick 2, resolved first

        fresh.resolve([hit(node('target'))]);
        await flush();
        expect(spies.pointerenter, 'the newest pick applies').toHaveBeenCalledTimes(1);

        stale.resolve([]);
        await flush();

        expect(spies.pointerleave, 'the stale empty pick must not clear the hover').not.toHaveBeenCalled();
        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
    });

    it('ignores a pick that resolves after the element has disconnected', async () => {
        const { appElement, canvas, spies, unmount } = await bootTarget();
        const pending = deferred<ReturnType<typeof hit>[]>();
        stubPicker(appElement, [pending.promise]);

        canvas.dispatchEvent(move(400, 300));
        unmount();
        pending.resolve([hit(node('target'))]);
        await flush();

        expect(spies.pointerenter).not.toHaveBeenCalled();
    });

    it('dispatches pointerdown and pointerup on the picked entity', async () => {
        const { appElement, canvas, spies } = await bootTarget();
        stubPicker(appElement, [[hit(node('target'))], [hit(node('target'))]]);

        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }));
        await flush();
        canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300 }));
        await flush();

        expect(spies.pointerdown).toHaveBeenCalledTimes(1);
        expect(spies.pointerup).toHaveBeenCalledTimes(1);
    });
});
