export const runtime = "nodejs"; // ensure Node runtime (not Edge)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from '@/lib/auth';

function getServiceClient() {
  // Server-side: prefer service key; fall back to anon for dev only.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type PostBody = {
  job_id?: string;
  storage_path?: string;
  status?: string; // usually "queued"
  draft_transcript?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
};

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const user_id = await getAuthenticatedUserId(req);
    
    const body = (await req.json().catch(() => ({}))) as PostBody;

    const job_id = body.job_id;
    const storage_path = body.storage_path;
    const status = body.status || "queued";
    const draft_transcript = body.draft_transcript ?? null;
    const content_type = body.content_type ?? null;
    const size_bytes = body.size_bytes ?? null;

    if (!job_id) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }
    if (!storage_path) {
      return NextResponse.json({ error: "storage_path is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Upsert the job row
    const upsertData: any = {
      job_id,
      user_id,
      storage_path,
      status,
      draft_transcript, // store browser draft
      content_type,
      size_bytes,
      queued_at: status === "queued" ? new Date().toISOString() : undefined,
    };

    const { data, error } = await supabase
      .from("voice_jobs")
      .upsert(upsertData, { onConflict: "job_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Job is now queued. The worker script (voice-worker.mjs) will pick it up and process it.
    // This avoids race conditions where both the API route and worker try to process the same job.

    return NextResponse.json(data);
  } catch (e: any) {
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || "unknown error" }, { status });
  }
}

