import { createClient } from '@supabase/supabase-js';

// Browser client: publishable key only. Protected data goes through server routes.
export const supabaseBrowser = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
