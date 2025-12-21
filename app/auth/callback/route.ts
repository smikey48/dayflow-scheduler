import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
    
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Error exchanging code for session:', error)
      return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate user`)
    }

    // Get user from the session data
    const user = data?.user
    
    if (user) {
      // Check if user exists in beta_users table
      const { data: betaUser, error: betaError } = await supabase
        .from('beta_users')
        .select('*')
        .eq('email', user.email)
        .single()

      if (betaError || !betaUser) {
        // User not in beta list - sign them out and redirect with error
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/auth/login?error=Access restricted to beta users`)
      }

      // Check if this is their first sign-in by checking user metadata
      const isNewUser = user.created_at === user.last_sign_in_at || 
                       !user.user_metadata?.has_completed_intro

      if (isNewUser) {
        // Redirect new users to intro
        return NextResponse.redirect(`${origin}/intro`)
      }
      
      // Redirect existing users to home page
      return NextResponse.redirect(`${origin}/`)
    }
  }

  // Fallback redirect to login if no code
  return NextResponse.redirect(`${origin}/auth/login`)
}
