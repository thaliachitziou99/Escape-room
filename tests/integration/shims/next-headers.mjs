// The test sets globalThis.__jar (Map name -> value) before calling a route handler.
export async function cookies() {
  const jar = globalThis.__jar ?? new Map();
  return { get: (n) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined), getAll: () => [...jar].map(([name, value]) => ({ name, value })), set() {} };
}
