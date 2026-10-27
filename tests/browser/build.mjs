import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sh = (n) => join(root, 'tests/browser/shims', n);
export async function bundle(outfile) {
  await build({
    entryPoints: [join(root, 'tests/browser/entry.tsx')], bundle: true, outfile, format: 'iife', jsx: 'automatic', target: 'es2022', sourcemap: 'inline',
    nodePaths: ['/home/claude/.npm-global/lib/node_modules'], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning',
    plugins: [{ name: 'alias', setup(b) {
      b.onResolve({ filter: /^motion\/react$/ }, () => ({ path: sh('motion.tsx') }));
      b.onResolve({ filter: /^qrcode$/ }, () => ({ path: sh('qrcode.ts') }));
      b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: sh('supabase-client.ts') }));
      b.onResolve({ filter: /^@\// }, (a) => b.resolve(join(root, 'src', a.path.slice(2)), { kind: a.kind, resolveDir: root }));
    } }],
    resolveExtensions: ['.tsx', '.ts', '.js'],
  });
}
