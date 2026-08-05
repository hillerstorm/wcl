import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __cr } from 'module';
const require = __cr(import.meta.url);`,
  },
  packages: 'bundle',
  sourcemap: 'inline',
});

await chmod('dist/cli.js', 0o755);
console.log('Built dist/cli.js');
