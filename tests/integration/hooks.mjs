// Resolves the app's "@/..." alias and extension-less imports, and swaps the packages we cannot install here
// (next, @supabase/supabase-js, jose, server-only) for small shims. The ROUTE CODE ITSELF IS THE REAL CODE.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shim = (n) => pathToFileURL(join(root, 'tests', 'integration', 'shims', n)).href;
const SHIMS = { 'server-only': 'empty.mjs', 'next/server': 'next-server.mjs', 'next/headers': 'next-headers.mjs', '@supabase/supabase-js': 'supabase.mjs', jose: 'jose.mjs' };
const exts = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const file = (p) => { for (const e of ['', ...exts]) { const f = p + e; if (existsSync(f) && statSync(f).isFile()) return f; } return null; };

export async function resolve(specifier, context, next) {
  if (SHIMS[specifier]) return { url: shim(SHIMS[specifier]), shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const f = file(join(root, 'src', specifier.slice(2)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file://') && context.parentURL.includes('/escape-room/src/')) {
    const f = file(join(dirname(fileURLToPath(context.parentURL)), specifier));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(specifier, context);
}
