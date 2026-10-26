import { notFound } from 'next/navigation';
import { getLibraryStory } from '@/lib/library';
import { StartGame } from '@/components/library/StartGame';
export const dynamic = 'force-dynamic';

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getLibraryStory(slug);
  if (!s) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-[#F2F0EA]">
      <h1 className="font-serif text-4xl">{s.title}</h1>
      <p className="mt-2 text-[#9CA7B8]">{s.genre} · {s.difficulty} · {s.estimated_minutes} λεπτά</p>
      <p className="mt-4">{s.description}</p>
      {s.intro.length > 0 && <><h2 className="mt-6 font-serif text-2xl">Εισαγωγή</h2>{s.intro.map((t, i) => <p key={i} className="mt-2 text-[#9CA7B8]">{t}</p>)}</>}
      {s.status === 'published' ? <StartGame storyId={s.id} /> : <p className="mt-6 text-[#9CA7B8]">Έρχεται σύντομα.</p>}
    </main>
  );
}
