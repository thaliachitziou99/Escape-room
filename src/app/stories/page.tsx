import { listLibrary } from '@/lib/library';
import { StoryCard } from '@/components/library/StoryCard';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ιστορίες · ESCAPE 13' };

export default async function StoriesPage() {
  const stories = await listLibrary(); // published stories come from Supabase; drafts are excluded by RLS
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-[#F2F0EA]">
      <h1 className="mb-6 font-serif text-4xl">Διάλεξε ιστορία</h1>
      {stories.length === 0 ? <p className="text-[#9CA7B8]">Δεν υπάρχουν διαθέσιμες ιστορίες ακόμη.</p>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stories.map((s) => <StoryCard key={s.id} s={s} />)}</div>}
    </main>
  );
}
