import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  clean: true,
  minify: true,
  target: 'node18',
  platform: 'node',
  noExternal: [/.*/], // 打包所有 node_modules 依赖
  external: [
    'fs',
    'path',
    'url',
    'http',
    'https',
    'stream',
    'crypto',
    'util',
    'os',
    'child_process',
    'net',
    'tls',
    'dns',
    'events',
    'buffer',
    'process',
  ],
  shims: true,
  splitting: false,
  sourcemap: false,
  outExtension() {
    return {
      js: `.cjs`,
    };
  },
});
