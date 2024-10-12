import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
    input: 'src/index.ts',
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
            sourcemap: true,
            globals: { playcanvas: 'pc' }
        },
        {
            file: 'dist/playdom.min.js',
            name: 'pd',
            format: 'umd',
            sourcemap: true,
            plugins: [terser()],
            globals: { playcanvas: 'pc' }
        }
    ],
    plugins: [
        resolve(),
        commonjs(),
        typescript({
            tsconfig: './tsconfig.json', // Path to your tsconfig.json
            declaration: true,
            declarationDir: './dist',
            sourceMap: true
        })
    ],
    external: ['playcanvas']
};