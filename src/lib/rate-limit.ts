import 'server-only';
import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { logOps } from '@/lib/log';

/** Hashed client key: raw IPs are never stored or logged. */
export function clientKey(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return createHmac('sha256', env.pairingSecret).update(`ip:${ip}`).digest('hex').slice(0, 32);
}

/**
 * true = allowed. Atomic in Postgres (rate_limit_hit). If the limiter itself fails we ALLOW and log:
 * an outage of the limiter must not take the game down; the database-side pairing lockout still protects codes.
 */
export async function allow(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('rate_limit_hit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) { logOps('warn', 'database_failure', { where: 'rate_limit_hit', pgcode: error.code }); return true; }
  const okay = data === true;
  if (!okay) logOps('warn', 'rate_limited', { bucket: bucket.split(':')[0] });
  return okay;
}
