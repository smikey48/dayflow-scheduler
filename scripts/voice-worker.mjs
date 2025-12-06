// C:\Projects\dayflow-ui\dayflow2-gui\scripts\voice-worker.mjs
import "dotenv/config"; // <- load .env.local when running via node
// C:\Projects\dayflow-ui\dayflow2-gui\scripts\voice-worker.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // <-- load .env.local for Node worker

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import path from "node:path";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  !SUPABASE_URL && "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  !process.env.OPENAI_API_KEY && "OPENAI_API_KEY",
].filter(Boolean);
if (missing.length) {
  console.error("Missing env vars:", missing);
  process.exit(1);
}

const VOICE_BUCKET = process.env.VOICE_BUCKET || "voice";

// Constants
const TRANSCRIPT_PREVIEW_LEN = 120;

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper to truncate transcript for preview
function truncateTranscript(transcript) {
  if (!transcript || transcript.length <= TRANSCRIPT_PREVIEW_LEN) {
    return transcript;
  }
  return transcript.slice(0, TRANSCRIPT_PREVIEW_LEN - 3) + "...";
}

function guessContentType(storagePath) {
  const ext = path.extname(storagePath).toLowerCase();
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

async function downloadAudioOrThrow(storage_path) {
  // Path must be bucket-relative — NOT "voice/..."
  if (storage_path.startsWith(`${VOICE_BUCKET}/`)) {
    throw new Error(
      `storage_path should be bucket-relative (got "${storage_path}" including bucket name)`
    );
  }

  const lastSlash = storage_path.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? storage_path.slice(0, lastSlash) : "";
  const filename = lastSlash >= 0 ? storage_path.slice(lastSlash + 1) : storage_path;

  const list = await supa.storage.from(VOICE_BUCKET).list(prefix || "", {
    search: filename,
    limit: 100,
  });

  console.log("[worker] check exists", {
    VOICE_BUCKET,
    prefix,
    filename,
    listError: list.error?.message ?? null,
    found: (list.data || []).some((d) => d.name === filename),
    listed: (list.data || []).map((d) => d.name),
  });

  // C:\Projects\dayflow-ui\dayflow2-gui\scripts\voice-worker.mjs
  const dl = await supa.storage.from(VOICE_BUCKET).download(storage_path);
  if (dl.error) {
    const code = dl.error?.name || dl.error?.statusCode || "DOWNLOAD_ERROR";
    const msg = dl.error?.message || "unknown";
    throw new Error(`download failed [${code}]: ${msg}`);
  }

  const blob = dl.data;
  const size = blob?.size ?? null;
  const type = blob?.type ?? null;
  console.log("[worker] download ok", { storage_path, size, type });

  const arrayBuf = await blob.arrayBuffer();
  return new Uint8Array(arrayBuf);
}

// C:\Projects\dayflow-ui\dayflow2-gui\scripts\voice-worker.mjs
async function processOne(job) {
  const job_id = job.job_id;
  const storage_path = job.storage_path;

  let transcript = null;
  let source = null;

  if (job.draft_transcript && job.draft_transcript.trim().length > 0) {
    console.log(`[worker] job ${job_id} — using front-end draft_transcript (skip Whisper)`);
    transcript = job.draft_transcript.trim();
    source = "front-end draft";
  } else {
    console.log(`\n[worker] job ${job_id} — downloading …`);
    const audioBytes = await downloadAudioOrThrow(storage_path);
    console.log(`[worker] job ${job_id} — audio size: ${audioBytes.length}`);

    console.log(`[worker] job ${job_id} — transcribing with Whisper …`);
    const contentType = guessContentType(storage_path);

    const file = new File([audioBytes], "audio" + path.extname(storage_path), {
      type: contentType,
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });
    transcript =
      typeof transcription === "string"
        ? transcription
        : transcription.text ?? String(transcription);
    source = "Whisper";
  }

  const now = new Date().toISOString();

  // Mark as transcribed (we have a transcript, but haven't inserted tasks yet)
  await supa
    .from("voice_jobs")
    .update({
      status: "transcribed",
      transcribed_at: now,
      error_code: null,
      error_message: null,
      // optional preview while waiting for insert
      result_summary: JSON.stringify({
        preview: `Transcribed from ${source}`,
        transcript_preview: truncateTranscript(transcript),
      }),
    })
    .eq("job_id", job_id);

  console.log(`[worker] job ${job_id} — transcribed ✅ via ${source}`);

  // --- Parse & insert via your API (TEMPLATE-ONLY) ---
  console.log(`[worker] job ${job_id} — parsing/inserting …`);

  // Build canonical payload expected by /api/voice-task
  const DEV_USER_ID = "3c877140-9539-47b9-898a-45eeab392e39"; // from our dev setup
  if (!transcript || typeof transcript !== "string") {
    console.error("[worker] missing transcript text, cannot build payload", { job_id });
    throw new Error("missing transcript");
  }

  const payload = {
    user_id: job.user_id || DEV_USER_ID, // Use job's user_id if available
    transcript, // full text from Whisper or draft
    timezone: "Europe/London", // your canonical timezone
    job_id, // traceability
    storage_path, // helpful metadata
    // Pass metadata overrides if present
    duration_override: job.metadata?.duration_override || null,
    priority_override: job.metadata?.priority_override || null,
  };

  // Debug: confirm env keys present (masked)
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  console.log("[worker] env check", {
    hasServiceRole: !!svcKey,
    serviceRoleLen: svcKey ? svcKey.length : 0,
    supabaseUrl: supaUrl || "(missing)",
    transcriptLen: transcript.length,
  });

  const url = "http://localhost:3000/api/voice-task";

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: svcKey ? `Bearer ${svcKey}` : undefined,
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.error("[worker] fetch network error", { url, netErr });
    throw netErr;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "(no body)");
    console.error("[worker] fetch response error", {
      url,
      status: res.status,
      statusText: res.statusText,
      body: txt,
    });
    
    // Try to extract error message from API response
    let errorMsg = `API returned ${res.status}`;
    try {
      const errJson = JSON.parse(txt);
      if (errJson.error) {
        errorMsg = errJson.error;
      } else if (errJson.error_message) {
        errorMsg = errJson.error_message;
      }
    } catch {
      // Not JSON, use raw text if meaningful
      if (txt && txt.length < 200 && !txt.includes("<!DOCTYPE")) {
        errorMsg = txt;
      }
    }
    
    throw new Error(`voice-task failed: ${errorMsg}`);
  }

  // Prefer JSON; if it fails, fall back to text for logging
  let apiResult;
  try {
    apiResult = await res.json();
  } catch (parseErr) {
    const txt = await res.text().catch(() => "(no body)");
    console.error("[worker] response json parse error", { body: txt, parseErr });
    throw new Error("invalid json from /api/voice-task");
  }

  console.log("[worker] parse/insert success", { result: apiResult });

  // --- TEMPLATE-ONLY SUMMARY (no scheduled_task_id expected) ---
  const resultSummaryObj = {
    // The new route returns only template info, not a full "task" object
    template_id: apiResult?.template_id ?? null,
    saved_to: apiResult?.saved_to ?? "task_templates",
    note: apiResult?.note ?? "Template created; scheduled instances will be created by the Python scheduler.",

    // Keep a short preview for UI context
    transcript_preview: truncateTranscript(transcript),
  };

  await supa
    .from("voice_jobs")
    .update({
      status: "inserted", // i.e., “inserted into DB as a TEMPLATE”
      inserted_at: now,
      error_code: null,
      error_message: null,
      // canonical JSON for the UI
      result_summary: JSON.stringify(resultSummaryObj),
    })
    .eq("job_id", job_id);

  console.log(`[worker] job ${job_id} — inserted ✅ (template only)`);
}

async function processQueuedJobs() {
  const { data: jobs, error } = await supa
    .from("voice_jobs")
    .select("job_id,user_id,storage_path,status,draft_transcript,created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw new Error("DB select failed: " + error.message);
  if (!jobs || jobs.length === 0) {
    console.log("[worker] no queued jobs");
    return 0; // Return count of jobs processed
  }

  console.log(`[worker] processing ${jobs.length} job(s) in parallel...`);

  // Process jobs in parallel for better performance
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        await processOne(job);
        return { success: true, job_id: job.job_id };
      } catch (e) {
        const rawMsg = e?.message || String(e);
        console.error(`[worker] job ${job.job_id} FAILED:`, rawMsg);
        
        // Provide actionable error messages for users
        let errorCode = "WORKER_ERROR";
        let userMessage = rawMsg;
        
        if (rawMsg.includes("download failed") || rawMsg.includes("DOWNLOAD_ERROR")) {
          errorCode = "DOWNLOAD_ERROR";
          userMessage = "Could not download audio file. Please try uploading again.";
        } else if (rawMsg.includes("audio too quiet") || rawMsg.includes("no speech")) {
          errorCode = "TRANSCRIPTION_EMPTY";
          userMessage = "No speech detected in audio. Please re-record in a quieter environment.";
        } else if (rawMsg.includes("OpenAI") || rawMsg.includes("transcription")) {
          errorCode = "TRANSCRIPTION_ERROR";
          userMessage = "Transcription service error. Please try again in a few moments.";
        } else if (rawMsg.includes("voice-task failed") || rawMsg.includes("HTTP")) {
          errorCode = "PARSE_ERROR";
          userMessage = "Could not parse task from transcript. Please try describing your task more clearly.";
        } else if (rawMsg.includes("validation") || rawMsg.includes("Validation failed")) {
          errorCode = "VALIDATION_ERROR";
          userMessage = "Task details could not be validated. Please check your input and try again.";
        }
        
        await supa
          .from("voice_jobs")
          .update({
            status: "error",
            error_code: errorCode,
            error_message: userMessage,
          })
          .eq("job_id", job.job_id);
        
        return { success: false, job_id: job.job_id, error: userMessage };
      }
    })
  );

  // Summary of results
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
  console.log(`[worker] batch complete: ${succeeded} succeeded, ${failed} failed`);
  
  return jobs.length; // Return count of jobs processed
}

// Worker with idle auto-shutdown (stops after 2 minutes of inactivity)
async function runWorkerWithTimeout() {
  const POLL_INTERVAL_MS = 3000; // Check every 3 seconds
  const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
  
  let lastJobTime = Date.now();
  
  console.log("[worker] Starting worker with auto-shutdown (idle timeout: 2 minutes)");
  
  while (true) {
    try {
      const jobCount = await processQueuedJobs();
      
      if (jobCount > 0) {
        // Reset idle timer when jobs are found
        lastJobTime = Date.now();
      } else {
        // Check if we've been idle too long
        const idleTime = Date.now() - lastJobTime;
        if (idleTime > IDLE_TIMEOUT_MS) {
          console.log(`[worker] Shutting down after ${Math.round(idleTime / 1000)}s of inactivity`);
          process.exit(0);
        }
      }
    } catch (e) {
      console.error("[worker] error in batch:", e?.message || e);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Start the worker
runWorkerWithTimeout().catch(e => {
  console.error("[worker] fatal:", e?.message || e);
  process.exit(1);
});
