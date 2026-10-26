import { guardApi } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assetUsage } from '@/lib/admin-store';
import { canDeleteAsset } from '@/features/admin/media';
import { UUID_RE, fail, ok } from '@/lib/security';

/** Usage report for the media browser ("where is this used?"). */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const { assetId } = await params; if (!UUID_RE.test(assetId)) return fail('no_asset', 'Το αρχείο δεν βρέθηκε.', 404);
  const { data: a } = await supabaseAdmin().from('media_assets').select('url').eq('id', assetId).maybeSingle();
  return a ? ok(await assetUsage(a.url)) : fail('no_asset', 'Το αρχείο δεν βρέθηκε.', 404);
}
/** Blocked while PUBLISHED content uses it. Draft-only usage needs ?force=1 (the UI shows the list first). */
export async function DELETE(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const g = await guardApi(req, 'delete'); if ('res' in g) return g.res;
  const { assetId } = await params; if (!UUID_RE.test(assetId)) return fail('no_asset', 'Το αρχείο δεν βρέθηκε.', 404);
  const db = supabaseAdmin();
  const { data: a } = await db.from('media_assets').select('url,path,bucket').eq('id', assetId).maybeSingle();
  if (!a) return fail('no_asset', 'Το αρχείο δεν βρέθηκε.', 404);
  const use = await assetUsage(a.url);
  const c = canDeleteAsset(use.published); if (!c.ok) return fail('asset_in_use', c.message!, 409);
  if (use.draft.length && new URL(req.url).searchParams.get('force') !== '1') return fail('asset_in_draft', 'Το αρχείο χρησιμοποιείται σε πρόχειρο περιεχόμενο. Αντικατέστησέ το ή επιβεβαίωσε τη διαγραφή.', 409);
  await db.storage.from(a.bucket).remove([a.path]);
  const { error } = await db.from('media_assets').delete().eq('id', assetId);
  return error ? fail('delete_failed', 'Η διαγραφή απέτυχε.', 500) : ok({ deleted: true });
}
