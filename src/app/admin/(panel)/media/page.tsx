import { requireAdminPage } from '@/lib/admin-auth';
import { MediaBrowser } from '@/components/admin/MediaPicker';
export default async function Page() {
  await requireAdminPage('view');
  return <main className="mx-auto max-w-6xl px-4 py-6 text-[#F2F0EA]"><h1 className="mb-2 font-serif text-3xl">Βιβλιοθήκη πολυμέσων</h1>
    <p className="mb-4 text-[#9CA7B8]">Επιτρέπονται PNG, JPEG, WebP (εικόνες) και MP3, OGG, WAV (ήχος). Ο έλεγχος γίνεται στο περιεχόμενο του αρχείου, όχι στο όνομά του.</p><MediaBrowser /></main>;
}
