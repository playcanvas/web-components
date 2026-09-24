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
const CONTAINER_SRC = `data:application/json,${encodeURIComponent(
    JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'content-root' }]
    })
)}`;

describe('pc-app pointer picking', () => {
    const { errors, warnings } = useGuard();

    /**
     * Boots one pc-entity with pointer listeners attached, which is also what makes pc-app pick:
     * under the default `picking="auto"` it only picks while a listener it can see wants the event.
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

    it('moving between an entity and its descendants neither leaves nor re-enters it', async () => {
        // As in the DOM, an element's pointerenter/pointerleave cover its descendants too: the
        // pointer crossing from a child's geometry to the parent's own stays inside the parent,
        // so the parent sees exactly one enter and one leave.
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

    it('targets the pc-model for a hit inside it, entering the wrapper around it too', async () => {
        // The tweening-example shape: hover handlers on a wrapper entity around a bare pc-model.
        // A content node no pc-node fronts resolves to the model, and the wrapper - its ancestor
        // in the element tree - is entered along with it, whether or not the model listens.
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
        expect(wrapperEnter, 'the wrapper is entered with the model inside it').toHaveBeenCalledTimes(1);

        canvas.dispatchEvent(move(10, 10));
        await flush();

        const modelEnter = vi.fn();
        model.addEventListener('pointerenter', modelEnter);
        canvas.dispatchEvent(move(400, 300));
        await flush();
        expect(modelEnter, 'the model is the element hit').toHaveBeenCalledTimes(1);
        expect(wrapperEnter, 'and the wrapper is entered again, as in the DOM').toHaveBeenCalledTimes(2);
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

    it('ignores a hover pick from a previous connection that resolves after a re-boot', async () => {
        // A remove and re-insert repopulates the picker and application, so presence checks
        // alone cannot tell an old operation from the new connection - only a pick's own
        // connection may deliver it.
        const { appElement, container, canvas, element, spies } = await bootTarget();
        const pending = deferred<ReturnType<typeof hit>[]>();
        stubPicker(appElement, [pending.promise]);

        canvas.dispatchEvent(move(400, 300));

        appElement.remove();
        container.appendChild(appElement);
        await readyWithin(appElement);
        await settle(container);
        appElement.app!.autoRender = false;

        // The old connection's pick resolves now, against the re-booted entity
        pending.resolve([hit(element.entity!)]);
        await flush();

        expect(spies.pointerenter, "the old connection's hover pick must not apply").not.toHaveBeenCalled();
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

    it('dispatches pointerdown on the child hit, bubbling to a listening ancestor', async () => {
        // The event targets the element hit, not the nearest element that happens to listen, and
        // reaches the ancestor by bubbling - so event.target identifies the child.
        const { appElement, all } = await bootApp(`
            <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
            <pc-entity name="parent"><pc-entity name="child"></pc-entity></pc-entity>
        `);
        const parent = all<EntityElement>('pc-entity')[1];
        const child = all<EntityElement>('pc-entity')[2];
        const seen: [EventTarget | null, EventTarget | null][] = [];
        parent.addEventListener('pointerdown', (event: PointerEvent) => {
            seen.push([event.target, event.currentTarget]);
        });
        const canvas = appElement.querySelector('canvas');
        if (!canvas) throw new Error('pc-app created no canvas');
        stubPicker(appElement, [[hit(child.entity!)]]);

        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }));
        await flush();

        expect(seen).toEqual([[child, parent]]);
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

    it('keeps picking on moves while any hover event type is still listened for', async () => {
        // enter, leave and move all ride the move pick. Removing the last pointerenter listener
        // must not stop it while a pointermove listener still needs it.
        const { appElement, canvas, element, entity, spies } = await bootTarget();
        const moveSpy = vi.fn();
        element.addEventListener('pointermove', moveSpy);
        element.removeEventListener('pointerenter', spies.pointerenter);
        element.removeEventListener('pointerleave', spies.pointerleave);
        const calls = stubPicker(appElement, [[hit(entity)]]);

        canvas.dispatchEvent(move(400, 300));
        await flush();
        expect(moveSpy, 'the move listener still rides the move pick').toHaveBeenCalledTimes(1);

        element.removeEventListener('pointermove', moveSpy);
        canvas.dispatchEvent(move(410, 300));
        await flush();
        expect(calls.async, 'with no hover listener left, a move is not picked').toBe(1);
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
            expect(spies.click.mock.invocationCallOrder[0], 'click concludes the release').toBeGreaterThan(
                spies.pointerup.mock.invocationCallOrder[0]
            );
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

        it('dispatches pointercancel on the press target, and no click, when the browser cancels', async () => {
            // A pointercancel (a touch claimed by scrolling, say) means the release can never
            // conclude the press - and the element the press went down on is told so, as code
            // tracking a drag from its pointerdown needs to be.
            const { appElement, canvas, element, entity, spies } = await bootClickTarget();
            const cancel = vi.fn();
            element.addEventListener('pointercancel', cancel);
            stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

            canvas.dispatchEvent(down());
            await flush();
            canvas.dispatchEvent(new PointerEvent('pointercancel'));
            canvas.dispatchEvent(up());
            await flush();

            expect(cancel).toHaveBeenCalledTimes(1);
            expect((cancel.mock.calls[0][0] as PointerEvent).cancelable, 'pointercancel is not cancelable').toBe(false);
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
            expect(spies.pointerdown.mock.invocationCallOrder[0], 'the gesture delivers in event order').toBeLessThan(
                spies.pointerup.mock.invocationCallOrder[0]
            );
            expect(spies.pointerup.mock.invocationCallOrder[0]).toBeLessThan(spies.click.mock.invocationCallOrder[0]);
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
            stubPicker(
                appElement,
                picks.map((pick) => pick.promise)
            );

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

        it('does not dispatch a press picked before a re-boot into the new connection', async () => {
            // The re-boot repopulates the picker and application, so the old press's dispatch
            // step cannot rely on their presence - its own connection is gone.
            const { appElement, container, canvas, element, spies } = await bootClickTarget();
            const pending = deferred<ReturnType<typeof hit>[]>();
            stubPicker(appElement, [pending.promise]);

            canvas.dispatchEvent(down());

            appElement.remove();
            container.appendChild(appElement);
            await readyWithin(appElement);
            await settle(container);
            appElement.app!.autoRender = false;

            // The old connection's pick resolves now, against the re-booted entity
            pending.resolve([hit(element.entity!)]);
            await flush();

            expect(spies.pointerdown, "the old connection's press must not dispatch").not.toHaveBeenCalled();
            expect(spies.click).not.toHaveBeenCalled();
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
                [hit(entity)],
                [hit(entity)],
                [hit(entity)],
                [hit(entity)],
                [hit(entity)],
                [hit(entity)]
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

        it('the inline onclick attribute alone makes the click worth dispatching', async () => {
            // The browser compiles inline handlers itself, bypassing addEventListener, so the
            // attribute is read directly. jsdom never compiles it, so a document listener - which
            // the library cannot see, and so creates no demand of its own - observes the click.
            const { appElement, get } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const element = get<EntityElement>('pc-entity[name="target"]');
            const canvas = appElement.querySelector('canvas')!;
            const documentClick = vi.fn();
            document.addEventListener('click', documentClick);
            stubPicker(appElement, [[hit(element.entity!)], [hit(element.entity!)]]);

            element.setAttribute('onclick', 'void 0');
            canvas.dispatchEvent(down());
            canvas.dispatchEvent(up());
            await flush();
            document.removeEventListener('click', documentClick);

            expect(documentClick).toHaveBeenCalledTimes(1);
            expect(documentClick.mock.calls[0][0].target, 'the click bubbled from the entity').toBe(element);
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

    const press = (options: PointerEventInit = {}) =>
        new PointerEvent('pointerdown', { clientX: 400, clientY: 300, ...options });
    const release = (options: PointerEventInit = {}) =>
        new PointerEvent('pointerup', { clientX: 400, clientY: 300, ...options });

    describe('DOM semantics', () => {
        const ALL_TYPES = [
            'pointerover',
            'pointerenter',
            'pointermove',
            'pointerdown',
            'pointerup',
            'pointercancel',
            'pointerout',
            'pointerleave',
            'click'
        ];

        /**
         * Boots a scene holding a nested pair of entities and a sibling, with a listener for
         * every synthesized type on each of them, on the scene and on pc-app. The log records
         * each event at its target, in dispatch order, as `type@target<relatedTarget`.
         *
         * @param appAttributes - Extra pc-app attributes, such as a picking mode.
         * @returns The booted handle plus the canvas, the labeled elements and the log.
         */
        const bootScene = async (appAttributes = '') => {
            const handle = await bootApp(
                `
                <pc-scene>
                    <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                    <pc-entity name="outer"><pc-entity name="inner"></pc-entity></pc-entity>
                    <pc-entity name="other"></pc-entity>
                </pc-scene>
            `,
                { appAttributes }
            );
            const scene = handle.get('pc-scene');
            const outer = handle.get<EntityElement>('pc-entity[name="outer"]');
            const inner = handle.get<EntityElement>('pc-entity[name="inner"]');
            const other = handle.get<EntityElement>('pc-entity[name="other"]');
            const labels = new Map<EventTarget, string>([
                [handle.appElement, 'app'],
                [scene, 'scene'],
                [outer, 'outer'],
                [inner, 'inner'],
                [other, 'other']
            ]);

            const log: string[] = [];
            const record = (event: Event) => {
                if (event.eventPhase !== Event.AT_TARGET) return;
                const related = (event as PointerEvent).relatedTarget;
                const suffix = related ? `<${labels.get(related) ?? '?'}` : '';
                log.push(`${event.type}@${labels.get(event.target!)}${suffix}`);
            };
            labels.forEach((_, element) => ALL_TYPES.forEach((type) => element.addEventListener(type, record)));

            const canvas = handle.appElement.querySelector('canvas')!;
            return { ...handle, canvas, scene, outer, inner, other, log };
        };

        /**
         * Returns the log entries added by `action`, once its picks have been dispatched.
         *
         * @param log - The event log.
         * @param action - Dispatches canvas events.
         * @returns The entries it produced.
         */
        const logged = async (log: string[], action: () => void) => {
            const from = log.length;
            action();
            await flush();
            return log.slice(from);
        };

        it('dispatches the boundary events in DOM order, entering outermost first and leaving innermost first', async () => {
            const { appElement, canvas, outer, inner, other, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)], [hit(outer.entity!)], [hit(other.entity!)], []]);

            expect(await logged(log, () => canvas.dispatchEvent(move(400, 300))), 'onto the inner entity').toEqual([
                'pointerover@inner<app',
                'pointerenter@scene<app',
                'pointerenter@outer<app',
                'pointerenter@inner<app',
                'pointermove@inner'
            ]);
            expect(
                await logged(log, () => canvas.dispatchEvent(move(410, 300))),
                'onto its parent, whose area includes it: nothing is left but the child'
            ).toEqual([
                'pointerout@inner<outer',
                'pointerleave@inner<outer',
                'pointerover@outer<inner',
                'pointermove@outer'
            ]);
            expect(await logged(log, () => canvas.dispatchEvent(move(420, 300))), 'across to a sibling').toEqual([
                'pointerout@outer<other',
                'pointerleave@outer<other',
                'pointerover@other<outer',
                'pointerenter@other<outer',
                'pointermove@other'
            ]);
            expect(
                await logged(log, () => canvas.dispatchEvent(move(10, 10))),
                'off every entity: the scene is left too, and pc-app is dispatched nothing under auto'
            ).toEqual(['pointerout@other<app', 'pointerleave@other<app', 'pointerleave@scene<app']);
        });

        it('stands pc-app in for the background under picking="always"', async () => {
            // relatedTarget-based consumers, such as React's onPointerEnter/onPointerLeave, derive
            // enter and leave from pointerout and need one from the element the pointer came
            // from - for the background, that is pc-app
            const { appElement, canvas, inner, log } = await bootScene('picking="always"');
            stubPicker(appElement, [[hit(inner.entity!)], []]);

            expect(await logged(log, () => canvas.dispatchEvent(move(400, 300)))).toEqual([
                'pointerout@app<inner',
                'pointerover@inner<app',
                'pointerenter@scene<app',
                'pointerenter@outer<app',
                'pointerenter@inner<app',
                'pointermove@inner'
            ]);
            expect(await logged(log, () => canvas.dispatchEvent(move(10, 10)))).toEqual([
                'pointerout@inner<app',
                'pointerleave@inner<app',
                'pointerleave@outer<app',
                'pointerleave@scene<app',
                'pointerover@app<inner'
            ]);
        });

        it('builds every event with the flags of its native counterpart', async () => {
            const { appElement, canvas, inner } = await bootScene();
            const events = new Map<string, PointerEvent>();
            ALL_TYPES.forEach((type) =>
                inner.addEventListener(type, (event) => events.set(type, event as PointerEvent))
            );
            stubPicker(appElement, [
                [hit(inner.entity!)],
                [hit(inner.entity!)],
                [hit(inner.entity!)],
                [hit(inner.entity!)],
                []
            ]);

            canvas.dispatchEvent(move(400, 300));
            canvas.dispatchEvent(press());
            canvas.dispatchEvent(release());
            canvas.dispatchEvent(press());
            canvas.dispatchEvent(new PointerEvent('pointercancel'));
            canvas.dispatchEvent(move(10, 10));
            await flush();

            const flags = Object.fromEntries(
                ALL_TYPES.map((type) => {
                    const event = events.get(type)!;
                    return [type, [event.bubbles, event.cancelable, event.composed]];
                })
            );
            expect(flags).toEqual({
                pointerover: [true, true, true],
                pointerenter: [false, false, true],
                pointermove: [true, true, true],
                pointerdown: [true, true, true],
                pointerup: [true, true, true],
                pointercancel: [true, false, true],
                pointerout: [true, true, true],
                pointerleave: [false, false, true],
                click: [true, true, true]
            });
            ALL_TYPES.forEach((type) => {
                expect(events.get(type)!.isTrusted, `${type} is synthesized`).toBe(false);
                expect(events.get(type)!.detail, `${type} detail`).toBe(type === 'click' ? 1 : 0);
            });
            ['pointerover', 'pointerenter', 'pointerout', 'pointerleave'].forEach((type) => {
                expect(events.get(type)!.button, `${type} changes no button`).toBe(-1);
            });
        });

        it('copies the pointer state from the canvas event', async () => {
            const { appElement, canvas, inner } = await bootScene();
            let received: PointerEvent | null = null;
            inner.addEventListener('pointerdown', (event: PointerEvent) => {
                received = event;
            });
            stubPicker(appElement, [[hit(inner.entity!)]]);

            canvas.dispatchEvent(
                press({
                    screenX: 1,
                    screenY: 2,
                    pointerId: 7,
                    pointerType: 'pen',
                    isPrimary: true,
                    button: 0,
                    buttons: 1,
                    pressure: 0.5,
                    tangentialPressure: 0.25,
                    tiltX: 10,
                    tiltY: -5,
                    twist: 30,
                    width: 2,
                    height: 3,
                    altKey: true,
                    shiftKey: true,
                    modifierCapsLock: true
                })
            );
            await flush();

            const event = received as PointerEvent | null;
            expect(event).not.toBeNull();
            expect({
                clientX: event!.clientX,
                clientY: event!.clientY,
                screenX: event!.screenX,
                screenY: event!.screenY,
                pointerId: event!.pointerId,
                pointerType: event!.pointerType,
                isPrimary: event!.isPrimary,
                button: event!.button,
                buttons: event!.buttons,
                pressure: event!.pressure,
                tangentialPressure: event!.tangentialPressure,
                tiltX: event!.tiltX,
                tiltY: event!.tiltY,
                twist: event!.twist,
                width: event!.width,
                height: event!.height,
                altKey: event!.altKey,
                shiftKey: event!.shiftKey,
                capsLock: event!.getModifierState('CapsLock')
            }).toEqual({
                clientX: 400,
                clientY: 300,
                screenX: 1,
                screenY: 2,
                pointerId: 7,
                pointerType: 'pen',
                isPrimary: true,
                button: 0,
                buttons: 1,
                pressure: 0.5,
                tangentialPressure: 0.25,
                tiltX: 10,
                tiltY: -5,
                twist: 30,
                width: 2,
                height: 3,
                altKey: true,
                shiftKey: true,
                capsLock: true
            });
        });

        it('lets a listener on pc-scene delegate for every entity', async () => {
            // The scene's listener alone is demand enough, and event.target names the entity hit
            const { appElement, get } = await bootApp(`
                <pc-scene>
                    <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                    <pc-entity name="target"></pc-entity>
                </pc-scene>
            `);
            const scene = get('pc-scene');
            const target = get<EntityElement>('pc-entity[name="target"]');
            const clicked: EventTarget[] = [];
            scene.addEventListener('click', (event) => clicked.push(event.target!));
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(target.entity!)], [hit(target.entity!)]]);

            canvas.dispatchEvent(press());
            canvas.dispatchEvent(release());
            await flush();

            expect(clicked).toEqual([target]);
        });

        it('dispatches nothing where no listener it can see is on the path', async () => {
            // Under auto, an event reaches the document only by bubbling from an element whose
            // path has a listener - so a page that listens for nothing sees no synthesized events
            const { appElement, all } = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="a"></pc-entity>
                <pc-entity name="b"></pc-entity>
            `);
            const [a, b] = [all<EntityElement>('pc-entity')[1], all<EntityElement>('pc-entity')[2]];
            a.addEventListener('click', vi.fn());
            const documentClick = vi.fn();
            document.addEventListener('click', documentClick);
            const canvas = appElement.querySelector('canvas')!;
            stubPicker(appElement, [[hit(b.entity!)], [hit(b.entity!)], [hit(a.entity!)], [hit(a.entity!)]]);

            canvas.dispatchEvent(press());
            canvas.dispatchEvent(release());
            await flush();
            expect(documentClick, 'nothing listens on the path from b').not.toHaveBeenCalled();

            canvas.dispatchEvent(press());
            canvas.dispatchEvent(release());
            await flush();
            document.removeEventListener('click', documentClick);
            expect(documentClick, "a's click bubbles to the document").toHaveBeenCalledTimes(1);
        });

        it('only lets consecutive moves supersede one another', async () => {
            // A move followed by a press keeps its place in the order: a later move supersedes
            // only moves with nothing between them, or the gesture would lose its first move
            const { appElement, canvas, inner, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)], [hit(inner.entity!)], []]);

            canvas.dispatchEvent(move(400, 300));
            canvas.dispatchEvent(press());
            canvas.dispatchEvent(move(10, 10));
            await flush();

            expect(log).toEqual([
                'pointerover@inner<app',
                'pointerenter@scene<app',
                'pointerenter@outer<app',
                'pointerenter@inner<app',
                'pointermove@inner',
                'pointerdown@inner',
                'pointerout@inner<app',
                'pointerleave@inner<app',
                'pointerleave@outer<app',
                'pointerleave@scene<app'
            ]);
        });

        it('dispatches no pointercancel on a press target removed during the press', async () => {
            const { appElement, canvas, other } = await bootScene();
            const cancel = vi.fn();
            other.addEventListener('pointercancel', cancel);
            stubPicker(appElement, [[hit(other.entity!)]]);

            canvas.dispatchEvent(press());
            await flush();
            other.remove();
            canvas.dispatchEvent(new PointerEvent('pointercancel'));
            await flush();

            expect(cancel).not.toHaveBeenCalled();
        });

        it('enters the element under a press before pressing it', async () => {
            // A press is a hit test too: a touch has no hover before it goes down
            const { appElement, canvas, inner, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)]]);

            expect(await logged(log, () => canvas.dispatchEvent(press()))).toEqual([
                'pointerover@inner<app',
                'pointerenter@scene<app',
                'pointerenter@outer<app',
                'pointerenter@inner<app',
                'pointerdown@inner'
            ]);
        });

        it('leaves the entity under the pointer when the pointer leaves the canvas', async () => {
            // Nothing is picked once the pointer is off the canvas, so without this the entity
            // would stay entered forever
            const { appElement, canvas, inner, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)]]);
            canvas.dispatchEvent(move(400, 300));
            await flush();

            expect(
                await logged(log, () =>
                    canvas.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: document.body }))
                )
            ).toEqual([
                'pointerout@inner<app',
                'pointerleave@inner<app',
                'pointerleave@outer<app',
                'pointerleave@scene<app'
            ]);
        });

        it('does not re-enter an entity from a move picked before the pointer left the canvas', async () => {
            const { appElement, canvas, inner, log } = await bootScene();
            const pending = deferred<ReturnType<typeof hit>[]>();
            stubPicker(appElement, [pending.promise]);

            canvas.dispatchEvent(move(400, 300));
            canvas.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: document.body }));
            pending.resolve([hit(inner.entity!)]);
            await flush();

            expect(log).toEqual([]);
        });

        it('dispatches no boundary events on an element removed from the document', async () => {
            // As in the DOM: the pointer passes to the nearest entity above the removed one, so
            // moving onto that entity is no transition at all
            const { appElement, canvas, outer, inner, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)], [hit(outer.entity!)]]);
            canvas.dispatchEvent(move(400, 300));
            await flush();

            inner.remove();

            expect(await logged(log, () => canvas.dispatchEvent(move(410, 300)))).toEqual(['pointermove@outer']);
        });

        it('tracks each pointer separately', async () => {
            // Two touches over different entities must not flap each other's enter/leave
            const { appElement, canvas, inner, other, log } = await bootScene();
            stubPicker(appElement, [[hit(inner.entity!)], [hit(other.entity!)], []]);

            canvas.dispatchEvent(move(400, 300)); // pointer 0 onto inner
            canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2 })); // pointer 2 onto other
            await flush();
            expect(
                log.filter((entry) => entry.startsWith('pointerleave')),
                'nothing is left'
            ).toEqual([]);

            expect(
                await logged(log, () => canvas.dispatchEvent(move(10, 10))),
                'pointer 0 leaving leaves only what pointer 0 was over'
            ).toEqual([
                'pointerout@inner<app',
                'pointerleave@inner<app',
                'pointerleave@outer<app',
                'pointerleave@scene<app'
            ]);
        });
    });

    describe('listener bookkeeping', () => {
        /**
         * Boots one target entity and no listeners, with a picker whose every pick hits it.
         *
         * @returns The booted handle plus the element, the canvas and the pick counts.
         */
        const bootBare = async () => {
            const handle = await bootApp(`
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `);
            const element = handle.get<EntityElement>('pc-entity[name="target"]');
            const canvas = handle.appElement.querySelector('canvas')!;
            const calls = stubPicker(
                handle.appElement,
                Array.from({ length: 10 }, () => [hit(element.entity!)])
            );
            const moveOn = async () => {
                canvas.dispatchEvent(move(400, 300));
                await flush();
            };
            return { ...handle, element, canvas, calls, moveOn };
        };

        it('forgets a once listener after it runs', async () => {
            const { element, calls, moveOn } = await bootBare();
            const spy = vi.fn();
            element.addEventListener('pointermove', spy, { once: true });

            await moveOn();
            await moveOn();

            expect(spy).toHaveBeenCalledTimes(1);
            expect(calls.async, 'the spent listener no longer makes moves worth picking').toBe(1);
        });

        it('forgets a listener whose signal aborts', async () => {
            const { element, calls, moveOn } = await bootBare();
            const controller = new AbortController();
            element.addEventListener('pointermove', vi.fn(), { signal: controller.signal });

            await moveOn();
            controller.abort();
            await moveOn();

            expect(calls.async).toBe(1);
        });

        it('tells the capture and bubble registrations of one listener apart', async () => {
            const { element, calls, moveOn } = await bootBare();
            const listener = vi.fn();
            element.addEventListener('pointermove', listener, true);
            element.addEventListener('pointermove', listener);

            element.removeEventListener('pointermove', listener, { capture: true });
            await moveOn();
            expect(calls.async, 'the bubble registration remains').toBe(1);

            element.removeEventListener('pointermove', listener);
            await moveOn();
            expect(calls.async, 'both are gone').toBe(1);
        });

        it('ignores a duplicate registration, as the DOM does', async () => {
            const { element, calls, moveOn } = await bootBare();
            const listener = vi.fn();
            element.addEventListener('pointermove', listener);
            element.addEventListener('pointermove', listener);
            element.removeEventListener('pointermove', listener);

            await moveOn();

            expect(calls.async, 'one removal undoes both adds').toBe(0);
        });

        it('accepts a listener object', async () => {
            const { element, moveOn } = await bootBare();
            const handleEvent = vi.fn();
            element.addEventListener('pointermove', { handleEvent });

            await moveOn();

            expect(handleEvent).toHaveBeenCalledTimes(1);
        });

        it('sees a handler assigned as a property', async () => {
            // Assigning onpointerenter bypasses addEventListener and the attribute alike
            const { element, moveOn } = await bootBare();
            const spy = vi.fn();
            element.onpointerenter = spy;

            await moveOn();

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe('picking', () => {
        it('never picks under picking="none", whatever listens', async () => {
            const { appElement, canvas, entity, spies } = await (async () => {
                const handle = await bootApp(
                    `
                    <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                    <pc-entity name="target"></pc-entity>
                `,
                    { appAttributes: 'picking="none"' }
                );
                const element = handle.get<EntityElement>('pc-entity[name="target"]');
                const spies = { pointerenter: vi.fn(), pointerdown: vi.fn() };
                Object.entries(spies).forEach(([type, spy]) => element.addEventListener(type, spy));
                return {
                    ...handle,
                    canvas: handle.appElement.querySelector('canvas')!,
                    entity: element.entity!,
                    spies
                };
            })();
            const calls = stubPicker(appElement, [[hit(entity)], [hit(entity)]]);

            canvas.dispatchEvent(move(400, 300));
            canvas.dispatchEvent(press());
            await flush();

            expect(calls.async).toBe(0);
            expect(spies.pointerenter).not.toHaveBeenCalled();
            expect(spies.pointerdown).not.toHaveBeenCalled();
        });

        it('picks for listeners it cannot see under picking="always"', async () => {
            // A document listener, like a framework's delegated handler, is invisible to auto
            const { appElement, get } = await bootApp(
                `
                <pc-entity name="camera"><pc-camera></pc-camera></pc-entity>
                <pc-entity name="target"></pc-entity>
            `,
                { appAttributes: 'picking="always"' }
            );
            const target = get<EntityElement>('pc-entity[name="target"]');
            const canvas = appElement.querySelector('canvas')!;
            const documentClick = vi.fn();
            document.addEventListener('click', documentClick);
            stubPicker(appElement, [[hit(target.entity!)], [hit(target.entity!)]]);

            canvas.dispatchEvent(press());
            canvas.dispatchEvent(release());
            await flush();
            document.removeEventListener('click', documentClick);

            expect(documentClick).toHaveBeenCalledTimes(1);
            expect(documentClick.mock.calls[0][0].target).toBe(target);
        });

        it('follows the attribute at runtime', async () => {
            const { appElement, canvas, entity, spies } = await bootTarget();
            const calls = stubPicker(appElement, [[hit(entity)], []]);

            appElement.setAttribute('picking', 'none');
            expect(appElement.picking).toBe('none');
            canvas.dispatchEvent(move(400, 300));
            await flush();
            expect(calls.async, 'none, set after boot').toBe(0);

            appElement.removeAttribute('picking');
            expect(appElement.picking, 'removal restores the default').toBe('auto');
            canvas.dispatchEvent(move(400, 300));
            await flush();
            expect(spies.pointerenter).toHaveBeenCalledTimes(1);
        });

        it('warns on an invalid value and falls back to auto', async () => {
            const { appElement } = await bootTarget();

            appElement.setAttribute('picking', 'sometimes');

            warnings.expect("Invalid value 'sometimes' for attribute 'picking'");
            expect(appElement.picking).toBe('auto');
        });
    });
});
