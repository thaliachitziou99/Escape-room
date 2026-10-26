import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-auth';
import { SignOut } from '@/components/admin/SignOut';

const NAV: [string, string][] = [['/admin', 'Πίνακας'], ['/admin/stories', 'Ιστορίες'], ['/admin/puzzles', 'Βιβλιοθήκη γρίφων'], ['/admin/media', 'Πολυμέσα'], ['/admin/publishing', 'Δημοσίευση'], ['/admin/settings', 'Ρυθμίσεις']];
// Every page under (panel) is behind the server-side admin check. Hiding links is cosmetic; this redirect is the gate.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdminPage('view');
  return (
    <div className="min-h-screen bg-[#080B12] text-[#F2F0EA]">
      <header className="border-b border-white/10 bg-[#0e1420]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2">
          <strong className="font-serif text-lg">ESCAPE <span className="text-[#C7A76C]">13</span> · Διαχείριση</strong>
          <nav aria-label="Κύριο μενού" className="flex flex-wrap gap-1">{NAV.map(([h, l]) => <Link key={h} href={h} className="rounded px-2 py-1 text-sm hover:bg-[#1C2638]">{l}</Link>)}</nav>
          <span className="ml-auto text-sm text-[#9CA7B8]">{ctx.email} · {ctx.role === 'admin' ? 'Διαχειριστής' : 'Συντάκτης'}</span><SignOut />
        </div>
      </header>
      {children}
    </div>
  );
}
