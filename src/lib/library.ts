import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export type LibraryStory = {
  id: string; slug: string; title: string; description: string; genre: string; difficulty: string;
  estimated_minutes: number; cover_image_url: string | null; status: 'published' | 'coming_soon'; intro: string[];
};
// Reads with the PUBLISHABLE key, so row-level security (stories_public_read) is what keeps drafts out - not application code.
const publicClient = () => createClient(env.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const COLS = 'id,slug,title,description,genre,difficulty,estimated_minutes,cover_image_url,status,intro';

export async function listLibrary(): Promise<LibraryStory[]> {
  const { data } = await publicClient().from('stories').select(COLS).in('status', ['published', 'coming_soon']).order('status', { ascending: true }).order('title');
  return (data ?? []) as LibraryStory[];
}
export async function getLibraryStory(slug: string): Promise<LibraryStory | null> {
  const { data } = await publicClient().from('stories').select(COLS).eq('slug', slug).in('status', ['published', 'coming_soon']).maybeSingle();
  return (data as LibraryStory | null) ?? null;
}
