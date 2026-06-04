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
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
                AddEventListenerOptions: 'readonly',
                EventListener: 'readonly',
                EventListenerOptions: 'readonly'
            }
        },
        rules: {
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    }
];
