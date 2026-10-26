import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
  get secretKey() { return req('SUPABASE_SECRET_KEY'); },
  get baseUrl() { return req('APP_BASE_URL'); },
  get pairingSecret() {
    const s = req('PAIRING_SECRET');
    if (s.length < 32) throw new Error('PAIRING_SECRET must be at least 32 characters');
    return s;
  },
};
