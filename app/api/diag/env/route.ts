import { NextResponse } from "next/server";

export async function GET() {
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY!.length > 10);
  const hasWorkdir = Boolean(process.env.SCHEDULER_WORKDIR && process.env.SCHEDULER_WORKDIR!.length > 1);
  const hasPython = Boolean(process.env.PYTHON_EXE && process.env.PYTHON_EXE!.length > 1);

  return NextResponse.json({
    ok: true,
    hasServiceKey,
    hasWorkdir,
    hasPython,
    // helpful echoes (safe, not secrets)
    workdir: process.env.SCHEDULER_WORKDIR || null,
    pythonExe: process.env.PYTHON_EXE || null,
  });
}

