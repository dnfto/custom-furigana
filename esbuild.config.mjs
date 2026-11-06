import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import inlineWorkerPlugin from 'esbuild-plugin-inline-worker';

const production = process.argv[2] === 'production';
const external = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  ...builtinModules,
];

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [inlineWorkerPlugin()],
  external,
  format: 'cjs',
  target: 'es2021',
  logLevel: 'info',
  minify: production,
  sourcemap: production ? false : 'inline',
  outfile: 'main.js',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
