// lib/voice/processJob.ts
// Node-only job processor: downloads audio from Supabase Storage, transcribes with OpenAI,
// calls /api/voice-task, and updates voice_jobs to 'transcribed' then 'inserted'.

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import path from "node:path";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE_BUCKET = process.env.VOICE_BUCKET || "voice";

// Important: this file must only ever be imported server-side
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  throw new Error("processJob: missing env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY)");
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function guessContentType(storagePath: string) {
  const ext = path.extname(storagePath).toLowerCase();
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

async function downloadAudioOrThrow(storage_path: string): Promise<Uint8Array> {
  if (storage_path.startsWith(`${VOICE_BUCKET}/`)) {
    throw new Error(`storage_path should be bucket-relative (got "${storage_path}" incl. bucket)`);
  }
  const dl = await supa.storage.from(VOICE_BUCKET).download(storage_path);
  if (dl.error) {
    const code = (dl.error as any)?.name || (dl.error as any)?.statusCode || "DOWNLOAD_ERROR";
    const msg = (dl.error as any)?.message || "unknown";
    throw new Error(`download failed [${code}]: ${msg}`);
  }
  const blob = dl.data;
  const arrayBuf = await blob.arrayBuffer();
  return new Uint8Array(arrayBuf);
}

export async function processJob(job_id: string) {
  // Load job
  const { data: jobRow, error } = await supa
    .from("voice_jobs")
    .select("job_id,user_id,storage_path,status,draft_transcript")
    .eq("job_id", job_id)
    .single();

  if (error || !jobRow) throw new Error(`processJob: job not found: ${job_id}`);

  const { user_id, storage_path, draft_transcript } = jobRow as {
    user_id: string; storage_path: string; draft_transcript: string | null;
  };

  // Get transcript
  let transcript: string;
  let source: "front-end draft" | "Whisper";

  if (draft_transcript && draft_transcript.trim().length > 0) {
    transcript = draft_transcript.trim();
    source = "front-end draft";
  } else {
    const audioBytes = await downloadAudioOrThrow(storage_path);
    const contentType = guessContentType(storage_path);

    // Create a fresh ArrayBuffer and copy the bytes over (dodges SharedArrayBuffer typing)
    const ab = new ArrayBuffer(audioBytes.byteLength);
    new Uint8Array(ab).set(audioBytes);

    const blob = new Blob([ab], { type: contentType });

    const transcription = await openai.audio.transcriptions.create({
    file: blob as any,
    model: "whisper-1",
    response_format: "text",
    });


    // …or, if you prefer a File, wrap the Blob (also fine):
    // const file = new File([blob], "audio" + path.extname(storage_path), { type: contentType });
    // const transcription = await openai.audio.transcriptions.create({
    //   file,
    //   model: "whisper-1",
    //   response_format: "text",
    // });

    transcript = typeof transcription === "string" ? transcription : (transcription as any).text ?? String(transcription);
    source = "Whisper";
  }

  const now = new Date().toISOString();

  // Mark transcribed (preview summary only)
  const shortTranscript = transcript.length > 120 ? transcript.slice(0, 117) + "..." : transcript;
  await supa.from("voice_jobs").update({
    status: "transcribed",
    transcribed_at: now,
    error_code: null,
    error_message: null,
    result_summary: JSON.stringify({ preview: `Transcribed via ${source}`, transcript_preview: shortTranscript }),
  }).eq("job_id", job_id);

  // Parse & insert via local API
  const res = await fetch("http://localhost:3000/api/voice-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, user_id }),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`voice-task failed: HTTP ${res.status} → ${bodyText}`);

  // Build canonical result_summary for UI
  let parsed: any = null;
  try { parsed = JSON.parse(bodyText); } catch {}
  const src = parsed?.task ?? parsed ?? null;

  const resultSummaryObj = {
    title: src?.title ?? null,
    local_date: src?.local_date ?? null,
    start_time_local: src?.start_time_local ?? null,
    end_time_local: src?.end_time_local ?? null,
    duration_minutes: src?.duration_minutes ?? null,

    is_appointment: !!src?.is_appointment,
    is_fixed: !!src?.is_fixed,
    is_routine: !!src?.is_routine,

    repeat_unit: src?.repeat_unit ?? "none",
    repeat_interval: src?.repeat_interval ?? 1,
    repeat_day: src?.repeat_day ?? null,

    timezone: src?.timezone ?? "Europe/London",

    confidence_notes: src?.confidence_notes ?? null,
    was_default_duration: !!(src?.duration_minutes === 25 && src?.is_appointment === false),

    scheduled_task_id: parsed?.scheduled_task_id ?? null,
    template_id: parsed?.template_id ?? null,
  };

  await supa.from("voice_jobs").update({
    status: "inserted",
    inserted_at: now,
    error_code: null,
    error_message: null,
    result_summary: JSON.stringify(resultSummaryObj),
  }).eq("job_id", job_id);
}
