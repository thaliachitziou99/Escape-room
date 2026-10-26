import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assemble, duplicateDraft } from '@/features/admin/assemble';
import { blankDraft } from '@/features/admin/ops';
import { parseDraft } from '@/features/admin/parse';
import { slugify, uniqueSlug } from '@/features/admin/slug';
import { validateForPublish, type ValidationReport } from '@/features/admin/publish-validation';
import { contentHash } from '@/features/admin/versioning';
import { assetReferences } from '@/features/admin/media';
import type { DraftRows, StoryStatus } from '@/features/admin/types';

export type Loaded = { draft: DraftRows; updatedAt: string };

export async function loadDraft(storyId: string): Promise<Loaded | null> {
  const { data, error } = await supabaseAdmin().rpc('load_story_draft', { p_story: storyId });
  if (error || !data) return null;
  const { updatedAt, ...rest } = data as DraftRows & { updatedAt: string };
  const p = parseDraft({ ...rest, meta: { ...rest.meta, coverImageUrl: rest.meta.coverImageUrl ?? null }, items: rest.items ?? [], journal: rest.journal ?? [] }, storyId);
  if (!p.ok) return null;
  return { draft: { ...p.draft, meta: { ...p.draft.meta, status: rest.meta.status } }, updatedAt };
}

export async function saveDraft(storyId: string, draft: DraftRows, actor: string, expectedUpdatedAt: string) {
  const { data, error } = await supabaseAdmin().rpc('save_story_draft', { p_story: storyId, p_draft: draft, p_actor: actor, p_expected_updated_at: expectedUpdatedAt });
  if (error) return { ok: false as const, code: error.message.includes('stale_draft') ? 'stale_draft' : error.message.includes('foreign key') ? 'bad_reference' : 'save_failed' };
  return { ok: true as const, updatedAt: data as string };
}

export async function createStory(actor: string, title: string): Promise<{ ok: true; id: string; slug: string } | { ok: false; message: string }> {
  const db = supabaseAdmin();
  const base = slugify(title) || 'nea-istoria';
  const { data: taken } = await db.from('stories').select('slug').like('slug', `${base}%`);
  const slug = uniqueSlug(base, new Set((taken ?? []).map((r: any) => r.slug)));
  const d = blankDraft(crypto.randomUUID(), slug, title);
  // The UNIQUE index on slug is the real guard: two concurrent creates cannot both win.
  const { error } = await db.from('stories').insert({ id: d.meta.id, slug, title, description: '', genre: '', difficulty: 'Μέτρια', estimated_minutes: 30, status: 'draft', created_by: actor, updated_by: actor });
  if (error) return { ok: false, message: error.code === '23505' ? 'Το slug χρησιμοποιείται ήδη. Δοκίμασε ξανά.' : 'Η δημιουργία απέτυχε.' };
  return { ok: true, id: d.meta.id, slug };
}

export async function duplicateStory(storyId: string, actor: string): Promise<{ ok: true; id: string; slug: string } | { ok: false; message: string }> {
  const src = await loadDraft(storyId); if (!src) return { ok: false, message: 'Η ιστορία δεν βρέθηκε.' };
  const created = await createStory(actor, `${src.draft.meta.title} (αντίγραφο)`); if (!created.ok) return created;
  const copy = duplicateDraft(src.draft, created.id, created.slug);
  const fresh = await loadDraft(created.id); if (!fresh) return { ok: false, message: 'Η αντιγραφή απέτυχε.' };
  const r = await saveDraft(created.id, copy, actor, fresh.updatedAt);
  return r.ok ? created : { ok: false, message: 'Η αντιγραφή απέτυχε.' };
}

/** Assets the story may reference: every media_assets url (shared or belonging to this story) plus the built-in placeholder art. */
async function knownAssets(storyId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from('media_assets').select('url,story_id').or(`story_id.is.null,story_id.eq.${storyId}`);
  return new Set((data ?? []).map((r: any) => r.url as string));
}

export async function validateStoryById(storyId: string): Promise<{ report: ValidationReport } | null> {
  const l = await loadDraft(storyId); if (!l) return null;
  const { story, secrets } = assemble(l.draft);
  const known = await knownAssets(storyId);
  for (const r of story.rooms) if (r.placeholderArt) known.add(r.backgroundAsset); // documented placeholder art is allowed (and warned about)
  for (const i of story.items) if (i.imageAsset.startsWith('/art/')) known.add(i.imageAsset);
  return { report: validateForPublish(story, secrets, { slug: l.draft.meta.slug, knownAssets: known }) };
}

export async function publishStory(storyId: string, actor: string): Promise<{ ok: true; versionId: string } | { ok: false; report?: ValidationReport; message?: string }> {
  const l = await loadDraft(storyId); if (!l) return { ok: false, message: 'Η ιστορία δεν βρέθηκε.' };
  const v = await validateStoryById(storyId);
  if (!v || !v.report.ok) return { ok: false, report: v?.report };
  const { story, secrets } = assemble(l.draft);
  const { data, error } = await supabaseAdmin().rpc('publish_story', { p_story_id: storyId, p_content: story, p_secrets: secrets, p_hash: contentHash(story, secrets), p_actor: actor });
  if (error) return { ok: false, message: 'Η δημοσίευση απέτυχε.' };
  return { ok: true, versionId: data as string };
}

export async function setStatus(storyId: string, actor: string, to: Extract<StoryStatus, 'draft' | 'in_review' | 'archived'>): Promise<boolean> {
  const db = supabaseAdmin();
  const action = to === 'archived' ? 'archive' : to === 'in_review' ? 'submit_review' : 'restore';
  const { data: s } = await db.from('stories').select('status,published_version_id').eq('id', storyId).maybeSingle();
  if (!s) return false;
  // An unpublished edit never takes a live story offline by accident: only archive does.
  if (s.status === 'published' && to !== 'archived') return false;
  const { error } = await db.from('stories').update({ status: to === 'draft' && s.published_version_id ? 'published' : to, updated_by: actor }).eq('id', storyId);
  if (!error) await db.from('publication_history').insert({ story_id: storyId, version_id: s.published_version_id, action, actor });
  return !error;
}

export async function dashboardStats() {
  const db = supabaseAdmin();
  const count = async (t: string, f?: (q: any) => any) => { const q = db.from(t).select('*', { count: 'exact', head: true }); const { count: c } = await (f ? f(q) : q); return c ?? 0; }; // eslint-disable-line
  const [total, published, drafts, rooms, puzzles, recent] = await Promise.all([
    count('stories'), count('stories', (q) => q.eq('status', 'published')), count('stories', (q) => q.in('status', ['draft', 'in_review'])),
    count('rooms'), count('puzzles'),
    db.from('stories').select('id,title,status,updated_at').order('updated_at', { ascending: false }).limit(8),
  ]);
  return { total, published, drafts, rooms, puzzles, recent: recent.data ?? [] };
}

/** Where is this asset used? Draft rooms/items/covers + every PUBLISHED version. */
export async function assetUsage(url: string): Promise<{ draft: string[]; published: string[] }> {
  const db = supabaseAdmin();
  const [rooms, items, covers, published] = await Promise.all([
    db.from('rooms').select('key,background_asset,ambient_sound,story_id').or(`background_asset.eq.${url},ambient_sound.eq.${url}`),
    db.from('inventory_items').select('key,story_id').eq('image_asset', url),
    db.from('stories').select('id,status').eq('cover_image_url', url),
    db.from('story_versions').select('story_id,content,id').in('id', ((await db.from('stories').select('published_version_id').not('published_version_id', 'is', null)).data ?? []).map((s: any) => s.published_version_id)),
  ]);
  const draft = [...(rooms.data ?? []).map((r: any) => `room:${r.key}`), ...(items.data ?? []).map((i: any) => `item:${i.key}`), ...(covers.data ?? []).filter((c: any) => c.status !== 'published').map(() => 'cover')];
  const pub: string[] = (covers.data ?? []).filter((c: any) => c.status === 'published').map((c: any) => `${c.id}:cover`);
  for (const v of published.data ?? []) { const c = v.content as { rooms: { id: string; backgroundAsset: string; ambientSound: string }[]; items: { id: string; imageAsset: string }[] }; pub.push(...assetReferences(url, { rooms: c.rooms, items: c.items, coverImageUrl: null }).map((x) => `${v.story_id}:${x}`)); }
  return { draft, published: pub };
}
