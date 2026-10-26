const GREEK: Record<string, string> = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
/** Greek title -> URL slug. Always [a-z0-9-], 3..60 chars (or '' when nothing usable remains). */
export function slugify(title: string): string {
  const base = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const s = [...base].map((ch) => GREEK[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s;
}
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Pick a free slug by suffixing -2, -3... Collisions are ALSO enforced by a UNIQUE index in the database. */
export function uniqueSlug(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; i < 1000; i++) { const s = `${wanted}-${i}`; if (!taken.has(s)) return s; }
  throw new Error('no free slug');
}
