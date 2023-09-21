import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';

export default {
    input: 'src/index.mjs',  // your entry point
    output: [
        {
            file: 'dist/playdom.mjs',
            format: 'esm',  // ES module
            sourcemap: true  // Optional: generate a source map
        },
        {
            file: 'dist/playdom.cjs',
            format: 'cjs',  // CommonJS format
            sourcemap: true
        },
        {
            file: 'dist/playdom.js',
            name: 'pd',  // name of the global variable for browsers
            format: 'umd',  // UMD format
            sourcemap: true
        },
        {
            file: 'dist/playdom.min.js',
            name: 'pd',
            format: 'umd',
            plugins: [terser()]  // Minify this build
        }
    ],
    plugins: [
        resolve(),
        commonjs(),
        babel({
            exclude: 'node_modules/**',  // only transpile our source code
            babelHelpers: 'bundled',
            presets: ['@babel/preset-env']
        })
    ]
};
