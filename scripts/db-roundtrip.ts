// DB round trip: Room 13 (as editor rows) -> save_story_draft -> load_story_draft must come back identical, in the same order.
// Needs a scratch database with the migrations applied (see supabase/tests/run.sh). Usage: node scripts/db-roundtrip.ts <db>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { disassemble, assemble } from '../src/features/admin/assemble.ts';
import { canonicalJson } from '../src/features/admin/versioning.ts';
import { HOTEL_NOCTURNE } from '../src/features/game-engine/content/hotel-nocturne.ts';
import { HOTEL_SECRETS } from '../src/features/game-engine/content/hotel-nocturne.secrets.ts';

const db = process.argv[2] ?? 'e13_test';
const id = 'dddddddd-0000-4000-8000-0000000000d1';
const psql = (sql: string) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qtA', '-d', db, '-c', sql], { encoding: 'utf8' }).trim();
const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, strip(x)])) : v;

const rows = disassemble(HOTEL_NOCTURNE, HOTEL_SECRETS, { id, slug: 'rt-room-13' });

psql(`insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status) values ('${id}','rt-room-13','x','x','x','x',1,'draft')`);
const updatedAt = psql(`select updated_at from stories where id='${id}'`);
const file = '/var/tmp/pg16/roundtrip.sql';
writeFileSync(file, `select save_story_draft('${id}', $json$${JSON.stringify(rows)}$json$::jsonb, null, '${updatedAt}'::timestamptz);`);
execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-o', '/dev/null', '-d', db, '-f', file]);
const back = JSON.parse(psql(`select load_story_draft('${id}')`));
delete back.updatedAt;
const want = strip(rows) as Record<string, any>; // eslint-disable-line
// meta.status/slug are owned by the stories row, everything else must be identical
const same = canonicalJson(back) === canonicalJson({ ...want, meta: { ...want.meta, coverImageUrl: null } }) || canonicalJson(strip(back)) === canonicalJson(want);
const assembled = assemble(back);
const identical = canonicalJson(assembled.story) === canonicalJson(assemble(rows).story) && canonicalJson(assembled.secrets) === canonicalJson(HOTEL_SECRETS);
let stale = 'NOT TESTED';
try { psql(`select save_story_draft('${id}', '{}'::jsonb, null, '2000-01-01'::timestamptz)`); stale = 'NO_ERROR'; } catch (e) { stale = String((e as { stderr?: string }).stderr).includes('stale_draft') ? 'stale_draft' : 'other error'; }
console.log(JSON.stringify({ draftIdentical: same, assembledStoryIdentical: identical, staleSaveRefused: stale === 'stale_draft' }));
if (!same || !identical || stale !== 'stale_draft') process.exit(1);
