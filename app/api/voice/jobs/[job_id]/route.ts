import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from '@/lib/auth';

// 🚫 Disable caching for this route (Next.js App Router)
export const dynamic = "force-dynamic";
export const revalidate = 0;
// (Optional, if you're on an Edge runtime that does odd caching)
// export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } }); // server-safe
}


type Params = { job_id: string };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<Params> }              // ← params is a Promise in Next 15
) {
  try {
    // Get authenticated user
    await getAuthenticatedUserId(req);
    
    const { job_id } = await ctx.params;        // ← await it
    const supabase = getServiceClient();
    // ...


    const { data, error } = await supabase
      .from("voice_jobs")
      .select(`
        job_id,
        status,
        storage_path,
        draft_transcript,
        content_type,
        size_bytes,
        queued_at,
        transcribed_at,
        inserted_at,
        error_code,
        error_message,
        result_summary
      `)
      .eq("job_id", job_id)
      .single();

    if (error) {
      const res = NextResponse.json({ error: error.message }, { status: 500 });
      // Explicitly no-store on error responses too
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    }

    if (!data) {
      const res = NextResponse.json({ error: "not found" }, { status: 404 });
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    }

    const res = NextResponse.json(data);
    // 🔒 Make absolutely sure the client never sees a cached copy
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  } catch (e: any) {
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    const res = NextResponse.json({ error: e?.message || "unknown error" }, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }
}


