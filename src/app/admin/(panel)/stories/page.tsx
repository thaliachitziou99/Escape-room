import { requireAdminPage } from '@/lib/admin-auth';
import { StoriesList } from '@/components/admin/StoriesList';
export default async function Page() { const ctx = await requireAdminPage('view'); return <StoriesList role={ctx.role} />; }
