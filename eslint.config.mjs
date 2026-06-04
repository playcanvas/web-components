import typescriptConfig from '@playcanvas/eslint-config/typescript';
import globals from 'globals';

export default [
    ...typescriptConfig,
    {
        files: ['examples/js/**/*.mjs', 'examples/assets/scripts/**/*.mjs'],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        },
        rules: {
            // The package self-import resolves to dist/pwc.mjs, a build output that is absent
            // when linting an unbuilt checkout
            'import/no-unresolved': ['error', { ignore: ['^@playcanvas/web-components$'] }]
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        settings: {
            'import/resolver': {
                typescript: {
                    // tsconfig.test.json is the program that covers test/, so without it here
                    // import/no-unresolved fails on every ../../src/... import from a test file
                    project: ['./tsconfig.json', './tsconfig.test.json']
                }
            }
        },
        rules: {
            // Disable the base rules that the TypeScript compiler already enforces
            ...tsPlugin.configs['flat/eslint-recommended'].rules,
            ...tsPlugin.configs['recommended'].rules,
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    },
    {
        // The '**/*.ts' block above already gives test files the TypeScript parser and browser
        // globals. This adds only the delta. Note there are no test-framework globals to declare:
        // vitest.config.ts sets `globals: false`, so every test imports describe/it/expect/vi
        // explicitly.
        files: ['test/**/*.ts', 'vitest.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    }
];
