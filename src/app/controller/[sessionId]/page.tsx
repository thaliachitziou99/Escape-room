import { notFound } from 'next/navigation';
import { PlayProvider } from '@/components/play/PlayProvider';
import { ControllerScreen } from '@/components/play/ControllerScreen';

export const metadata = { title: 'ESCAPE 13 — Χειριστήριο' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#080B12' }; // notch-safe, no zoom lock
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ControllerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!UUID.test(sessionId)) notFound();
  return <PlayProvider><ControllerScreen sessionId={sessionId} /></PlayProvider>;
}
