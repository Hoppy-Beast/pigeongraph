import { buildSync } from 'esbuild';
import { chmodSync } from 'node:fs';

buildSync({
  entryPoints: ['packages/pigeongraph-mcp/src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/cli.js',
  external: [
    'ajv',
    'ajv-formats',
    'graphology',
    'ws',
    'zod',
    'node:*',
  ],
});

try {
  chmodSync('dist/cli.js', 0o755);
} catch {}
console.log('✅ Standalone bundle compiled into dist/cli.js');
