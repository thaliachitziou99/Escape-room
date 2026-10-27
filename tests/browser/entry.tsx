// Browser harness entry. Mounts the REAL screens (not Next.js). motion, qrcode and the Supabase client are replaced by shims (see build.mjs).
import { createRoot } from 'react-dom/client';
import { PlayProvider } from '@/components/play/PlayProvider';
import { TvScreen } from '@/components/play/TvScreen';
import { ControllerScreen } from '@/components/play/ControllerScreen';
import JoinPage from '@/app/join/page';
import { StartGame } from '@/components/library/StartGame';
import { useEffect, useState } from 'react';

function Start() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { fetch('/api/stories').then((r) => r.json()).then((j) => setId(j.data.stories.find((s: { slug: string }) => s.slug === 'room-13')?.id ?? null)); }, []);
  return id ? <StartGame storyId={id} /> : <p>loading</p>;
}
const p = location.pathname;
const m = p.match(/^\/(play|controller)\/([0-9a-f-]{36})$/i);
const el = document.getElementById('root')!;
createRoot(el).render(
  m?.[1] === 'play' ? <PlayProvider><TvScreen sessionId={m[2]} /></PlayProvider>
  : m?.[1] === 'controller' ? <PlayProvider><ControllerScreen sessionId={m[2]} /></PlayProvider>
  : p === '/join' ? <JoinPage />
  : <Start />,
);
