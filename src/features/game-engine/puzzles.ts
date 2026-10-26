import type { PuzzleAnswer, PuzzleConfig, PuzzleDefinition, PuzzleSecret, StoryDefinition, StorySecrets } from './types.ts';

export type Check = 'correct' | 'incorrect' | 'malformed' | 'missing_evidence';

export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const isStrArr = (a: unknown): a is string[] => Array.isArray(a) && a.every((x) => typeof x === 'string');
const isPerm = (a: string[], ids: string[]): boolean => a.length === ids.length && new Set(a).size === a.length && a.every((x) => ids.includes(x));
const sameArr = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Size/shape limits applied to untrusted answers before they reach the engine. */
export function sanitizeAnswer(a: unknown): PuzzleAnswer | null {
  if (typeof a === 'string') return a.length <= 200 ? a : null;
  if (isStrArr(a)) return a.length <= 20 && a.every((x) => x.length <= 64) ? a : null;
  if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
    const e = Object.entries(a as Record<string, unknown>);
    return e.length <= 20 && e.every(([k, v]) => k.length <= 64 && typeof v === 'string' && v.length <= 64) ? (a as Record<string, string>) : null;
  }
  return null;
}

/** Server-side only: compares an answer to the secret solution. */
export function checkAnswer(p: PuzzleDefinition, sec: PuzzleSecret, a: unknown, clues: readonly string[]): Check {
  const cfg = p.config, sol = sec.solution;
  switch (cfg.type) {
    case 'contextual': return 'malformed';
    case 'numeric':
      if (typeof a !== 'string' || !/^\d+$/.test(a) || a.length !== cfg.length) return 'malformed';
      return a === sol ? 'correct' : 'incorrect';
    case 'sequence': {
      const ids = cfg.controls.map((c) => c.id);
      if (!isStrArr(a) || a.length !== cfg.length || !a.every((x) => ids.includes(x))) return 'malformed';
      return Array.isArray(sol) && sameArr(a, sol) ? 'correct' : 'incorrect';
    }
    case 'symbol': {
      if (typeof a !== 'object' || a === null || Array.isArray(a) || typeof sol !== 'object' || Array.isArray(sol)) return 'malformed';
      const r = a as Record<string, unknown>, symIds = cfg.symbols.map((s) => s.id);
      if (!cfg.slots.every((s) => typeof r[s.id] === 'string' && symIds.includes(r[s.id] as string)) || Object.keys(r).length !== cfg.slots.length) return 'malformed';
      return cfg.slots.every((s) => r[s.id] === (sol as Record<string, string>)[s.id]) ? 'correct' : 'incorrect';
    }
    case 'cipher':
      if (typeof a !== 'string') return 'malformed';
      if (cfg.mode === 'choice') {
        if (!(cfg.options ?? []).some((o) => o.id === a)) return 'malformed';
        return a === sol ? 'correct' : 'incorrect';
      }
      return typeof sol === 'string' && normalizeText(a) === normalizeText(sol) ? 'correct' : 'incorrect';
    case 'assembly':
      if (!isStrArr(a) || !isPerm(a, cfg.fragments.map((f) => f.id))) return 'malformed';
      return Array.isArray(sol) && sameArr(a, sol) ? 'correct' : 'incorrect';
    case 'evidence':
      if (!cfg.events.every((e) => clues.includes(e.requiresClue))) return 'missing_evidence';
      if (!isStrArr(a) || !isPerm(a, cfg.events.map((e) => e.id))) return 'malformed';
      return Array.isArray(sol) && sameArr(a, sol) ? 'correct' : 'incorrect';
  }
}

/** The ONLY puzzle data a browser receives: what is needed to render and play. No solution, no hints. */
export function publicPuzzle(p: PuzzleDefinition): { id: string; title: string; description: string; type: PuzzleConfig['type']; config: PuzzleConfig } {
  return { id: p.id, title: p.title, description: p.description, type: p.config.type, config: p.config };
}

/** Validates secrets against the puzzle definitions (solution shape, hint count). */
export function validateSecrets(story: StoryDefinition, secrets: StorySecrets): string[] {
  const errs: string[] = [];
  for (const p of story.puzzles) {
    const s = secrets[p.id], w = `puzzle ${p.id}`;
    if (!s) { errs.push(`${w}: missing secret`); continue; }
    if (!Array.isArray(s.hints) || s.hints.length !== 3 || s.hints.some((h) => typeof h !== 'string' || !h)) errs.push(`${w}: needs exactly 3 hints`);
    const c = p.config;
    const ok = (() => {
      switch (c.type) {
        case 'numeric': return typeof s.solution === 'string' && /^\d+$/.test(s.solution) && s.solution.length === c.length;
        case 'sequence': return isStrArr(s.solution) && isStrArr(s.solution) && s.solution.length === c.length && s.solution.every((x) => c.controls.some((k) => k.id === x));
        case 'symbol': { const r = s.solution as Record<string, string>; return typeof r === 'object' && !Array.isArray(r) && c.slots.every((sl) => c.symbols.some((y) => y.id === r[sl.id])); }
        case 'cipher': return typeof s.solution === 'string' && (c.mode === 'text' || (c.options ?? []).some((o) => o.id === s.solution));
        case 'assembly': return isStrArr(s.solution) && isPerm(s.solution, c.fragments.map((f) => f.id));
        case 'evidence': return isStrArr(s.solution) && isPerm(s.solution, c.events.map((e) => e.id));
        case 'contextual': return true;
      }
    })();
    if (!ok) errs.push(`${w}: solution does not match puzzle type`);
  }
  for (const id of Object.keys(secrets)) if (!story.puzzles.some((p) => p.id === id)) errs.push(`secret ${id}: no such puzzle`);
  return errs;
}
