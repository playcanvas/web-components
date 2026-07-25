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
            // dist/pwc.mjs is a build output, so it is absent when linting an unbuilt checkout
            'import/no-unresolved': ['error', { ignore: ['/dist/pwc\\.mjs$'] }]
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.browser,
                AddEventListenerOptions: "readonly",
                EventListener: "readonly",
                EventListenerOptions: "readonly",
                HTMLElementTagNameMap: "readonly"
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
            ...tsPlugin.configs['recommended'].rules,
            // TypeScript function overloads are not redeclarations (tsc catches real ones)
            'no-redeclare': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off'
        }
    }
];
