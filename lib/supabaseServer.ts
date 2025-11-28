// C:\Projects\dayflow-ui\dayflow2-gui\app\lib\supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Creates a Supabase client that works with Next.js Server Components.
 * It reads the user's session from cookies and lets RLS apply normally.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const entry = cookieStore.get(name);
          return entry ? entry.value : undefined;
        },
        // these are no-ops in server components
        set() {},
        remove() {},
      },
    }
  );
}
