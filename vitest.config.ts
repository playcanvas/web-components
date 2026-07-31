import { defineConfig } from 'vitest/config';

/**
 * Shared jsdom options for the two DOM-backed projects.
 */
const jsdom = {
    /**
     * AppBase.requestAnimationFrame() calls the global rAF whenever platform.browser is true,
     * which it is under jsdom. Without pretendToBeVisual jsdom does not define rAF at all and
     * app.start() throws from inside the app.preload() callback - i.e. from a resource loader
     * callback, where nothing catches it. Vitest already defaults this to true; it is pinned
     * here so that a Vitest or jsdom default change cannot silently break the integration tier.
     */
    pretendToBeVisual: true,

    /**
     * Asset URLs resolve against this origin. Nothing listens on it, which is deliberate: an
     * unreachable asset does not fail, it hangs <pc-app> forever (measured: still pending after
     * 8s, because app.preload() gates readiness on every non-lazy asset). Integration tests
     * therefore use no preload assets at all, or data: URIs when a real load is required.
     */
    url: 'http://localhost:3000/'
};

export default defineConfig({
    test: {
        /**
         * Explicit `import { describe, it, expect } from 'vitest'` in every test file, matching
         * src/'s explicit-import style. Keeps the ESLint config honest (no injected globals to
         * declare) and avoids a global type-augmentation entry in tsconfig.test.json.
         */
        globals: false,

        /**
         * No AsyncElement ready promise ever rejects. A misplaced element logs a console.warn and
         * returns a promise that never settles, so a stuck element can only surface as a timeout.
         * Kept well above the measured 4-9ms cost of a full <pc-app backend="null"> boot.
         */
        testTimeout: 10000,
        hookTimeout: 10000,

        /**
         * src/ performs 27 customElements.define() calls at module scope, and a second define for
         * the same tag throws NotSupportedError. Per-file isolation - the default - gives each
         * test file a fresh realm AND a fresh module graph, which is the only thing that makes
         * those defines testable. Never run this suite with --no-isolate.
         */
        isolate: true,

        restoreMocks: true,
        unstubGlobals: true,

        projects: [
            {
                extends: true,
                test: {
                    /**
                     * Pure functions: the parsers in src/parse.ts and the CSS_COLORS table. No DOM
                     * at all - getEntity() touches document, so its tests live in `elements`.
                     */
                    name: 'unit',
                    environment: 'node',
                    include: ['test/unit/**/*.test.ts']
                }
            },
            {
                extends: true,
                test: {
                    /**
                     * Attribute and property surface. These import src/index.ts (and so run all 27
                     * defines) but never connect a <pc-app>, so no engine is ever created.
                     */
                    name: 'elements',
                    environment: 'jsdom',
                    environmentOptions: { jsdom },
                    setupFiles: ['./test/setup/dom.ts'],
                    include: ['test/elements/**/*.test.ts']
                }
            },
            {
                extends: true,
                test: {
                    /** Boots a real AppBase on NullGraphicsDevice via <pc-app backend="null">. */
                    name: 'integration',
                    environment: 'jsdom',
                    environmentOptions: { jsdom },
                    setupFiles: ['./test/setup/dom.ts'],
                    include: ['test/integration/**/*.test.ts'],
                    testTimeout: 15000
                }
            }
        ],

        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',

            /**
             * The v8 provider only reports files it actually loaded, so the source set has to be
             * named explicitly - otherwise a module with no tests at all is simply absent from the
             * report rather than showing 0%, and the headline number flatters.
             */
            include: ['src/**/*.ts'],

            reportOnFailure: true

            // thresholds: deliberately absent until the suite has enough content to measure a
            // floor from. See the plan's coverage section for the ratchet strategy.
        }
    }
});
