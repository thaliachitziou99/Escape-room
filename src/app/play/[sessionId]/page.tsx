import { notFound } from 'next/navigation';
import { PlayProvider } from '@/components/play/PlayProvider';
import { TvScreen } from '@/components/play/TvScreen';

export const metadata = { title: 'ESCAPE 13 — Οθόνη παιχνιδιού' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Credentials live in HttpOnly cookies; the page itself holds nothing secret. The state API decides who may see what.
export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!UUID.test(sessionId)) notFound();
  return <PlayProvider><TvScreen sessionId={sessionId} /></PlayProvider>;
}
