import { LoginForm } from '@/components/admin/LoginForm';
export const metadata = { title: 'Σύνδεση διαχειριστή · ESCAPE 13', robots: { index: false, follow: false } };
// No sign-up link and no registration endpoint exist: admin accounts are created by an existing administrator.
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.next ?? null} denied={sp.denied === '1'} />;
}
