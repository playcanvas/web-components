import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';

export default {
    input: 'src/index.mjs',
    output: [
        {
            file: 'dist/playdom.mjs',
            format: 'esm',
            sourcemap: true
        },
        {
            file: 'dist/playdom.cjs',
            format: 'cjs',
            sourcemap: true
        },
        {
            file: 'dist/playdom.js',
            name: 'pd',
            format: 'umd',
            sourcemap: true
        },
        {
            file: 'dist/playdom.min.js',
            name: 'pd',
            format: 'umd',
            plugins: [terser()]
        }
    ],
    plugins: [
        resolve(),
        commonjs(),
        babel({
            exclude: 'node_modules/**',
            babelHelpers: 'bundled',
            presets: ['@babel/preset-env']
        })
    ],
    external: ['playcanvas']
};
