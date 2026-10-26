// Who may use the admin area. Decided on the SERVER from a profile row, never from anything the browser sends.
export type AdminRole = 'admin' | 'editor';
export interface AuthUser { id: string; email: string | null; emailConfirmed: boolean }
export interface AdminProfile { userId: string; role: string; disabled: boolean }
export type Action = 'view' | 'edit' | 'upload' | 'publish' | 'delete' | 'manage_admins';
const MATRIX: Record<AdminRole, Action[]> = {
  editor: ['view', 'edit', 'upload'],
  admin: ['view', 'edit', 'upload', 'publish', 'delete', 'manage_admins'],
};
export type Decision = { ok: true; role: AdminRole; userId: string } | { ok: false; status: 401 | 403; message: string };

export function decideAdmin(user: AuthUser | null, profile: AdminProfile | null): Decision {
  if (!user) return { ok: false, status: 401, message: 'Απαιτείται σύνδεση.' };
  if (!user.emailConfirmed) return { ok: false, status: 403, message: 'Το email δεν έχει επιβεβαιωθεί.' };
  // A normal Supabase account is NOT an administrator: it needs an explicit, enabled admin_profiles row.
  if (!profile || profile.userId !== user.id || profile.disabled) return { ok: false, status: 403, message: 'Δεν έχεις δικαίωμα πρόσβασης.' };
  if (profile.role !== 'admin' && profile.role !== 'editor') return { ok: false, status: 403, message: 'Δεν έχεις δικαίωμα πρόσβασης.' };
  return { ok: true, role: profile.role, userId: user.id };
}
export const can = (role: AdminRole, action: Action): boolean => MATRIX[role].includes(action);
export function authorizeAction(user: AuthUser | null, profile: AdminProfile | null, action: Action): Decision {
  const d = decideAdmin(user, profile);
  if (!d.ok) return d;
  return can(d.role, action) ? d : { ok: false, status: 403, message: 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.' };
}
/** Open redirect guard for /admin/login?next=... */
export const safeNext = (n: string | null | undefined): string => (typeof n === 'string' && /^\/admin(\/[\w\-./]*)?$/.test(n) && !n.includes('//') && !n.includes('..') ? n : '/admin');
