// Bundles source/main.ts into a single, dependency-free dist/main.js — a plain `tsc` compile
// leaves `require('jszip')`/`require('typescript')` unresolved in the output, which only works if
// node_modules ships alongside the extension. Bundling means sharing the extension is just "copy
// the folder" (minus source/node_modules), no npm install step required on the receiving end.
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

// Type-check first — esbuild only transpiles, it doesn't type-check, so this is the only place
// type errors would otherwise get caught.
execFileSync('npx', ['tsc', '--noEmit'], { cwd: root, stdio: 'inherit', shell: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'source/main.ts')],
  outfile: path.join(root, 'dist/main.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  sourcemap: 'inline',
});

console.log('[cocos-playground] bundled dist/main.js');
