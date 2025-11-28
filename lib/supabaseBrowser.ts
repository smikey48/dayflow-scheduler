// lib/supabaseBrowser.ts
import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/** Browser-side singleton Supabase client using SSR package for cookie support. */
export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
        'Ensure these environment variables are set (browser/public environment).' 
    );
  }

  // Use createBrowserClient from @supabase/ssr which handles cookies properly
  _client = createBrowserClient(url, key);
  return _client;
}

/** Convenience: returns the current access token (or empty string). */
export async function getBearerToken(): Promise<string | null> {
  const supabase = supabaseBrowser();
  const { data: { session } } = await supabase.auth.getSession();
  // Return null when no session is available. Callers should handle absence
  // of a token explicitly instead of relying on an empty string.
  return session?.access_token ?? null;
}
export default supabaseBrowser;
