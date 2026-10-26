import { guardApi } from '@/lib/admin-auth';
import { dashboardStats } from '@/lib/admin-store';
import { ok } from '@/lib/security';
export async function GET(req: Request) { const g = await guardApi(req, 'view'); if ('res' in g) return g.res; return ok(await dashboardStats()); }
