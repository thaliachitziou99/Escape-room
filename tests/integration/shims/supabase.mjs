// A tiny stand-in for @supabase/supabase-js that talks to a REAL Postgres through psql. It implements only the query-builder
// calls the app's routes use. SQL is generated from the builder, so every route runs its real queries against the real schema.
import { execFileSync } from 'node:child_process';

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const id = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"`; };
const EMBED_FK = { game_sessions: { stories: 'story_id' } };

export function run(sql, role = null) {
  const db = process.env.E13_IT_DB;
  if (role) sql = `set role ${role}; ${sql}`; // the publishable key must go through RLS, exactly like Supabase's anon role
  try {
    const out = execFileSync('psql', ['-X', '-qtA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { out };
  } catch (e) {
    const msg = String(e.stderr ?? e.message).replace(/^ERROR:\s+/m, '').split('\n')[0];
    return { error: { message: msg, code: /duplicate key/.test(msg) ? '23505' : /violates/.test(msg) ? '23503' : 'P0001' } };
  }
}

function selectList(table, cols) {
  if (!cols || cols === '*') return '*';
  const parts = []; let depth = 0, cur = '';
  for (const ch of cols) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  return parts.map((p) => {
    p = p.trim();
    const m = /^(\w+)\((.*)\)$/.exec(p);
    if (!m) return id(p);
    const fk = EMBED_FK[table]?.[m[1]];
    if (!fk) throw new Error(`embed ${m[1]} on ${table} not supported by the test shim`);
    return `(select to_json(r) from (select ${selectList(m[1], m[2])} from ${id(m[1])} e where e.id = t.${id(fk)}) r) as ${id(m[1])}`;
  }).join(', ');
}

class Query {
  constructor(table, role) { this.role = role; this.t = table; this.op = 'select'; this.cols = '*'; this.f = []; this.vals = null; this.one = null; this.ret = false; this.ord = ''; this.lim = ''; }
  select(c = '*') { this.cols = c; if (this.op !== 'select') this.ret = true; return this; }
  insert(v) { this.op = 'insert'; this.vals = v; return this; }
  update(v) { this.op = 'update'; this.vals = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push(`${id(c)} = ${lit(v)}`); return this; }
  is(c, v) { this.f.push(`${id(c)} is ${v === null ? 'null' : lit(v)}`); return this; }
  in(c, arr) { this.f.push(`${id(c)} in (${arr.map(lit).join(',')})`); return this; }
  lt(c, v) { this.f.push(`${id(c)} < ${lit(v)}`); return this; }
  order(c, o = {}) { this.ord += `${this.ord ? ',' : ' order by'} ${id(c)} ${o.ascending === false ? 'desc' : 'asc'}`; return this; }
  limit(n) { this.lim = ` limit ${Number(n)}`; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'one'; return this; }
  then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
  exec() {
    const where = this.f.length ? ` where ${this.f.join(' and ')}` : '';
    let sql;
    if (this.op === 'select') sql = `select coalesce(json_agg(r), '[]'::json) from (select ${selectList(this.t, this.cols)} from ${id(this.t)} t${where}${this.ord}${this.lim}) r`;
    else {
      const returning = this.ret ? ` returning ${this.cols === '*' ? '*' : selectList(this.t, this.cols)}` : ' returning 1 as _';
      let stmt;
      if (this.op === 'insert') {
        const rows = Array.isArray(this.vals) ? this.vals : [this.vals];
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        stmt = `insert into ${id(this.t)} (${keys.map(id).join(',')}) values ${rows.map((r) => `(${keys.map((k) => lit(r[k])).join(',')})`).join(',')}${returning}`;
      } else if (this.op === 'update') stmt = `update ${id(this.t)} set ${Object.entries(this.vals).map(([k, v]) => `${id(k)} = ${lit(v)}`).join(', ')}${where}${returning}`;
      else stmt = `delete from ${id(this.t)}${where}${returning}`;
      sql = `with x as (${stmt}) select coalesce(json_agg(x), '[]'::json) from x`;
    }
    const { out, error } = run(sql, this.role);
    if (error) return { data: null, error };
    let rows = JSON.parse(out);
    if (this.op !== 'select' && !this.ret) return { data: null, error: null };
    if (this.one) {
      if (rows.length > 1 || (this.one === 'one' && rows.length === 0)) return { data: null, error: { message: 'single row expected', code: 'PGRST116' } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

export function createClient(_url, key) {
  const role = key && key === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'anon' : null;
  return {
    from: (t) => new Query(t, role),
    rpc: (fn, args = {}) => {
      const named = Object.entries(args).map(([k, v]) => `${id(k)} => ${lit(v)}`).join(', ');
      const { out, error } = run(`select to_json(${id(fn)}(${named}))`, role);
      return Promise.resolve(error ? { data: null, error } : { data: out === '' ? null : JSON.parse(out), error: null });
    },
  };
}
