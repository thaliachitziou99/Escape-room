import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-auth';
import { loadDraft } from '@/lib/admin-store';
import { UUID_RE } from '@/lib/security';
import { StoryEditor, type Section } from './StoryEditor';

/** Server wrapper shared by every /admin/stories/[storyId]/... route: verifies the admin, loads the draft, hands it to the client editor. */
export async function EditorPage({ params, section, roomId }: { params: Promise<{ storyId: string; roomId?: string }>; section: Section; roomId?: boolean }) {
  const ctx = await requireAdminPage('edit');
  const p = await params;
  if (!UUID_RE.test(p.storyId)) notFound();
  const l = await loadDraft(p.storyId);
  if (!l) notFound();
  return <StoryEditor initial={l.draft} updatedAt={l.updatedAt} section={section} roomId={roomId ? p.roomId : undefined} role={ctx.role} />;
}
