import { requireAdminPage } from '@/lib/admin-auth';
export default async function Page() {
  const ctx = await requireAdminPage('view');
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 text-[#F2F0EA]">
      <h1 className="mb-4 font-serif text-3xl">Ρυθμίσεις</h1>
      <dl className="rounded-lg border border-white/10 bg-[#121826] p-4"><dt className="text-sm text-[#9CA7B8]">Λογαριασμός</dt><dd className="mb-3">{ctx.email}</dd><dt className="text-sm text-[#9CA7B8]">Ρόλος</dt><dd>{ctx.role === 'admin' ? 'Διαχειριστής (επεξεργασία, δημοσίευση, διαγραφή)' : 'Συντάκτης (επεξεργασία, μεταφόρτωση)'}</dd></dl>
      <p className="mt-4 text-[#9CA7B8]">Η δημιουργία και απενεργοποίηση λογαριασμών διαχειριστή γίνεται από τη βάση δεδομένων (πίνακας admin_profiles). Δεν υπάρχει δημόσια εγγραφή.</p>
    </main>
  );
}
