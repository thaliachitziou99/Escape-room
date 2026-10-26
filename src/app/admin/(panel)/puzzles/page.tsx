import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
// Read-only overview across all stories. Answers and hints are NOT selected here: secrets are only read inside the editor's save/load path.
export default async function Page() {
  await requireAdminPage('view');
  const { data } = await supabaseAdmin().from('puzzles').select('story_id,key,title,room_key,config,stories(title)').order('story_id').limit(500);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-[#F2F0EA]">
      <h1 className="mb-4 font-serif text-3xl">Βιβλιοθήκη γρίφων</h1>
      {!data?.length ? <p className="text-[#9CA7B8]">Δεν υπάρχουν γρίφοι σε ιστορίες του editor ακόμη.</p> : (
        <table className="w-full text-left text-sm"><thead className="text-[#9CA7B8]"><tr><th className="py-1">Γρίφος</th><th>Τύπος</th><th>Δωμάτιο</th><th>Ιστορία</th></tr></thead>
          <tbody>{data.map((p: any) => <tr key={`${p.story_id}:${p.key}`} className="border-t border-white/10"><td className="py-2">{p.title}</td><td>{(p.config as { type: string }).type}</td><td>{p.room_key}</td>
            <td><Link className="text-[#C7A76C]" href={`/admin/stories/${p.story_id}/puzzles`}>{(p.stories as unknown as { title: string } | null)?.title ?? p.story_id}</Link></td></tr>)}</tbody></table>)}
    </main>
  );
}
