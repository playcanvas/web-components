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
            'import-x/no-unresolved': ['error', { ignore: ['^@playcanvas/web-components$'] }]
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        },
        rules: {
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    },
    {
        files: ['test/**/*.ts', 'vitest.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    }
];
