// app/api/scheduler/run/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { getAuthenticatedUserId } from "@/lib/auth";

function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  try {
    console.log('[scheduler/run] Request received');
    
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req as any);
    console.log('[scheduler/run] Authenticated user:', userId);
    
    // Read inputs (optional). Default to today's date in server local time.
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === "string" && body.date.length === 10
    ? body.date
    : formatDateYYYYMMDD(new Date());
    const force = body?.force === true;
    const write = body?.write === true;

    // Required env vars (loaded from .env.local by Next.js on the server)
    const pythonExe = process.env.PYTHON_EXE || "python";
    const schedulerWorkdir = process.env.SCHEDULER_WORKDIR;

    console.log('[scheduler/run] Config:', { pythonExe, schedulerWorkdir, date, force, write });

    if (!schedulerWorkdir) {
      console.error('[scheduler/run] Missing SCHEDULER_WORKDIR');
      return NextResponse.json(
        { ok: false, error: "Missing SCHEDULER_WORKDIR in server env." },
        { status: 500 }
      );
    }

    // Sanity: ensure service key is present (we DO NOT return it)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[scheduler/run] Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY on server." },
        { status: 500 }
      );
    }

    // Build args for: python -m dayflow.scheduler_main --date YYYY-MM-DD --user USER_ID --force
    const args = ["-m", "dayflow.scheduler_main", "--date", date, "--user", userId];
    if (force) {
    args.push("--force");
    }
    if (write) {
    args.push("--write");
    }

    console.log('[scheduler/run] Spawning:', pythonExe, args.join(' '));

    // Spawn the Python scheduler with inherited server env (includes service key)
    const child = spawn(pythonExe, args, {
      cwd: schedulerWorkdir,
      env: { ...process.env },
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    // Optional timeout (ms)
    const timeoutMs = 120000; // 2 minutes
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {}
    }, timeoutMs);

    const exitCode: number = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? -1));
    });

    clearTimeout(timer);

    const ok = exitCode === 0;

    console.log('[scheduler/run] Exit code:', exitCode);
    if (!ok) {
      console.error('[scheduler/run] stderr:', stderr);
      console.error('[scheduler/run] stdout:', stdout);
    }

    return NextResponse.json({
      ok,
      exitCode,
      // Return short tails to aid debugging without flooding the client
      stdoutTail: stdout.split("\n").slice(-50).join("\n"),
      stderrTail: stderr.split("\n").slice(-50).join("\n"),
      ran: {
        pythonExe,
        args,
        cwd: schedulerWorkdir,
        date,
        force,
      },
    }, { status: ok ? 200 : 500 });

  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status }
    );
  }
}

export async function GET() {
  // Make GET a harmless ping to avoid accidental runs
  return NextResponse.json({ ok: true, message: "POST to run the scheduler." });
}
