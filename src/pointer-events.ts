// Keep `export` on these declarations. TypeScript removes the declaration and its inline export
// when `stripInternal` is enabled. A separate `export { ... }` statement would remain in the
// generated .d.ts file and refer to a declaration that had been removed.

/**
 * The event types the containing `<pc-app>` synthesizes on entity-fronting elements by picking
 * the scene under the pointer: the boundary events, the press, move and release events, and
 * `click` - which concludes a primary-button press and release, and is delivered as a
 * `PointerEvent` exactly as modern browsers deliver native clicks.
 *
 * @internal
 */
export const SYNTHESIZED_EVENTS = [
    'pointerover',
    'pointerenter',
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'pointerout',
    'pointerleave',
    'click'
] as const;

/**
 * A synthesized event type.
 *
 * @internal
 */
export type SynthesizedEventType = (typeof SYNTHESIZED_EVENTS)[number];

const SYNTHESIZED_EVENT_SET: ReadonlySet<string> = new Set(SYNTHESIZED_EVENTS);

/**
 * The propagation flags of each synthesized event type, as the Pointer Events and UI Events
 * specifications define them for the native events. Every one of them is composed.
 */
const EVENT_FLAGS: Record<SynthesizedEventType, { bubbles: boolean; cancelable: boolean }> = {
    pointerover: { bubbles: true, cancelable: true },
    pointerenter: { bubbles: false, cancelable: false },
    pointerdown: { bubbles: true, cancelable: true },
    pointermove: { bubbles: true, cancelable: true },
    pointerup: { bubbles: true, cancelable: true },
    pointercancel: { bubbles: true, cancelable: false },
    pointerout: { bubbles: true, cancelable: true },
    pointerleave: { bubbles: false, cancelable: false },
    click: { bubbles: true, cancelable: true }
};

/**
 * The boundary event types, which report a change of the element under the pointer rather than
 * a change of button state - so their `button` is always -1.
 */
const BOUNDARY_EVENTS: ReadonlySet<SynthesizedEventType> = new Set([
    'pointerover',
    'pointerenter',
    'pointerout',
    'pointerleave'
]);

/**
 * Builds a synthesized event of `type` from the canvas event that caused it. The pointer's
 * position, buttons, modifiers and device properties are copied from the canvas event, while the
 * propagation flags come from the event type itself: an init built by passing the canvas event
 * would make `pointerenter` and `pointerleave` bubble whenever the canvas event did.
 *
 * @param type - The event type to create.
 * @param source - The canvas event that caused it.
 * @param relatedTarget - The element the pointer came from or went to, for the boundary events.
 * @param detail - The click count for `click`; 0 for every pointer event.
 * @returns The event, ready to dispatch.
 * @internal
 */
export const createPointerEvent = (
    type: SynthesizedEventType,
    source: PointerEvent,
    relatedTarget: EventTarget | null = null,
    detail = 0
): PointerEvent => {
    const modifier = (key: string) => source.getModifierState(key);
    return new PointerEvent(type, {
        ...EVENT_FLAGS[type],
        composed: true,
        view: source.view,
        detail,
        screenX: source.screenX,
        screenY: source.screenY,
        clientX: source.clientX,
        clientY: source.clientY,
        movementX: source.movementX,
        movementY: source.movementY,
        button: BOUNDARY_EVENTS.has(type) ? -1 : source.button,
        buttons: source.buttons,
        relatedTarget,
        altKey: source.altKey,
        ctrlKey: source.ctrlKey,
        metaKey: source.metaKey,
        shiftKey: source.shiftKey,
        modifierAltGraph: modifier('AltGraph'),
        modifierCapsLock: modifier('CapsLock'),
        modifierFn: modifier('Fn'),
        modifierFnLock: modifier('FnLock'),
        modifierHyper: modifier('Hyper'),
        modifierNumLock: modifier('NumLock'),
        modifierScrollLock: modifier('ScrollLock'),
        modifierSuper: modifier('Super'),
        modifierSymbol: modifier('Symbol'),
        modifierSymbolLock: modifier('SymbolLock'),
        pointerId: source.pointerId,
        pointerType: source.pointerType,
        isPrimary: source.isPrimary,
        width: source.width,
        height: source.height,
        pressure: source.pressure,
        tangentialPressure: source.tangentialPressure,
        tiltX: source.tiltX,
        tiltY: source.tiltY,
        twist: source.twist,
        altitudeAngle: source.altitudeAngle,
        azimuthAngle: source.azimuthAngle
    });
};

/**
 * One listener registration, keyed as the DOM keys it: by callback and capture flag.
 */
type Registration = {
    listener: EventListenerOrEventListenerObject;
    capture: boolean;

    /**
     * For a `once` registration, the listener registered right behind it that forgets it once it
     * has run. `null` otherwise.
     */
    follower: EventListener | null;
};

/**
 * Mirrors the listeners registered on an element for the synthesized event types, following the
 * DOM's own registration rules - a duplicate registration is ignored, `capture` distinguishes two
 * registrations of one callback, a `once` listener is gone after it runs, and aborting a `signal`
 * removes its listeners - so that `<pc-app>` picks exactly while a listener is registered.
 * Listeners for any other event type are not recorded.
 *
 * Fed by the element's `addEventListener` and `removeEventListener` overrides, after the native
 * methods have run. The DOM removes a `once` listener itself, and offers no way to observe that,
 * so a second one-shot listener is registered directly behind it: the DOM runs listeners in
 * registration order, so the follower runs right after the listener it follows, and forgets it.
 * The follower is registered with the native method, so it is never recorded itself.
 *
 * @internal
 */
export class ListenerRegistry {
    private _target: EventTarget;

    private _registrations = new Map<string, Registration[]>();

    /**
     * @param target - The element whose listeners are recorded.
     */
    constructor(target: EventTarget) {
        this._target = target;
    }

    /**
     * Records a registration, after the native `addEventListener` has made it.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The options it was registered with.
     */
    add(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
    ) {
        if (!listener || !SYNTHESIZED_EVENT_SET.has(type)) return;

        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
        const once = typeof options === 'object' && Boolean(options.once);
        const signal = typeof options === 'object' ? options.signal : undefined;

        // The DOM ignores a registration whose signal has already aborted, and a duplicate
        if (signal?.aborted) return;
        const registrations = this._registrations.get(type) ?? [];
        if (registrations.some((r) => r.listener === listener && r.capture === capture)) return;

        const registration: Registration = { listener, capture, follower: null };
        registrations.push(registration);
        this._registrations.set(type, registrations);

        if (once) {
            registration.follower = () => this._forget(type, registration);
            EventTarget.prototype.addEventListener.call(this._target, type, registration.follower, {
                capture,
                once: true,
                signal
            });
        }
        signal?.addEventListener('abort', () => this._forget(type, registration), { once: true });
    }

    /**
     * Forgets a registration, after the native `removeEventListener` has removed it.
     *
     * @param type - The event type.
     * @param listener - The listener.
     * @param options - The options it is being removed with.
     */
    remove(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions
    ) {
        if (!listener) return;

        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
        const registration = this._registrations
            .get(type)
            ?.find((r) => r.listener === listener && r.capture === capture);
        if (registration) {
            this._forget(type, registration);
        }
    }

    /**
     * Whether a listener for `type` is registered.
     *
     * @param type - The event type.
     * @returns Whether one is registered.
     */
    has(type: string): boolean {
        return (this._registrations.get(type)?.length ?? 0) > 0;
    }

    private _forget(type: string, registration: Registration) {
        const registrations = this._registrations.get(type);
        const index = registrations?.indexOf(registration) ?? -1;
        if (index < 0) return;
        registrations!.splice(index, 1);

        if (registration.follower) {
            EventTarget.prototype.removeEventListener.call(
                this._target,
                type,
                registration.follower,
                registration.capture
            );
            registration.follower = null;
        }
    }
}

/**
 * Whether an element has a listener for `type` that the library can see: one registered through
 * `addEventListener` on an element that records them, an inline handler attribute (`onclick`,
 * `onpointerover`, ...), or a handler assigned to the matching property. The property check also
 * sees a compiled inline attribute, but the attribute is checked as well, because an inline handler
 * a strict Content Security Policy blocked has no compiled function to find.
 *
 * @param element - The element to check.
 * @param type - The event type.
 * @returns Whether a listener is visible.
 * @internal
 */
export const hasVisibleListener = (element: Element, type: string): boolean => {
    const registry = (element as Partial<{ _pointerListeners: ListenerRegistry }>)._pointerListeners;
    return (
        Boolean(registry?.has(type)) ||
        element.hasAttribute(`on${type}`) ||
        (element as unknown as Record<string, unknown>)[`on${type}`] != null
    );
};
