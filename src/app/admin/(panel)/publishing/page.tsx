import { requireAdminPage } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
const ACTION: Record<string, string> = { publish: 'Δημοσίευση', unpublish: 'Απόσυρση', archive: 'Αρχειοθέτηση', restore: 'Επαναφορά', submit_review: 'Υποβολή για έλεγχο' };
export default async function Page() {
  await requireAdminPage('view');
  const { data } = await supabaseAdmin().from('publication_history').select('id,action,created_at,story_id,version_id,stories(title),story_versions(version_no)').order('created_at', { ascending: false }).limit(100);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-[#F2F0EA]">
      <h1 className="mb-4 font-serif text-3xl">Ιστορικό δημοσιεύσεων</h1>
      {!data?.length ? <p className="text-[#9CA7B8]">Δεν έχουν γίνει δημοσιεύσεις ακόμη.</p> : (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#121826]">{data.map((h: any) => (
          <li key={h.id} className="flex flex-wrap gap-3 p-3"><strong>{(h.stories as unknown as { title: string } | null)?.title}</strong><span>{ACTION[h.action] ?? h.action}</span>
            {(h.story_versions as unknown as { version_no: number } | null) && <span className="text-[#C7A76C]">έκδοση {(h.story_versions as unknown as { version_no: number }).version_no}</span>}<span className="ml-auto text-sm text-[#9CA7B8]">{new Date(h.created_at).toLocaleString('el-GR')}</span></li>))}</ul>)}
    </main>
  );
}
