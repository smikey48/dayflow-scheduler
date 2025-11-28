// app/api/revise-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getAuthenticatedUserId } from '@/lib/auth';

// Increase the timeout for this route (in seconds)
// Note: In dev mode, Next.js doesn't enforce this, but it helps in production
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[revise] Request received at', new Date().toISOString());
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req);
    console.log('[revise] authenticated user:', userId);

    // Read envs with fallbacks so we can continue even if dotenv didn't load
    const PYTHON_EXE = process.env.PYTHON_EXE || 'python';
    // prefer WORKDIR if present; fall back to DIR
    const WORKDIR = process.env.SCHEDULER_WORKDIR || process.env.SCHEDULER_DIR || 'C:\\Projects\\dayflow-scheduler';

    // Optional but recommended: service role env name compatibility
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    console.log('[revise] PYTHON_EXE=', PYTHON_EXE);
    console.log('[revise] WORKDIR=', WORKDIR);
    if (!WORKDIR || !fs.existsSync(WORKDIR)) {
      return NextResponse.json({ ok: false, error: `Scheduler workdir not found: ${WORKDIR}` }, { status: 500 });
    }
    if (!SERVICE_KEY) {
      console.warn('[revise] WARNING: SUPABASE_SERVICE_KEY missing — scheduler may fail to write');
    }

    // run the module exactly like your successful PowerShell:
    // python -m dayflow.scheduler_main --date YYYY-MM-DD --user USER_ID --force
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const args = ['-m', 'dayflow.scheduler_main', '--date', todayIso, '--user', userId, '--force'];
    console.log('[revise] spawn:', PYTHON_EXE, args.join(' '), '(cwd=', WORKDIR, ')');

    const child = spawn(PYTHON_EXE, args, {
      cwd: WORKDIR,
      env: {
        ...process.env,
        TZ: 'Europe/London',
        // Ensure Python can import the local 'dayflow' package
        PYTHONPATH: `${WORKDIR};${process.env.PYTHONPATH ?? ''}`,
        // Ensure the scheduler can talk to Supabase as the service
        SUPABASE_SERVICE_KEY: SERVICE_KEY,
        // Pass authenticated user to the scheduler
        // so the job can focus on that user's templates only.
        TEST_USER_ID: userId,
      },
      windowsHide: true,
      shell: false,
    });


    let out = '';
    let err = '';

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    const exitCode: number = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code ?? 0));
    });

    // Trim tails for response
    const tail = (s: string, n = 8000) => (s.length > n ? s.slice(-n) : s);

    const elapsed = Date.now() - startTime;
    console.log('[revise] exitCode=', exitCode, `(elapsed ${elapsed}ms)`);
    if (exitCode !== 0) {
      console.log('[revise] stderr tail:\n', tail(err));
      console.log('[revise] stdout tail:\n', tail(out));
      return NextResponse.json(
        { ok: false, exitCode, error: 'Scheduler exited non-zero', logTail: tail(err || out), elapsedMs: elapsed },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, exitCode, logTail: tail(out || err), elapsedMs: elapsed });
  } catch (e: any) {
    console.error('[revise] fatal error', e);
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
  }
}
