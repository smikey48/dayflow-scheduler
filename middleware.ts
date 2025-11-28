import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next();
  let session = null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          req.cookies.set(name, value);
          res.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          req.cookies.delete(name);
          res.cookies.set({
            name,
            value: "",
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  // Get session from Supabase (this will read from their session cookies)
  const { data } = await supabase.auth.getSession();
  session = data.session;

  // Public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/signup', '/auth/reset-password', '/', '/api'];
  const isPublicRoute = publicRoutes.some(route => req.nextUrl.pathname === route || req.nextUrl.pathname.startsWith(route + '/'));

  // Redirect to login if not authenticated and not on a public route
  if (!session && !isPublicRoute) {
    const redirectUrl = new URL('/auth/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Only redirect to /today if authenticated and specifically on /auth/* routes (not on landing page)
  if (session && req.nextUrl.pathname.startsWith('/auth/')) {
    const redirectUrl = new URL('/today', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  // run on all app routes (skip static assets)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

