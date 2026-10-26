// Minimal typings so the tests can be type-checked without @types/node (no network here).
declare module 'node:test' { const test: (name: string, fn: () => void | Promise<void>) => void; export default test; }
declare module 'node:assert/strict' {
  interface Assert {
    ok(v: unknown, m?: string): asserts v;
    equal(a: unknown, b: unknown, m?: string): void;
    notEqual(a: unknown, b: unknown, m?: string): void;
    deepEqual(a: unknown, b: unknown, m?: string): void;
    notDeepEqual(a: unknown, b: unknown, m?: string): void;
  }
  const assert: Assert;
  export default assert;
}
declare module 'node:fs' {
  export function existsSync(p: string | URL): boolean;
  export function readFileSync(p: string | URL, enc: 'utf8'): string;
  export function readdirSync(p: string | URL, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
}
