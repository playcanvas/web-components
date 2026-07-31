# Tests

Four tiers, three of which run in Node with jsdom and need neither a build nor a browser.

| Tier | Command | Environment | Covers |
|---|---|---|---|
| Unit | `npm run test:unit` | `node` | The pure parsers in `src/utils.ts` and the `CSS_COLORS` table |
| Elements | `npm run test:elements` | `jsdom` | Attribute and property surface, with no engine created |
| Integration | `npm run test:integration` | `jsdom` | A real `AppBase` on `NullGraphicsDevice`, via `<pc-app backend="null">` |
| Browser | *(not yet implemented)* | Chromium | The built `dist/` bundle and the example pages |

`npm test` runs the three Node tiers. `npm run test:watch` watches them, and
`npm run test:coverage` adds a v8 report under `coverage/`.

## Why the library is testable headlessly

`<pc-app>` accepts `backend="null"`, which `src/app.ts` maps to PlayCanvas's `NullGraphicsDevice` —
a pure-JS `GraphicsDevice` that never calls `getContext`. A complete application, entity hierarchy
and component set therefore boots in jsdom in a few milliseconds with no GPU.

**Always use `backend="null"`.** Any other backend makes `createGraphicsDevice` construct a
`WebglGraphicsDevice`, which throws synchronously because jsdom's `getContext` returns `null`. That
throw escapes the engine's per-attempt `.catch()` (the attempt is invoked as the *argument* to
`Promise.resolve`, before the handler is attached), so the promise rejects instead of falling back to
the null device, and `connectedCallback` turns it into an unhandled rejection. `bootApp()` enforces
this.

## Rules that come from how the library behaves

**Nothing ever rejects.** No `AsyncElement` rejects its ready promise. A misplaced element logs a
`console.warn` and returns a promise that *never settles*. Two consequences:

- Every wait goes through `readyWithin()`, never a bare `await element.ready()`. On timeout it
  reports connection state, `closestApp`, `closestEntity`, `hierarchyReady` and every warning seen
  so far, instead of a bare 10-second timeout.
- Negative cases are asserted with the console guard or `expectNeverReady()`, never with
  `expect(...).toThrow()`.

**Warnings are assertions.** Every suite that mounts anything calls `useGuard()`. Tests *claim* the
messages they expect with `warnings.expect(pattern)`; anything left unclaimed fails the test. This is
what makes the misuse paths a contract — add a warning to the library and exactly the tests that
walk that path break. Use `warnings.allow(...)` for messages that are expected but not the point of
the test, and `ignoreRest()` only with a comment saying why.

The guard also records uncaught exceptions and unhandled rejections. Async `connectedCallback`s and
custom element reactions are *reported*, not propagated, so `guard.uncaught` is the only way to see
them. Do not install a global handler that swallows them — one such rejection is how the
`sound-slot.ts` teardown bug was found.

**The guard asserts from a cleanup function returned by `beforeEach`, not from an `afterEach`. Do
not "simplify" that.** Vitest's measured hook order is: test body → `afterEach` registered in the
describe → `afterEach` registered at module scope (where `dom.ts` unmounts the DOM and destroys the
app) → cleanup functions returned from `beforeEach`. An `afterEach` would therefore assert *before*
teardown, so anything teardown emits would escape — and since `beforeEach` resets the recorders, a
teardown warning would vanish silently rather than fail. Teardown is where this library is most
fragile, so the assertion has to come last. Spy restoration is left to `restoreMocks: true` in
`vitest.config.ts`, which Vitest applies after the cleanup, keeping the spies live throughout
teardown.

**Mount detached, insert once.** `mount()` builds the subtree on a detached container and appends it
in a single operation, so every `connectedCallback` runs with the full subtree present. That matches
production, where `pwc.mjs` is a deferred module script and elements upgrade with their children
already parsed. Filling an already-connected container would connect `<pc-app>` before its children
and its boot queries would find nothing.

**Settle before tearing down.** `<pc-app>` resolves its own ready promise from inside the
`app.preload()` callback, *before* its descendants' async `connectedCallback`s have finished. So
`bootApp()` awaits `settle()` over the whole subtree, not just the app. Removing a tree in that
window makes `addComponent` and `addSlot` dereference nulls.

**Per-file isolation is mandatory.** `src/` performs 27 `customElements.define()` calls at module
scope and a second define for the same tag throws. Vitest's default per-file isolation gives each
file a fresh realm and module graph; never run with `--no-isolate`. Isolation *between tests* is by
fresh DOM subtree, which `test/helpers/dom.ts` handles in `afterEach`.

**Clean up completely.** `AssetElement.get`, `MaterialElement.get`, `getEntity` and the picker's
`pc-entity[name=...]` reverse lookup are all document-global and string-keyed, so a leaked element
silently changes another test's result. `mount()` calls `assertDocumentClean()` on entry so a leak is
attributed to the test that caused it.

## Known bugs

When a test documents a defect, pin the **actual** behaviour in an `it(...)` whose title ends
`(known bug #NNN)`, with a comment naming the file, line and root cause, and add an `it.todo(...)`
stating the intended behaviour beside it.

Do **not** use `it.fails()` — it passes for *any* failure, so it silently absorbs an unrelated
regression on the same path, and it cannot see errors that are reported rather than thrown. Do not
use bare `it.skip` either; it rots invisibly. This convention keeps the suite green, describes the
defect executably, and makes the fix a one-line flip.

## Style

- One test module per source module, mirroring the path: `src/components/camera-component.ts` →
  `test/integration/components/camera-component.test.ts`.
- Outer `describe` is the **tag** in angle brackets — `describe('<pc-camera>')` — because that is how
  users refer to it. Use the class name only for tests of the TypeScript API surface.
- Second level is the member as the user writes it: `describe('[clear-color]')` for attributes,
  `describe('#component')` for properties and methods.
- `it` reads as a sentence: *"falls back to the default when the value is not a finite number"*, not
  *"default is returned"*.
- Explicit imports from `vitest` — `globals` is off in `vitest.config.ts`, matching `src/`'s style.
- Arrow functions in `describe`/`it` are fine. The engine repo forbids them because Mocha exposes
  `this`; Vitest does not, so the ban would be cargo cult here. This is a deliberate divergence.
- `test.for` over `test.each`, so the case arrives typed.
- `expect.soft` inside table-driven cases, so one broken attribute reports every finding in a single
  run. Fail fast everywhere else.
- Alphabetise members, except in table-driven suites where the order comes from
  `observedAttributes` — the source of truth. Re-sorting would make failures harder to correlate.

## Environment notes

`test/setup/dom.ts` fixes exactly one real jsdom gap and deliberately leaves others alone.

jsdom has no layout engine, so `clientWidth`, `clientHeight` and `getBoundingClientRect` are
constant zeros. `AppElement` feeds `clientWidth` to `setCanvasResolution(RESOLUTION_AUTO)`, so
without a stub the device comes up 0×0 and every derived aspect ratio is `NaN` — which passes a
naive `toBeDefined()` assertion. The stub goes on `HTMLCanvasElement.prototype` rather than per
canvas (as the engine's own tests do) because `AppElement` creates its canvas internally, so no test
can reach it first. `test/integration/environment.test.ts` asserts the exact resulting dimensions; if
that file is red, treat every other integration result as unreliable.

Not polyfilled, on purpose: `ResizeObserver` (unused by the engine and by `src/`), `navigator.xr`
(absent is the correct headless answer; a stub sends `XrManager` down paths jsdom cannot honour), and
`AudioContext` (absent means `SoundManager.context` is `null`, and sound slots still work). The
`canvas` npm package is **not** a dependency — it implements 2D drawing, not layout, and the null
device never asks for a context.

Integration tests use **no preload assets**. `app.preload()` short-circuits synchronously when the
asset list is empty, so `bootApp()` performs no I/O. An unreachable asset URL does not fail, it hangs
`<pc-app>` forever. When a real load is needed, use a `data:` URI.
