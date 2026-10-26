import Link from 'next/link';
import type { LibraryStory } from '@/lib/library';

const GRADS: [string, string][] = [['#1d2a44', '#3a2a44'], ['#2a3a2e', '#1d2a44'], ['#44331d', '#1d2a44'], ['#3a1d2a', '#1d3a44']];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Same visual language as the Part 1 preview: art block, tags, availability line, one action. */
export function StoryCard({ s }: { s: LibraryStory }) {
  const [c1, c2] = GRADS[hash(s.slug) % GRADS.length];
  const live = s.status === 'published';
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#121826]">
      <div role="img" aria-label={`Εικόνα: ${s.title}`} className="h-40 w-full bg-cover bg-center"
        style={{ backgroundImage: s.cover_image_url ? `url(${s.cover_image_url})` : `linear-gradient(135deg, ${c1}, ${c2})` }} />
      <div className="p-4">
        <h3 className="font-serif text-2xl text-[#F2F0EA]">{s.title}</h3>
        <p className="mb-3 mt-1 text-[#9CA7B8]">{s.description}</p>
        <div className="mb-3 flex flex-wrap gap-2 text-sm text-[#C7A76C]">
          {[s.genre, s.difficulty, `${s.estimated_minutes} λεπτά`].filter(Boolean).map((t) => <span key={t} className="rounded border border-white/10 px-2 py-0.5">{t}</span>)}
        </div>
        <p className={`mb-3 ${live ? 'text-[#5D9B80]' : 'text-[#9CA7B8]'}`}>{live ? 'Διαθέσιμη τώρα' : 'Έρχεται σύντομα'}</p>
        {live
          ? <Link href={`/stories/${s.slug}`} className="inline-block rounded bg-[#C7A76C] px-4 py-2 font-medium text-[#1a1405]">Δες την ιστορία</Link>
          : <button disabled aria-disabled="true" className="rounded border border-white/10 px-4 py-2 text-[#9CA7B8]">Έρχεται σύντομα</button>}
      </div>
    </article>
  );
}
