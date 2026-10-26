import type { Metadata } from 'next';

// The URL carries a temporary pairing code: never leak it via Referer.
export const metadata: Metadata = { title: 'Σύνδεση χειριστηρίου · ESCAPE 13', referrer: 'no-referrer' };
export default function JoinLayout({ children }: { children: React.ReactNode }) { return children; }
