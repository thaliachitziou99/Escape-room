import Link from 'next/link';
import { dashboardStats } from '@/lib/admin-store';
import { STATUS_LABEL_EL, type StoryStatus } from '@/features/admin/types';
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const s = await dashboardStats(); // real counts straight from the database; nothing is invented
  const tiles: [string, number][] = [['Σύνολο ιστοριών', s.total], ['Δημοσιευμένες', s.published], ['Πρόχειρες / σε έλεγχο', s.drafts], ['Δωμάτια', s.rooms], ['Γρίφοι', s.puzzles]];
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 font-serif text-3xl">Πίνακας ελέγχου</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{tiles.map(([l, n]) => <div key={l} className="rounded-lg border border-white/10 bg-[#121826] p-4"><div className="text-3xl text-[#C7A76C]">{n}</div><div className="text-sm text-[#9CA7B8]">{l}</div></div>)}</div>
      <h2 className="mb-2 font-serif text-xl">Πρόσφατες αλλαγές</h2>
      {s.recent.length === 0 ? <p className="text-[#9CA7B8]">Δεν υπάρχουν ιστορίες ακόμη.</p> : (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#121826]">{s.recent.map((r: any) => (
          <li key={r.id} className="flex items-center justify-between gap-3 p-3"><Link href={`/admin/stories/${r.id}`} className="text-[#F2F0EA] hover:text-[#C7A76C]">{r.title}</Link>
            <span className="text-sm text-[#9CA7B8]">{STATUS_LABEL_EL[r.status as StoryStatus] ?? r.status} · {new Date(r.updated_at).toLocaleString('el-GR')}</span></li>))}</ul>)}
    </main>
  );
}
