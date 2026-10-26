import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Privileged client. 'server-only' makes the build fail if a client component imports this.
export const supabaseAdmin = () =>
  createClient(env.supabaseUrl, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
