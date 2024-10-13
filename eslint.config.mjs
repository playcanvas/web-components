import playcanvasConfig from '@playcanvas/eslint-config';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
    ...playcanvasConfig,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json'
            },
            globals: {
                ...globals.browser,
                ...globals.mocha,
                ...globals.node
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            ...tsPlugin.configs['recommended'].rules
        }
    }
];
