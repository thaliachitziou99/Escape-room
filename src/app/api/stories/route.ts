import { listLibrary } from '@/lib/library';
import { ok } from '@/lib/security';
export const dynamic = 'force-dynamic';
export async function GET() { return ok({ stories: await listLibrary() }); }
