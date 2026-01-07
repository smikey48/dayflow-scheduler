// app/api/revise-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { spawn } from 'child_process';

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

    // Get Railway scheduler URL from environment (if set, use Railway; otherwise spawn locally)
    const SCHEDULER_URL = process.env.SCHEDULER_URL;
    
    // Calculate today's date in London timezone
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    
    // If SCHEDULER_URL is set, call the external Railway service
    if (SCHEDULER_URL) {
      console.log('[revise] Using Railway scheduler at:', SCHEDULER_URL);
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
    }
    
    // Otherwise, spawn Python directly (local development)
    console.log('[revise] SCHEDULER_URL not set, spawning Python directly');
    
    const pythonExe = process.env.PYTHON_EXE || 'python';
    const schedulerWorkdir = process.env.SCHEDULER_WORKDIR;

    console.log('[revise] Config:', { pythonExe, schedulerWorkdir, date: todayIso, userId });

    if (!schedulerWorkdir) {
      console.error('[revise] Missing SCHEDULER_WORKDIR');
      return NextResponse.json(
        { ok: false, error: 'Missing SCHEDULER_WORKDIR in server env.' },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[revise] Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json(
        { ok: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY on server.' },
        { status: 500 }
      );
    }

    // Build args for: python -m dayflow.scheduler_main --date YYYY-MM-DD --user USER_ID --force
    const args = ['-m', 'dayflow.scheduler_main', '--date', todayIso, '--user', userId, '--force'];

    console.log('[revise] Spawning:', pythonExe, args.join(' '));

    // Spawn the Python scheduler with inherited server env (includes service key)
    const child = spawn(pythonExe, args, {
      cwd: schedulerWorkdir,
      env: { ...process.env },
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    // Optional timeout (ms)
    const timeoutMs = 120000; // 2 minutes
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
    }, timeoutMs);

    const exitCode: number = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code ?? -1));
    });

    clearTimeout(timer);
    const elapsed = Date.now() - startTime;

    const ok = exitCode === 0;

    console.log('[revise] Exit code:', exitCode, `(elapsed ${elapsed}ms)`);
    if (!ok) {
      console.error('[revise] stderr:', stderr);
      console.error('[revise] stdout:', stdout);
      return NextResponse.json(
        { ok: false, error: 'Scheduler failed', exitCode, stderr: stderr.split('\n').slice(-20).join('\n') },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Scheduler completed for ${todayIso}`,
      elapsedMs: elapsed 
    });
    
  } catch (e: any) {
    console.error('[revise] fatal error', e);
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
  }
}
