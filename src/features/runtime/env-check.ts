// Environment validation. Pure: takes a plain object. Separates public (browser) from server-only variables.
export const PUBLIC_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;
export const SERVER_VARS = ['SUPABASE_SECRET_KEY', 'SUPABASE_JWT_SECRET', 'PAIRING_SECRET', 'APP_BASE_URL'] as const;
const SECRET_NAME = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|JWT)/i;

export function checkEnv(e: Record<string, string | undefined>, production = false): string[] {
  const problems: string[] = [];
  for (const k of [...PUBLIC_VARS, ...SERVER_VARS]) if (!e[k]) problems.push(`Λείπει η μεταβλητή ${k}.`);
  for (const k of Object.keys(e)) if (k.startsWith('NEXT_PUBLIC_') && SECRET_NAME.test(k)) problems.push(`Η ${k} μοιάζει με μυστικό αλλά είναι δημόσια (NEXT_PUBLIC_).`);
  if (e.PAIRING_SECRET && e.PAIRING_SECRET.length < 32) problems.push('Η PAIRING_SECRET πρέπει να έχει τουλάχιστον 32 χαρακτήρες.');
  if (e.SUPABASE_SECRET_KEY && e.SUPABASE_SECRET_KEY === e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) problems.push('Το μυστικό κλειδί ταυτίζεται με το δημόσιο.');
  if (e.APP_BASE_URL) {
    try {
      const u = new URL(e.APP_BASE_URL);
      if (production && u.protocol !== 'https:') problems.push('Η APP_BASE_URL πρέπει να είναι https σε παραγωγή.');
      if (e.APP_BASE_URL.endsWith('/')) problems.push('Η APP_BASE_URL δεν πρέπει να τελειώνει σε «/».');
    } catch { problems.push('Η APP_BASE_URL δεν είναι έγκυρο URL.'); }
  }
  if (e.NEXT_PUBLIC_SUPABASE_URL) { try { new URL(e.NEXT_PUBLIC_SUPABASE_URL); } catch { problems.push('Η NEXT_PUBLIC_SUPABASE_URL δεν είναι έγκυρο URL.'); } }
  return problems;
}
