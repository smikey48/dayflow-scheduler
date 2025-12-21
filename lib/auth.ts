import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Get the authenticated user ID from the request.
 * Returns the user ID if authenticated, or throws an error if not.
 */
export async function getAuthenticatedUserId(req: NextRequest): Promise<string> {
  // Create Supabase client that reads session from cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // Get the user from the session (stored in cookies)
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return user.id;
}

/**
 * Get user ID from server component context (uses cookies()).
 * For use in server components, not API routes.
 */
export async function getAuthenticatedUserIdServer(): Promise<string> {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.user) {
    throw new Error('Unauthorized');
  }

  return session.user.id;
}
