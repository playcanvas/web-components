import type { Entity, RenderTarget } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { CameraComponentElement } from '../../src/components/camera-component';
import type { EntityElement } from '../../src/entity';
import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * A stand-in for a node inside a model's instantiated hierarchy. Element resolution matches
 * nodes against the entity map by object identity and follows `parent`, so a plain object is
 * never matched itself - the chain has to terminate at a real entity (or null) to resolve.
 */
type ModelNode = { name: string; parent: ModelNode | Entity | null };

const modelNode = (name: string, parent: ModelNode | Entity | null = null): ModelNode => ({ name, parent });

/**
 * Builds a selection entry. `_pickNode` branches on `instanceof MeshInstance`, so a plain object
 * always takes the gsplat branch and is read through `entity` - which is all this needs.
 *
 * @param target - The node the pick should report.
 * @returns The selection entry.
 */
const hit = (target: ModelNode | Entity) => ({ entity: target });

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
 * APIs the element reached for - and which camera each pick was prepared with.
 *
 * The null device renders nothing, so a real Picker can only ever return an empty selection. The
 * substitution keeps the assertions on the element's own logic - the camera resolution, the
 * element resolution, the enter/leave bookkeeping and the ordering guard - rather than on the GPU.
 *
 * @param appElement - The booted pc-app.
 * @param queue - Selections to hand out, one per call. A deferred entry is resolved by the test.
 * @returns The per-API call counts and the cameras passed to prepare, in call order.
 */
const stubPicker = (
    appElement: AppElement,
    queue: (ReturnType<typeof hit>[] | Promise<ReturnType<typeof hit>[]>)[]
) => {
    const calls = { sync: 0, async: 0, cameras: [] as unknown[] };

    (appElement as unknown as { _picker: unknown })._picker = {
        prepare: (camera: unknown) => {
            calls.cameras.push(camera);
        },
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
const flush = () =>
    new Promise((resolve) => {
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
     * @param name - The entity name.
     * @returns The booted handle plus the element, its entity, the canvas and a spy per pointer
     * type.
     */
    const bootTarget = async (name = 'target') => {
        const handle = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="${name}"></pc-entity>
        `);
        const element = handle.get<EntityElement>(`pc-entity[name="${name}"]`);
        const entity = element.entity;
        if (!entity) throw new Error('bootTarget: the target entity was not created');

        const spies = {
            pointerenter: vi.fn(),
            pointerleave: vi.fn(),
            pointerdown: vi.fn(),
            pointerup: vi.fn()
        };
        Object.entries(spies).forEach(([type, spy]) => element.addEventListener(type, spy));

        const canvas = handle.appElement.querySelector('canvas');
        if (!canvas) throw new Error('bootTarget: pc-app created no canvas');

        return { ...handle, element, entity, spies, canvas };
    };

    const move = (x: number, y: number) => new PointerEvent('pointermove', { clientX: x, clientY: y });

    it('dispatches pointerenter when a pick lands on the entity', async () => {
        const { appElement, canvas, entity, spies } = await bootTarget();
        stubPicker(appElement, [[hit(entity)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
        expect(spies.pointerleave).not.toHaveBeenCalled();
    });

    it('reads back asynchronously, because getSelection is unsupported on WebGPU', async () => {
        // The synchronous Picker.getSelection returns an empty selection on WebGPU rather than
        // failing, which silently disabled every onpointer* handler once WebGPU became the
        // resolved backend. Reaching for it again would reintroduce that, invisibly on WebGL2.
        const { appElement, canvas, entity } = await bootTarget();
        const calls = stubPicker(appElement, [[hit(entity)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(calls.async, 'the pick must use getSelectionAsync').toBe(1);
        expect(calls.sync, 'getSelection returns nothing on WebGPU').toBe(0);
    });

    it('walks up to the nearest ancestor that has a pc-entity', async () => {
        // A picked GLB gives back its own internal nodes - Object_8 and friends - which no
        // element created, so the walk to the model's host entity is what makes a model pickable
        // at all.
        const { appElement, canvas, entity, spies } = await bootTarget();
        const inner = modelNode('Object_8', modelNode('GLTF_SceneRootNode', entity));
        stubPicker(appElement, [[hit(inner)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
    });

    it('dispatches pointerleave once the pointer moves off the entity', async () => {
        const { appElement, canvas, entity, spies } = await bootTarget();
        stubPicker(appElement, [[hit(entity)], []]);

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
        const { appElement, canvas, entity, spies } = await bootTarget();
        const stale = deferred<ReturnType<typeof hit>[]>();
        const fresh = deferred<ReturnType<typeof hit>[]>();
        stubPicker(appElement, [stale.promise, fresh.promise]);

        canvas.dispatchEvent(move(10, 10)); // pick 1, resolved last
        canvas.dispatchEvent(move(400, 300)); // pick 2, resolved first

        fresh.resolve([hit(entity)]);
        await flush();
        expect(spies.pointerenter, 'the newest pick applies').toHaveBeenCalledTimes(1);

        stale.resolve([]);
        await flush();

        expect(spies.pointerleave, 'the stale empty pick must not clear the hover').not.toHaveBeenCalled();
        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
    });

    it('ignores a pick that resolves after the element has disconnected', async () => {
        const { appElement, canvas, entity, spies, unmount } = await bootTarget();
        const pending = deferred<ReturnType<typeof hit>[]>();
        stubPicker(appElement, [pending.promise]);

        canvas.dispatchEvent(move(400, 300));
        unmount();
        pending.resolve([hit(entity)]);
        await flush();

        expect(spies.pointerenter).not.toHaveBeenCalled();
    });

    it('dispatches pointerdown and pointerup on the picked entity', async () => {
        const { appElement, canvas, entity, spies } = await bootTarget();
        stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }));
        await flush();
        canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300 }));
        await flush();

        expect(spies.pointerdown).toHaveBeenCalledTimes(1);
        expect(spies.pointerup).toHaveBeenCalledTimes(1);
    });

    it('dispatches pointerup on a listening ancestor of the picked node', async () => {
        // A pointerup on a model's internal node used to be dropped: unlike down and move, up
        // never walked the parent chain, so only a pick that returned the entity itself could
        // reach a listener (#337).
        const { appElement, canvas, entity, spies } = await bootTarget();
        stubPicker(appElement, [[hit(modelNode('Object_8', entity))]]);

        canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300 }));
        await flush();

        expect(spies.pointerup).toHaveBeenCalledTimes(1);
    });

    it('dispatches pointerdown on the nearest ancestor element with a listener', async () => {
        // A hit on an element without a pointerdown listener keeps walking to a listening
        // ancestor element rather than stopping at the first element found.
        const { appElement, all } = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="parent"><pc-entity name="child"></pc-entity></pc-entity>
        `);
        const parent = all<EntityElement>('pc-entity')[1];
        const child = all<EntityElement>('pc-entity')[2];
        const spy = vi.fn();
        parent.addEventListener('pointerdown', spy);
        const canvas = appElement.querySelector('canvas');
        if (!canvas) throw new Error('pc-app created no canvas');
        stubPicker(appElement, [[hit(child.entity!)]]);

        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }));
        await flush();

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('routes events to the element that owns the picked entity when names collide', async () => {
        // Elements may share a name. The old name-based join resolved every hit to the first
        // matching element in document order; identity keys cannot collide.
        const { appElement, all } = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="dup"></pc-entity>
            <pc-entity name="dup"></pc-entity>
        `);
        const first = all<EntityElement>('pc-entity')[1];
        const second = all<EntityElement>('pc-entity')[2];
        const firstSpy = vi.fn();
        const secondSpy = vi.fn();
        first.addEventListener('pointerenter', firstSpy);
        second.addEventListener('pointerenter', secondSpy);
        const canvas = appElement.querySelector('canvas');
        if (!canvas) throw new Error('pc-app created no canvas');
        stubPicker(appElement, [[hit(second.entity!)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(secondSpy).toHaveBeenCalledTimes(1);
        expect(firstSpy, 'the hit belongs to the second element, not the first with that name').not.toHaveBeenCalled();
    });

    it('picks an entity whose name contains a double quote', async () => {
        // The old join interpolated the entity name into a CSS selector, so a quote threw a
        // SyntaxError from inside the pointer handler. Identity lookup has no parse step.
        const { appElement, get } = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name='say "hi"'></pc-entity>
        `);
        const element = get<EntityElement>('pc-entity:not([name="camera"])');
        const spy = vi.fn();
        element.addEventListener('pointerenter', spy);
        const canvas = appElement.querySelector('canvas');
        if (!canvas) throw new Error('pc-app created no canvas');
        stubPicker(appElement, [[hit(element.entity!)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('picks an entity that has no name attribute', async () => {
        // A nameless entity was unpickable: the old join queried pc-entity[name="Untitled"],
        // which matches no element when the attribute is absent.
        const { appElement, get } = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity></pc-entity>
        `);
        const element = get<EntityElement>('pc-entity:not([name])');
        const spy = vi.fn();
        element.addEventListener('pointerenter', spy);
        const canvas = appElement.querySelector('canvas');
        if (!canvas) throw new Error('pc-app created no canvas');
        stubPicker(appElement, [[hit(element.entity!)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spy).toHaveBeenCalledTimes(1);
    });

    describe('multi-camera', () => {
        /**
         * Boots two cameras and a listening target. jsdom gives the canvas no CSS box, so unless
         * a test installs geometry via {@link giveCanvasBox}, viewport containment is bypassed
         * and camera resolution is driven purely by priority order and fall-through.
         *
         * @param a - Attributes for the first camera, in document order.
         * @param b - Attributes for the second camera.
         * @returns The booted handle plus both camera components, the target's spy and the canvas.
         */
        const bootCameraPair = async (a: string, b: string) => {
            const handle = await bootApp(`
                <pc-entity name="camA"><pc-camera ${a}></pc-camera></pc-entity>
                <pc-entity name="camB"><pc-camera ${b}></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const cameraA = handle.get<CameraComponentElement>('pc-entity[name="camA"] pc-camera').component;
            const cameraB = handle.get<CameraComponentElement>('pc-entity[name="camB"] pc-camera').component;
            const target = handle.get<EntityElement>('pc-entity[name="target"]');
            const enter = vi.fn();
            target.addEventListener('pointerenter', enter);

            const canvas = handle.appElement.querySelector('canvas');
            if (!canvas) throw new Error('bootCameraPair: pc-app created no canvas');

            return { ...handle, cameraA, cameraB, target, enter, canvas };
        };

        /**
         * Gives the canvas the CSS box and drawing-buffer size jsdom never lays out, so
         * client coordinates map 1:1 into an 800x600 buffer and viewport containment applies.
         *
         * @param canvas - The canvas to size.
         */
        const giveCanvasBox = (canvas: HTMLCanvasElement) => {
            canvas.width = 800;
            canvas.height = 600;
            vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
                left: 0,
                top: 0,
                right: 800,
                bottom: 600,
                width: 800,
                height: 600,
                x: 0,
                y: 0,
                toJSON: () => ({})
            } as DOMRect);
        };

        it('picks with the highest-priority camera, not the first in the document', async () => {
            // The old resolution was findComponent('camera') - whichever camera a depth-first
            // walk of the scene found first, regardless of what renders on top.
            const { appElement, cameraB, target, enter, canvas } = await bootCameraPair('priority="0"', 'priority="1"');
            const calls = stubPicker(appElement, [[hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(calls.cameras).toEqual([cameraB]);
            expect(enter).toHaveBeenCalledTimes(1);
        });

        it('orders cameras by priority, not by how recently they enabled', async () => {
            const { appElement, cameraA, target, enter, canvas } = await bootCameraPair('priority="1"', 'priority="0"');
            const calls = stubPicker(appElement, [[hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(calls.cameras).toEqual([cameraA]);
            expect(enter).toHaveBeenCalledTimes(1);
        });

        it('falls through an overlay camera that picked nothing', async () => {
            // An overlay camera leaves the color buffer alone, so wherever it drew nothing the
            // cameras beneath show through - and should receive the pick.
            const { appElement, cameraA, cameraB, target, enter, canvas } = await bootCameraPair(
                'priority="0"',
                'priority="1" clear-color-buffer="false"'
            );
            const calls = stubPicker(appElement, [[], [hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(calls.cameras).toEqual([cameraB, cameraA]);
            expect(enter).toHaveBeenCalledTimes(1);
        });

        it('ends the search at an opaque camera that picked nothing', async () => {
            // A camera that clears the color buffer paints its background over everything
            // beneath it, so entities under an opaque viewport are not visible - and must not
            // receive events.
            const { appElement, cameraB, target, enter, canvas } = await bootCameraPair('priority="0"', 'priority="1"');
            const calls = stubPicker(appElement, [[], [hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(calls.cameras).toEqual([cameraB]);
            expect(enter).not.toHaveBeenCalled();
        });

        it('routes the pick to the camera whose viewport contains the pointer', async () => {
            // Split screen: two same-priority cameras side by side. The pointer's position, not
            // camera order, decides which viewport owns the pick.
            const { appElement, cameraA, cameraB, target, canvas } = await bootCameraPair(
                'rect="0 0 0.5 1"',
                'rect="0.5 0 0.5 1"'
            );
            giveCanvasBox(canvas);
            const calls = stubPicker(appElement, [[hit(target.entity!)], [hit(target.entity!)]]);

            canvas.dispatchEvent(move(600, 300)); // right half
            await flush();
            canvas.dispatchEvent(move(200, 300)); // left half
            await flush();

            expect(calls.cameras).toEqual([cameraB, cameraA]);
        });

        it("flips the viewport test to match rect's bottom-left origin", async () => {
            // rect="0 0.5 1 0.5" starts halfway up from the BOTTOM of the canvas, so it is the
            // top half of the screen - the y axis of client coordinates runs the other way.
            const { appElement, cameraA, cameraB, target, canvas } = await bootCameraPair(
                'priority="0"',
                'priority="1" rect="0 0.5 1 0.5"'
            );
            giveCanvasBox(canvas);
            const calls = stubPicker(appElement, [[hit(target.entity!)], [hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 150)); // top half: inside camB's viewport
            await flush();
            canvas.dispatchEvent(move(400, 450)); // bottom half: outside it
            await flush();

            expect(calls.cameras).toEqual([cameraB, cameraA]);
        });

        it('skips a camera that renders to a texture', async () => {
            const { appElement, cameraA, cameraB, target, enter, canvas } = await bootCameraPair(
                'priority="0"',
                'priority="1"'
            );
            cameraB.renderTarget = {} as RenderTarget;
            const calls = stubPicker(appElement, [[hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(calls.cameras).toEqual([cameraA]);
            expect(enter).toHaveBeenCalledTimes(1);
        });
    });
});
