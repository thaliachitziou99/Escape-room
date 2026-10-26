import { guardApi } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fail, ok, UUID_RE } from '@/lib/security';
import { MEDIA_KINDS, RULES, storagePath, validateUpload, type MediaKind } from '@/features/admin/media';

const BUCKET = 'media-public';

export async function GET(req: Request) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const u = new URL(req.url); const kind = u.searchParams.get('kind'); const storyId = u.searchParams.get('storyId');
  let q = supabaseAdmin().from('media_assets').select('id,story_id,kind,url,mime,size_bytes,width,height,created_at').order('created_at', { ascending: false }).limit(300);
  if (kind && (MEDIA_KINDS as string[]).includes(kind)) q = q.eq('kind', kind);
  if (storyId && UUID_RE.test(storyId)) q = q.or(`story_id.is.null,story_id.eq.${storyId}`);
  const { data, error } = await q; return error ? fail('list_failed', 'Η φόρτωση απέτυχε.', 500) : ok({ assets: data });
}

export async function POST(req: Request) {
  const g = await guardApi(req, 'upload'); if ('res' in g) return g.res;
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 13 * 1024 * 1024) return fail('too_large', 'Το αρχείο είναι πολύ μεγάλο.', 413);
  let form: FormData; try { form = await req.formData(); } catch { return fail('bad_form', 'Μη έγκυρο αίτημα.', 400); }
  const file = form.get('file'), kind = String(form.get('kind') ?? ''), storyIdRaw = form.get('storyId');
  if (!(file instanceof File)) return fail('no_file', 'Δεν επιλέχθηκε αρχείο.', 400);
  const storyId = typeof storyIdRaw === 'string' && storyIdRaw ? storyIdRaw : null;
  if (storyId && !UUID_RE.test(storyId)) return fail('invalid_story', 'Μη έγκυρη ιστορία.', 400);
  if (kind in RULES && file.size > RULES[kind as MediaKind].maxBytes) return fail('too_large', 'Το αρχείο είναι πολύ μεγάλο.', 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload(kind, file.type || undefined, file.name, bytes); // by CONTENT: the client's type and name are only cross-checked
  if (!check.ok) return fail('invalid_file', check.message, 422);

  const db = supabaseAdmin();
  if (storyId && !(await db.from('stories').select('id').eq('id', storyId).maybeSingle()).data) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const path = storagePath(kind as MediaKind, storyId, crypto.randomUUID(), check.ext); // server-chosen: the user's file name never reaches storage
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: check.mime, upsert: false, cacheControl: '31536000' });
  if (up.error) return fail('upload_failed', 'Η μεταφόρτωση απέτυχε.', 500);
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await db.from('media_assets').insert({ story_id: storyId, kind, bucket: BUCKET, path, url, mime: check.mime, size_bytes: bytes.length, width: check.width ?? null, height: check.height ?? null, uploaded_by: g.ctx.userId }).select('id,url,kind,width,height').single();
  if (error) { await db.storage.from(BUCKET).remove([path]); return fail('upload_failed', 'Η μεταφόρτωση απέτυχε.', 500); }
  return ok({ asset: data }, 201);
}
