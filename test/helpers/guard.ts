import { beforeEach, expect, vi } from 'vitest';

type Pattern = string | RegExp;

const matches = (text: string, pattern: Pattern) => {
    return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
};

/**
 * Joins console arguments the way the library produces them (a single template string).
 *
 * @param args - The arguments the console method was called with.
 * @returns The joined message.
 */
const format = (args: unknown[]) => args.map((arg) => String(arg)).join(' ');

/**
 * Records messages on one channel and lets a test claim the ones it expects. Anything left
 * unclaimed when the test ends is a failure.
 */
class Recorder {
    /** Every message seen, in order. Never drained - kept for diagnostics. */
    readonly seen: string[] = [];

    /** Messages not yet accounted for. Drained as they are claimed. */
    private pending: string[] = [];

    constructor(private readonly channel: string) {}

    /**
     * Clears both lists, keeping this instance's identity.
     *
     * Identity matters: suites destructure the guard once at collection time
     * (`const { warnings } = useGuard()`), so replacing the recorder objects between tests would
     * leave the suite holding a stale one - writing to one instance and asserting against another.
     */
    reset() {
        this.seen.length = 0;
        this.pending.length = 0;
    }

    /** @param message - The message to record. */
    record(message: string) {
        this.seen.push(message);
        this.pending.push(message);
    }

    /**
     * Claims the messages matching `pattern`, asserting exactly `count` of them occurred.
     *
     * @param pattern - A substring or regular expression to match.
     * @param count - The exact number expected.
     * @returns The claimed messages.
     */
    expect(pattern: Pattern, count = 1): string[] {
        const claimed = this.pending.filter((message) => matches(message, pattern));
        expect(
            claimed.length,
            `expected ${count} ${this.channel} message(s) matching ${String(pattern)}, saw ${claimed.length}.\n` +
                `All ${this.channel} messages:\n${this.seen.map((message) => `  - ${message}`).join('\n') || '  (none)'}`
        ).toBe(count);
        this.pending = this.pending.filter((message) => !matches(message, pattern));
        return claimed;
    }

    /**
     * Claims messages matching `pattern` without asserting that any occurred.
     *
     * @param pattern - A substring or regular expression to match.
     */
    allow(pattern: Pattern) {
        this.pending = this.pending.filter((message) => !matches(message, pattern));
    }

    /** Claims everything remaining. Always accompany with a comment saying why. */
    ignoreRest() {
        this.pending = [];
    }

    /** Fails the test if anything was left unclaimed. */
    assertDrained() {
        expect(
            this.pending,
            `unexpected ${this.channel} output. Claim it with .expect(...) or explain it with .allow(...)`
        ).toEqual([]);
    }
}

export type Guard = {
    /** console.warn - the library's entire negative-path surface. */
    readonly warnings: Recorder;
    /** console.error. */
    readonly errors: Recorder;
    /** Uncaught exceptions and unhandled rejections. Async connectedCallbacks land here. */
    readonly uncaught: Recorder;
};

let active: Guard | null = null;

/**
 * Node's process object, reached through globalThis so this file needs no @types/node.
 *
 * jsdom does NOT dispatch `unhandledrejection` on window - measured: a rejected promise reaches
 * `process.on('unhandledRejection')` and nothing else. Since an async connectedCallback that throws
 * surfaces as exactly that, listening only on window would silently record nothing and make
 * `expect(uncaught.seen).toEqual([])` a vacuous assertion.
 */
type NodeProcess = {
    on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
    off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};

const nodeProcess = (globalThis as { process?: NodeProcess }).process;

/**
 * The guard installed for the running test, so other helpers can enrich a diagnostic.
 *
 * @returns The active guard, or `null` outside a guarded test.
 */
export const currentGuard = () => active;

/**
 * Installs the console and error guard for the surrounding suite. Any `console.warn`,
 * `console.error`, uncaught exception or unhandled rejection that a test does not explicitly claim
 * fails that test.
 *
 * This is load bearing rather than convenient. The library reports every misuse through
 * console.warn - it never throws and never rejects - so the warning IS the assertion for a whole
 * class of behavior, and an unclaimed warning is how a test silently stops meaning anything.
 * Three examples that are untestable without it:
 *
 * - A component element outside <pc-entity>: the only observable difference from correct placement
 *   is one warning plus `component === null`.
 * - <pc-scene> inside a <div> throws from an async connectedCallback, so expect().toThrow() cannot
 *   see it. Custom element reactions are reported, not propagated.
 * - ScriptRegistry.add warns from a setTimeout on a duplicate script name, i.e. during a LATER
 *   test. Draining attributes the leak to the test that caused it.
 *
 * @returns The guard. Its recorders are replaced before each test.
 */
export const useGuard = (): Guard => {
    const warnings = new Recorder('warn');
    const errors = new Recorder('error');
    const uncaught = new Recorder('uncaught');

    const guard: Guard = { warnings, errors, uncaught };

    let onError: ((event: ErrorEvent) => void) | undefined;
    let onRejection: ((reason: unknown) => void) | undefined;

    /**
     * Teardown runs as a cleanup function returned from beforeEach, NOT as an afterEach.
     *
     * This is load bearing. Vitest runs hooks in this order (measured):
     *
     *   1. the test body
     *   2. afterEach registered in this describe
     *   3. afterEach registered at module scope - which is where test/helpers/dom.ts unmounts
     *      the DOM, and therefore where <pc-app> is disconnected and destroyed
     *   4. cleanup functions returned from beforeEach
     *
     * An afterEach here would assert at step 2, before anything is torn down, so every warning
     * and unhandled rejection produced BY teardown would escape - and because beforeEach resets
     * the recorders, it would vanish silently rather than failing anything. Teardown is exactly
     * where this library is most fragile: disconnecting a <pc-app> before its children is what
     * makes an in-flight connectedCallback dereference a destroyed app.
     *
     * Returning the cleanup from beforeEach moves the assertion to step 4, after teardown, so the
     * console spies and window listeners are still installed while the DOM is being dismantled.
     * Verified: a warning emitted during step 3 is invisible at step 2 and recorded at step 4.
     *
     * Restoration of the spies themselves is left to `restoreMocks: true` in vitest.config.ts,
     * which Vitest applies after this cleanup - so the spies stay live for the whole teardown.
     */
    const teardown = () => {
        if (typeof window !== 'undefined' && onError) {
            window.removeEventListener('error', onError);
        }
        if (onRejection) {
            nodeProcess?.off('unhandledRejection', onRejection);
        }
        active = null;

        warnings.assertDrained();
        errors.assertDrained();
        uncaught.assertDrained();
    };

    beforeEach(() => {
        warnings.reset();
        errors.reset();
        uncaught.reset();
        active = guard;

        vi.spyOn(console, 'warn').mockImplementation((...args) => warnings.record(format(args)));
        vi.spyOn(console, 'error').mockImplementation((...args) => errors.record(format(args)));

        // Rejections arrive on process, not on window - see the note on nodeProcess above. This is
        // what an async connectedCallback that throws turns into.
        onRejection = (reason) => {
            uncaught.record((reason as Error)?.message ?? String(reason));
        };
        nodeProcess?.on('unhandledRejection', onRejection);

        // A synchronous throw inside a custom element reaction IS reported on window, so both
        // channels are needed. The unit project runs in node, where there is no window.
        if (typeof window !== 'undefined') {
            onError = (event) => {
                event.preventDefault();
                uncaught.record(event.error?.message ?? event.message);
            };
            window.addEventListener('error', onError);
        }

        return teardown;
    });

    return guard;
};
