import playcanvasConfig from '@playcanvas/eslint-config';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
    ...playcanvasConfig,
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
            parser: tsParser,
            globals: {
                ...globals.browser
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        settings: {
            'import/resolver': {
                typescript: {}
            }
        },
        rules: {
            // Disable the base rules that the TypeScript compiler already enforces
            ...tsPlugin.configs['flat/eslint-recommended'].rules,
            ...tsPlugin.configs['recommended'].rules,
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off'
        }
    }
];
