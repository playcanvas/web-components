import type { Entity, RenderTarget } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { CameraComponentElement } from '../../src/components/camera-component';
import type { EntityElement } from '../../src/entity';
import { bootApp, settle } from '../helpers/app';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

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

    (appElement as unknown as { _pointer: { _picker: unknown } })._pointer._picker = {
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

/**
 * The smallest valid glTF - no meshes, one named node - for the tests that need a real model
 * host between a picked content node and a listening wrapper. Loads from a data: URI, so no I/O.
 */
const CONTAINER_SRC = `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'content-root' }]
}))}`;

describe('pc-app pointer picking', () => {
    const { errors } = useGuard();

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
        // element created, so the walk up the parent chain is what makes a model pickable at all.
        const { appElement, canvas, entity, spies } = await bootTarget();
        const inner = modelNode('Object_8', modelNode('GLTF_SceneRootNode', entity));
        stubPicker(appElement, [[hit(inner)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(spies.pointerenter).toHaveBeenCalledTimes(1);
    });

    it('hover walks past a registered element with no hover listeners', async () => {
        // Hover resolution is listener-aware, like down/up: a registered but silent element (a
        // pc-model host, a plain child entity) is transparent, so crossing between its geometry
        // and the listening ancestor's produces no spurious leave/enter pair on the ancestor.
        const handle = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="outer"><pc-entity name="silent"></pc-entity></pc-entity>
        `);
        const outer = handle.get<EntityElement>('pc-entity[name="outer"]');
        const silent = handle.get<EntityElement>('pc-entity[name="silent"]');
        const spies = { pointerenter: vi.fn(), pointerleave: vi.fn() };
        Object.entries(spies).forEach(([type, spy]) => outer.addEventListener(type, spy));
        const canvas = handle.appElement.querySelector('canvas')!;

        stubPicker(handle.appElement, [[hit(silent.entity!)], [hit(outer.entity!)], []]);

        canvas.dispatchEvent(move(400, 300));
        await flush();
        expect(spies.pointerenter, 'the hit on the silent child resolves to the listener').toHaveBeenCalledTimes(1);

        canvas.dispatchEvent(move(410, 300));
        await flush();
        expect(spies.pointerleave, 'moving to the ancestor itself is not a crossing').not.toHaveBeenCalled();
        expect(spies.pointerenter).toHaveBeenCalledTimes(1);

        canvas.dispatchEvent(move(10, 10));
        await flush();
        expect(spies.pointerleave, 'leaving the subtree fires exactly one leave').toHaveBeenCalledTimes(1);
    });

    it('resolves a hit inside a model through the silent host to the listening wrapper', async () => {
        // The tweening-example shape: hover handlers on a wrapper entity around a bare pc-model.
        // The model's registered host entity sits between the content and the wrapper, and must
        // not swallow the wrapper's hover - unless the model itself listens, in which case it is
        // the nearer owner.
        const handle = await bootApp(`
            <pc-asset id="m" type="container" src="${CONTAINER_SRC}"></pc-asset>
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="wrapper"><pc-model asset="m"></pc-model></pc-entity>
        `);
        const wrapper = handle.get<EntityElement>('pc-entity[name="wrapper"]');
        const model = handle.get('pc-model');
        const wrapperEnter = vi.fn();
        wrapper.addEventListener('pointerenter', wrapperEnter);
        const canvas = handle.appElement.querySelector('canvas')!;

        stubPicker(handle.appElement, [[hit(model.contentEntity!)], [], [hit(model.contentEntity!)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();
        expect(wrapperEnter, 'the silent host is transparent to hover').toHaveBeenCalledTimes(1);

        canvas.dispatchEvent(move(10, 10));
        await flush();

        const modelEnter = vi.fn();
        model.addEventListener('pointerenter', modelEnter);
        canvas.dispatchEvent(move(400, 300));
        await flush();
        expect(modelEnter, 'a listening model is the nearer hover owner').toHaveBeenCalledTimes(1);
        expect(wrapperEnter).toHaveBeenCalledTimes(1);
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

    it('keeps a shared canvas listener while another event type still needs it', async () => {
        // enter, leave and move all ride one canvas pointermove listener. Removing the tree's
        // last pointerenter listener used to detach that shared listener even though a
        // pointermove listener still needed it - the detach must recount by canvas listener,
        // not by event type.
        const { appElement, canvas, element, entity, spies } = await bootTarget();
        const moveSpy = vi.fn();
        element.addEventListener('pointermove', moveSpy);
        element.removeEventListener('pointerenter', spies.pointerenter);
        stubPicker(appElement, [[hit(entity)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();

        expect(moveSpy, 'the move listener still rides the shared canvas listener').toHaveBeenCalledTimes(1);
    });

    describe('click', () => {
        /**
         * Boots a camera plus one target entity with click, pointerdown and pointerup spies -
         * the three events a press/release sequence can produce.
         *
         * @returns The booted handle plus the element, its entity, the canvas and the spies.
         */
        const bootClickTarget = async () => {
            const handle = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const element = handle.get<EntityElement>('pc-entity[name="target"]');
            const spies = { click: vi.fn(), pointerdown: vi.fn(), pointerup: vi.fn() };
            Object.entries(spies).forEach(([type, spy]) => element.addEventListener(type, spy));

            const canvas = handle.appElement.querySelector('canvas');
            if (!canvas) throw new Error('bootClickTarget: pc-app created no canvas');

            return { ...handle, element, entity: element.entity!, spies, canvas };
        };

        const down = (options: PointerEventInit = {}) =>
            new PointerEvent('pointerdown', { clientX: 400, clientY: 300, ...options });
        const up = (options: PointerEventInit = {}) =>
            new PointerEvent('pointerup', { clientX: 400, clientY: 300, ...options });

        it('dispatches click after pointerup when the press and release pick the same entity', async () => {
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(up());
            await flush();

            expect(spies.click).toHaveBeenCalledTimes(1);
            expect(spies.click.mock.invocationCallOrder[0], 'click concludes the release')
                .toBeGreaterThan(spies.pointerup.mock.invocationCallOrder[0]);
            const event = spies.click.mock.calls[0][0] as PointerEvent;
            expect(event.type).toBe('click');
            expect(event.clientX, 'the release event supplies the click detail').toBe(400);
        });

        it('synthesizes click for an element whose only listener is click', async () => {
            // click alone must attach the pointerdown/pointerup canvas listeners it rides on.
            const { appElement, get } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const element = get<EntityElement>('pc-entity[name="target"]');
            const spy = vi.fn();
            element.addEventListener('click', spy);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(element.entity!)], [hit(element.entity!)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(up());
            await flush();

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('does not dispatch click when the press and release pick different entities', async () => {
            const { appElement, all } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="a"></pc-entity>
                <pc-entity name="b"></pc-entity>
            `);
            const [a, b] = [all<EntityElement>('pc-entity')[1], all<EntityElement>('pc-entity')[2]];
            const aClick = vi.fn();
            const bClick = vi.fn();
            a.addEventListener('click', aClick);
            b.addEventListener('click', bClick);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(a.entity!)], [hit(b.entity!)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(up());
            await flush();

            expect(aClick, 'the press target alone gets no click').not.toHaveBeenCalled();
            expect(bClick, 'the release target alone gets no click').not.toHaveBeenCalled();
        });

        it('dispatches click on the nearest common ancestor of the press and release picks', async () => {
            // The DOM assigns a click whose down and up have different targets to their nearest
            // common inclusive ancestor - a press on one child released over its sibling clicks
            // the parent.
            const { appElement, get } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="parent">
                    <pc-entity name="a"></pc-entity>
                    <pc-entity name="b"></pc-entity>
                </pc-entity>
            `);
            const parent = get<EntityElement>('pc-entity[name="parent"]');
            const a = get<EntityElement>('pc-entity[name="a"]');
            const b = get<EntityElement>('pc-entity[name="b"]');
            const spy = vi.fn();
            parent.addEventListener('click', spy);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(a.entity!)], [hit(b.entity!)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(up());
            await flush();

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0].target, 'the click targets the ancestor element').toBe(parent);
        });

        it('does not dispatch click for a non-primary button', async () => {
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

            canvas.dispatchEvent(down({ button: 2 }));
            await flush();
            canvas.dispatchEvent(up({ button: 2 }));
            await flush();

            expect(spies.pointerdown, 'down and up still fire for secondary buttons').toHaveBeenCalledTimes(1);
            expect(spies.pointerup).toHaveBeenCalledTimes(1);
            expect(spies.click).not.toHaveBeenCalled();
        });

        it('does not dispatch click when the browser cancels the press', async () => {
            // A pointercancel (a touch claimed by scrolling, say) means the release can never
            // conclude the press.
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(new PointerEvent('pointercancel'));
            canvas.dispatchEvent(up());
            await flush();

            expect(spies.pointerup).toHaveBeenCalledTimes(1);
            expect(spies.click).not.toHaveBeenCalled();
        });

        it('concludes a click whose press pick resolves after the release pick', async () => {
            // Picks resolve in GPU order, not event order: a quick tap can deliver the release
            // pick first. The gesture must still deliver as pointerdown, pointerup, click.
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            const pressPick = deferred<ReturnType<typeof hit>[]>();
            const releasePick = deferred<ReturnType<typeof hit>[]>();
            stubPicker(appElement, [pressPick.promise, releasePick.promise]);

            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());

            releasePick.resolve([hit(entity)]);
            await flush();
            expect(spies.pointerup, 'the release dispatch waits for the press dispatch').not.toHaveBeenCalled();
            expect(spies.click, 'the press pick is still in flight').not.toHaveBeenCalled();

            pressPick.resolve([hit(entity)]);
            await flush();
            expect(spies.pointerdown).toHaveBeenCalledTimes(1);
            expect(spies.pointerup).toHaveBeenCalledTimes(1);
            expect(spies.click).toHaveBeenCalledTimes(1);
            expect(spies.pointerdown.mock.invocationCallOrder[0], 'the gesture delivers in event order')
                .toBeLessThan(spies.pointerup.mock.invocationCallOrder[0]);
            expect(spies.pointerup.mock.invocationCallOrder[0])
                .toBeLessThan(spies.click.mock.invocationCallOrder[0]);
        });

        it('dispatches overlapping clicks in gesture order even when the later picks resolve first', async () => {
            // Two press/release pairs in flight at once: if the second gesture's picks resolve
            // first, its click used to dispatch first, applying the clicks in reverse.
            const { appElement, all } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="a"></pc-entity>
                <pc-entity name="b"></pc-entity>
            `);
            const [a, b] = [all<EntityElement>('pc-entity')[1], all<EntityElement>('pc-entity')[2]];
            const aClick = vi.fn();
            const bClick = vi.fn();
            a.addEventListener('click', aClick);
            b.addEventListener('click', bClick);
            const canvas = appElement.querySelector('canvas')!;
            const picks = Array.from({ length: 4 }, () => deferred<ReturnType<typeof hit>[]>());
            stubPicker(appElement, picks.map((pick) => pick.promise));

            // Gesture 1 presses and releases on a, gesture 2 on b - all four picks still pending.
            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());
            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());

            // The second gesture's picks resolve first.
            picks[2].resolve([hit(b.entity!)]);
            picks[3].resolve([hit(b.entity!)]);
            await flush();
            expect(bClick, "the second click waits behind the first gesture's dispatches").not.toHaveBeenCalled();

            picks[0].resolve([hit(a.entity!)]);
            picks[1].resolve([hit(a.entity!)]);
            await flush();

            expect(aClick).toHaveBeenCalledTimes(1);
            expect(bClick).toHaveBeenCalledTimes(1);
            expect(aClick.mock.invocationCallOrder[0], 'the clicks conclude in gesture order').toBeLessThan(
                bClick.mock.invocationCallOrder[0]
            );
        });

        it('keeps dispatching after a pick that rejects', async () => {
            // A failed read back is reported and released - it must not sever the chain and
            // swallow every dispatch queued behind it.
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            stubPicker(appElement, [
                Promise.reject(new Error('read back failed')), // press 1
                [hit(entity)], // release 1
                [hit(entity)], // press 2
                [hit(entity)] // release 2
            ]);

            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());
            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());
            await flush();

            errors.expect('read back failed');
            expect(spies.pointerdown, 'the failed press dispatches nothing').toHaveBeenCalledTimes(1);
            expect(spies.pointerup, 'both releases still dispatch').toHaveBeenCalledTimes(2);
            expect(spies.click, 'only the second gesture concludes').toHaveBeenCalledTimes(1);
        });

        it('a pick that never resolves does not stall the dispatches of a later boot', async () => {
            // A read back can pend forever (a lost device), wedging the chain. Teardown replaces
            // it, so a re-inserted element dispatches afresh.
            const { appElement, container, canvas, element, spies } = await bootClickTarget();
            stubPicker(appElement, [deferred<ReturnType<typeof hit>[]>().promise]); // never resolves

            canvas.dispatchEvent(down()); // wedges the first boot's chain

            appElement.remove();
            container.appendChild(appElement);
            await readyWithin(appElement);
            await settle(container);
            appElement.app!.autoRender = false;

            // The re-boot created a new canvas and new entities; the listeners carried over
            const rebootedCanvas = appElement.querySelector('canvas');
            if (!rebootedCanvas) throw new Error('the re-booted pc-app created no canvas');
            stubPicker(appElement, [[hit(element.entity!)], [hit(element.entity!)]]);

            rebootedCanvas.dispatchEvent(down());
            rebootedCanvas.dispatchEvent(up());
            await flush();

            expect(spies.pointerdown, 'the re-booted chain dispatches immediately').toHaveBeenCalledTimes(1);
            expect(spies.pointerup).toHaveBeenCalledTimes(1);
            expect(spies.click).toHaveBeenCalledTimes(1);
        });

        it('tracks presses per pointer', async () => {
            const { appElement, all } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="a"></pc-entity>
                <pc-entity name="b"></pc-entity>
            `);
            const [a, b] = [all<EntityElement>('pc-entity')[1], all<EntityElement>('pc-entity')[2]];
            const aClick = vi.fn();
            const bClick = vi.fn();
            a.addEventListener('click', aClick);
            b.addEventListener('click', bClick);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(a.entity!)], [hit(b.entity!)], [hit(b.entity!)], [hit(a.entity!)]]);

            canvas.dispatchEvent(down({ pointerId: 1 }));
            canvas.dispatchEvent(down({ pointerId: 2 }));
            canvas.dispatchEvent(up({ pointerId: 2 }));
            canvas.dispatchEvent(up({ pointerId: 1 }));
            await flush();

            expect(aClick).toHaveBeenCalledTimes(1);
            expect(bClick).toHaveBeenCalledTimes(1);
        });

        it('carries the click count in detail, chained within the double-click window', async () => {
            // pointerup's own detail is fixed at 0 by the Pointer Events spec, but click is
            // exempt: its detail is the click count, which consumers read for double-click
            // detection - and to tell pointer clicks from keyboard activations, whose detail
            // really is 0.
            const { appElement, canvas, entity, spies } = await bootClickTarget();
            stubPicker(appElement, [
                [hit(entity)], [hit(entity)],
                [hit(entity)], [hit(entity)],
                [hit(entity)], [hit(entity)]
            ]);
            const nowSpy = vi.spyOn(performance, 'now');

            const clickAt = async (time: number) => {
                nowSpy.mockReturnValue(time);
                canvas.dispatchEvent(down());
                await flush();
                canvas.dispatchEvent(up());
                await flush();
            };

            await clickAt(1000); // a first click
            await clickAt(1200); // 200ms later: chains
            await clickAt(2000); // 800ms later: the window has passed

            const details = spies.click.mock.calls.map((call) => (call[0] as PointerEvent).detail);
            expect(details).toEqual([1, 2, 1]);
        });

        it('resets the click count when the target changes', async () => {
            const { appElement, all } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="a"></pc-entity>
                <pc-entity name="b"></pc-entity>
            `);
            const [a, b] = [all<EntityElement>('pc-entity')[1], all<EntityElement>('pc-entity')[2]];
            const aClick = vi.fn();
            const bClick = vi.fn();
            a.addEventListener('click', aClick);
            b.addEventListener('click', bClick);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(a.entity!)], [hit(a.entity!)], [hit(b.entity!)], [hit(b.entity!)]]);
            const nowSpy = vi.spyOn(performance, 'now');

            const clickAt = async (time: number) => {
                nowSpy.mockReturnValue(time);
                canvas.dispatchEvent(down());
                await flush();
                canvas.dispatchEvent(up());
                await flush();
            };

            await clickAt(1000);
            await clickAt(1100); // within the window, but a different target

            expect((aClick.mock.calls[0][0] as PointerEvent).detail).toBe(1);
            expect((bClick.mock.calls[0][0] as PointerEvent).detail, 'a new target starts a new count').toBe(1);
        });

        it('the inline onclick attribute alone attaches the canvas listeners', async () => {
            // The browser compiles inline handlers itself, so the attribute must feed the same
            // lazy canvas attach as addEventListener - jsdom never runs the handler, but the
            // wiring it triggers is observable.
            const { appElement, get } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const element = get<EntityElement>('pc-entity[name="target"]');
            const canvas = appElement.querySelector('canvas')!;
            const attach = vi.spyOn(canvas, 'addEventListener');

            element.setAttribute('onclick', 'void 0');

            const attached = attach.mock.calls.map((call) => call[0]);
            expect(attached).toContain('pointerdown');
            expect(attached).toContain('pointerup');
            expect(attached).toContain('pointercancel');
        });
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
            const cameraA = handle.get<CameraComponentElement>('pc-entity[name="camA"] pc-camera').component!;
            const cameraB = handle.get<CameraComponentElement>('pc-entity[name="camB"] pc-camera').component!;
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

        it('resolves a shared viewport edge to the viewport whose first pixel it is', async () => {
            // Viewports rasterize half-open pixel ranges: on an 800-wide canvas split at 400,
            // buffer column 400 is the right viewport's first pixel and holds nothing in the
            // left camera's pick buffer. The right camera is declared first so the left camera
            // is walked first - an inclusive bound would let it claim the edge, miss, and end
            // the search at its opaque background.
            const { appElement, cameraA, target, canvas } = await bootCameraPair(
                'rect="0.5 0 0.5 1"',
                'rect="0 0 0.5 1"'
            );
            giveCanvasBox(canvas);
            const calls = stubPicker(appElement, [[hit(target.entity!)]]);

            canvas.dispatchEvent(move(400, 300)); // exactly on the split
            await flush();

            expect(calls.cameras).toEqual([cameraA]);

            canvas.dispatchEvent(move(800, 300)); // on the canvas's outer edge: pixel 800 does not exist
            await flush();

            expect(calls.cameras, 'no viewport owns a coordinate at the canvas edge').toEqual([cameraA]);
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
