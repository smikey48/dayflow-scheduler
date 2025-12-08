// app/api/revise-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

// Increase the timeout for this route (in seconds)
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[revise] Request received at', new Date().toISOString());
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req);
    console.log('[revise] authenticated user:', userId);

    // Get Railway scheduler URL from environment
    const SCHEDULER_URL = process.env.SCHEDULER_URL || 'http://localhost:8000';
    
    // Calculate today's date in London timezone
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    
    console.log('[revise] Calling scheduler at:', SCHEDULER_URL);
    console.log('[revise] Date:', todayIso, 'User:', userId);

    // Call the Railway scheduler service
    const response = await fetch(`${SCHEDULER_URL}/run-scheduler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: todayIso,
        user_id: userId,
      }),
    });

    const data = await response.json();
    const elapsed = Date.now() - startTime;
    
    console.log('[revise] Response:', data, `(elapsed ${elapsed}ms)`);
    
    if (!response.ok || !data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || 'Scheduler failed' },
        { status: response.status }
      );
    }

    return NextResponse.json({ 
      ok: true, 
      message: data.message,
      elapsedMs: elapsed 
    });
  } catch (e: any) {
    console.error('[revise] fatal error', e);
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
  }
}
