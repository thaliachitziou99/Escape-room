import { EditorPage } from '@/components/admin/EditorPage';
export default function Page({ params }: { params: Promise<{ storyId: string; roomId: string }> }) { return <EditorPage params={params} section="rooms" roomId />; }
