// C:\Projects\dayflow-ui\dayflow2-gui\app\components\voice\Recorder.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import createClient from "../../../lib/supabaseBrowser";

// -------- Constants --------
const DEFAULTS = {
  FLOATING_DURATION_MIN: 25,
  POLL_TIMEOUT_MS: 45_000,
  TRANSCRIPT_PREVIEW_LEN: 120,
  AUDIO_BITRATE: 32_000, // 32 kbps for voice
  MIN_POLL_DELAY_MS: 1_000,
} as const;

const POLL_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 13000] as const;

// -------- Types --------
type JobStatus = {
  job_id: string;
  status: "queued" | "transcribed" | "inserted" | "error" | string;
  error_code?: string | null;
  error_message?: string | null;
  result_summary?: string | null;
  queued_at?: string | null;
  transcribed_at?: string | null;
  inserted_at?: string | null;
};
// --- Lightweight live parser (front-end heuristic) ---
type LiveDraft = {
  title: string | null;
  local_date: string | null;      // 'YYYY-MM-DD'
  start_time_local: string | null; // 'HH:MM'
  end_time_local: string | null;   // 'HH:MM'
  duration_minutes: number | null;
  task_type: "appointment" | "floating";
};

function two(n: number) { return n.toString().padStart(2, "0"); }
function toLondonDateISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d); // yyyy-mm-dd
}
function nextWeekdayISO(name: string) {
  const names = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const idx = names.indexOf(name.toLowerCase());
  if (idx < 0) return null;
  const now = new Date();
  const londonTodayISO = toLondonDateISO(now);
  const today = new Date(londonTodayISO + "T00:00:00Z");
  const cur = today.getUTCDay();
  let add = (idx - cur + 7) % 7;
  if (add === 0) add = 7; // next occurrence
  const dt = new Date(today.getTime() + add * 86400000);
  return toLondonDateISO(dt);
}

function parseLiveDraft(transcript: string): LiveDraft {
  const t = transcript.toLowerCase();

  // Task type cues
  let task_type: LiveDraft["task_type"] = /appointment|meeting|call with|zoom|teams/.test(t)
    ? "appointment"
    : "floating";

  // Title: explicit "title: ..." takes precedence; else extract first sentence
  let title: string | null = null;
  const mTitle = /\btitle\s*[:\-]\s*(.+)$/i.exec(transcript);
  if (mTitle) {
    title = mTitle[1].trim();
  } else {
    // Extract first sentence or clause (up to punctuation or "for"/"at")
    const cleaned = transcript
      .replace(/\b(add|please|can you|could you|um|uh|like|okay|so)\b/gi, "")
      .trim();
    
    if (cleaned) {
      // Try to extract up to first sentence boundary or time marker
      const sentences = cleaned.match(/^[^.!?]+/);
      let extracted = sentences ? sentences[0] : cleaned;
      
      // Further trim at time markers to get cleaner titles
      const timeMarkers = /\s+(for|at|from|on|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+/i;
      const timeMatch = extracted.match(timeMarkers);
      if (timeMatch && timeMatch.index) {
        extracted = extracted.slice(0, timeMatch.index);
      }
      
      // Limit to reasonable length (100 chars max)
      title = extracted.trim().slice(0, 100);
    }
  }

  // Date
  let local_date: string | null = null;
  if (/\btoday\b/.test(t)) local_date = toLondonDateISO();
  else if (/\btomorrow\b/.test(t)) {
    const base = new Date(toLondonDateISO() + "T00:00:00Z");
    local_date = toLondonDateISO(new Date(base.getTime() + 86400000));
  } else {
    const wd = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t)?.[1];
    if (wd) local_date = nextWeekdayISO(wd);
  }
  if (!local_date) local_date = toLondonDateISO(); // default today

  // Time “at HH:MM” or “from HH:MM to HH:MM” (tolerate “3 pm”)
  const hm = (h: number, m: number, ampm?: string) => {
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${two(h)}:${two(m)}`;
  };

  let start_time_local: string | null = null;
  let end_time_local: string | null = null;

  // Time range: "from X to Y" or "X to Y" (with more flexible patterns)
  const mRange =
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:to|until|-)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);
  if (mRange) {
    start_time_local = hm(parseInt(mRange[1]), parseInt(mRange[2] ?? "0"), mRange[3] as any);
    end_time_local = hm(parseInt(mRange[4]), parseInt(mRange[5] ?? "0"), mRange[6] as any);
  } else {
    // Single time: "at X" or just "X pm" or "X o'clock"
    const mAt = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|o'clock)?\b/.exec(t);
    if (mAt && mAt[3]) { // only match if there's a clear time indicator
      const timeIndicator = mAt[3] === "o'clock" ? undefined : mAt[3];
      start_time_local = hm(parseInt(mAt[1]), parseInt(mAt[2] ?? "0"), timeIndicator as any);
    }
  }

  // Duration: "for 20 minutes", "for half an hour", "for 1 hour 15", "quarter hour"
  let duration_minutes: number | null = null;
  const mMin = /\bfor\s+(\d{1,3})\s*(minute|minutes|min|mins|m)\b/.exec(t);
  const mHourMin = /\bfor\s+(\d{1,2})\s*(hour|hours|hr|hrs|h)\s*(?:and\s+)?(\d{1,2})?\s*(min|minute|minutes|mins|m)?\b/.exec(t);
  const mHalf = /\b(?:for\s+)?(?:half|30)\s+(?:an?\s+)?(?:hour|hr)\b/.exec(t);
  const mQuarter = /\b(?:for\s+)?(?:quarter|15)\s+(?:of\s+)?(?:an?\s+)?(?:hour|hr)\b/.exec(t);
  
  if (mMin) {
    duration_minutes = parseInt(mMin[1]);
  } else if (mHourMin) {
    const hours = parseInt(mHourMin[1]);
    const mins = mHourMin[3] ? parseInt(mHourMin[3]) : 0;
    duration_minutes = hours * 60 + mins;
  } else if (mHalf) {
    duration_minutes = 30;
  } else if (mQuarter) {
    duration_minutes = 15;
  }

  // If it's clearly an appointment and has a time, encourage appointment type
  if (start_time_local && task_type === "floating") {
    task_type = /appointment|meeting|call/.test(t) ? "appointment" : "floating";
  }

  return {
    title: title || null,
    local_date,
    start_time_local,
    end_time_local,
    duration_minutes,
    task_type,
  };
}

// -------- Component --------
export default function Recorder() {
  const supabase = createClient();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaSupported, setMediaSupported] = useState<boolean | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Job state
  const [job, setJob] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);

  const [liveDraft, setLiveDraft] = useState<LiveDraft>({
    title: null,
    local_date: null,
    start_time_local: null,
    end_time_local: null,
    duration_minutes: null,
    task_type: "floating",
  });


  // Narrow status/summary for UI
  const [jobStatus, setJobStatus] = useState<'queued' | 'transcribed' | 'inserted' | 'error' | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [pollCountdown, setPollCountdown] = useState<number | null>(null); // seconds left

  // Worker state
  const [workerStatus, setWorkerStatus] = useState<'online' | 'stopped' | 'unknown'>('unknown');

  // Draft STT state (front-end transcription)
  const [sttSupported, setSttSupported] = useState<boolean | null>(null);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [draftTranscript, setDraftTranscript] = useState("");


  // Refs
  const chunks = useRef<BlobPart[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pollTimer = useRef<any>(null);

  const LAST_JOB_KEY = "d2_last_voice_job_id";

  function saveLastJobId(id: string) {
    try { localStorage.setItem(LAST_JOB_KEY, id); } catch {}
  }
  function getLastJobId(): string | null {
    try { return localStorage.getItem(LAST_JOB_KEY); } catch { return null; }
  }
  function clearLastJobId() {
    try { localStorage.removeItem(LAST_JOB_KEY); } catch {}
  }

  // --- Single-flight guards for polling (kept) ---
  const pollAbortRef = useRef<boolean>(false);
  const lastFetchAtRef = useRef<number>(0);

  // Centralized stop (kept)
  function stopPolling() {
    setPolling(false);
    setPollCountdown(null);
    pollAbortRef.current = true;
    if (pollTimer.current) {
      try { clearTimeout(pollTimer.current); } catch {}
      try { clearInterval(pollTimer.current); } catch {}
      pollTimer.current = null;
    }
  }


async function refreshStatusOnce() {
  if (!job?.job_id) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const r = await fetch(`/api/voice/jobs/${job.job_id}`, {
      cache: "no-store",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    if (!r.ok) {
      setErrorMessage(`Refresh failed: ${r.status}`);
      return;
    }

    const payload: JobStatus = await r.json();
    setJob(payload);
    setJobStatus(
      (payload.status as "queued" | "transcribed" | "inserted" | "error") ?? "queued"
    );
    setResultSummary(payload.result_summary ?? null);
    setErrorMessage(payload.error_message ?? null);
  } catch (e: any) {
    setErrorMessage(e?.message ?? "Refresh failed");
  }
}




  // Start a safe polling loop with exponential backoff to reduce unnecessary requests
  async function startPollingLoop(jobId: string, token?: string) {
    // If a previous loop was running, abort it
    stopPolling();

    pollAbortRef.current = false;
    setPolling(true);
    
    const startedAt = Date.now();
    let pollIndex = 0;

    const tick = async () => {
      if (pollAbortRef.current) return;

      // Throttle defensive: never fetch more frequently than minimum delay
      const now = Date.now();
      if (now - lastFetchAtRef.current < DEFAULTS.MIN_POLL_DELAY_MS) {
        pollTimer.current = setTimeout(tick, DEFAULTS.MIN_POLL_DELAY_MS);
        return;
      }

      try {
        lastFetchAtRef.current = now;
        const r = await fetch(`/api/voice/jobs/${jobId}`, {
          cache: "no-store",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });

        if (!r.ok) {
          setJobStatus("error");
          setErrorMessage(`GET /api/voice/jobs failed: ${r.status}`);
          stopPolling();
          return;
        }

        const payload: JobStatus & { draft_transcript?: string } = await r.json();
        setJob(payload);
        setJobStatus(
          (payload.status as "queued" | "transcribed" | "inserted" | "error") ?? "queued"
        );
        setResultSummary(payload.result_summary ?? null);
        setErrorMessage(payload.error_message ?? null);

        // Countdown update
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, Math.ceil((DEFAULTS.POLL_TIMEOUT_MS - elapsed) / 1000));
        setPollCountdown(remaining);

        if (payload.status === "inserted" || payload.status === "error") {
          stopPolling();
          clearLastJobId?.();
          return;
        }

        if (elapsed > DEFAULTS.POLL_TIMEOUT_MS) {
          stopPolling();
          setMessage(
            "Polling stopped after 45s. Job is likely still queued — start the worker to progress it."
          );
          return;
        }
      } catch {
        // keep countdown moving even on transient errors
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, Math.ceil((DEFAULTS.POLL_TIMEOUT_MS - elapsed) / 1000));
        setPollCountdown(remaining);

        if (elapsed > DEFAULTS.POLL_TIMEOUT_MS) {
          stopPolling();
          setMessage(
            "Polling stopped after 45s. Job is likely still queued — start the worker to progress it."
          );
          return;
        }
      }

      // Schedule next tick with exponential backoff (use last delay if we've exceeded the array)
      const nextDelay = POLL_DELAYS_MS[Math.min(pollIndex, POLL_DELAYS_MS.length - 1)];
      pollIndex++;
      pollTimer.current = setTimeout(tick, nextDelay);
    };

    // kick off
    pollTimer.current = setTimeout(tick, 0);
  }

  const speechRecRef = useRef<any>(null); // use 'any' to avoid missing TS types
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // ------ Helpers ------

  function stopTranscription() {
    try {
      (speechRecRef.current as any)?.stop();
    } catch {}
    speechRecRef.current = null;
    setIsTranscribing(false);
    // Clear interim text ONLY (finalText is preserved, which keeps draftTranscript intact)
    setInterimText("");
  }

  const startTranscription = useCallback(() => {
    if (!sttSupported || !autoTranscribe || isTranscribing) return;

    const SR: any =
      (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) ||
      null;
    if (!SR) return;

    const rec: any = new SR();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
    // local accumulators for THIS event tick
    let interim = "";
    let finals = "";

    // Always iterate ALL results (from 0) to capture everything including early parts
    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finals += (finals ? " " : "") + res[0].transcript.trim();
      } else {
        interim += res[0].transcript;
      }
    }

    // update UI state
    setInterimText(interim);
    setFinalText(finals);

    // build live draft from the combined text (finals + interim)
    const combined = (finals + " " + interim).trim();
    setDraftTranscript(combined);
    setLiveDraft(parseLiveDraft(combined));
  };


    rec.onerror = (event: any) => {
      // Show user-friendly error message
      const errorType = event.error || 'unknown';
      let userMessage = 'Live transcription stopped';
      
      if (errorType === 'no-speech') {
        userMessage = 'No speech detected. Please speak clearly into your microphone.';
      } else if (errorType === 'audio-capture') {
        userMessage = 'Microphone error. Please check your audio settings.';
      } else if (errorType === 'not-allowed') {
        userMessage = 'Microphone access denied. Please allow microphone permissions.';
      } else if (errorType === 'network') {
        userMessage = 'Network error during transcription. Your recording is still saved.';
      }
      
      setMessage(userMessage);
      stopTranscription();
    };

    rec.onend = () => {
      // Chrome sometimes ends unexpectedly; restart if still recording
      if (isRecording && autoTranscribe) {
        try {
          rec.start();
        } catch {}
      } else {
        setIsTranscribing(false);
      }
    };

    try {
      rec.start();
      speechRecRef.current = rec;
      setIsTranscribing(true);
    } catch {}
  }, [autoTranscribe, finalText, isRecording, isTranscribing, sttSupported]);

  // Capability detection + cleanup
  useEffect(() => {
    const mediaOK = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setMediaSupported(mediaOK);

    const SR: any =
      (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) ||
      null;
    setSttSupported(!!SR);

    return () => {
      stopPolling(); // handles both timeout and interval now
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      stopTranscription();
      // Clean up MediaStream tracks to prevent resource leaks
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    };
  }, [objectUrl]);


  useEffect(() => {
    const combined = (finalText + " " + interimText).trim();
    setDraftTranscript(combined);
    setLiveDraft(parseLiveDraft(combined));
  }, [finalText, interimText]);



  // Resume polling for a pending job on mount (if any)
  useEffect(() => {
    const resume = async () => {
      const savedId = getLastJobId();
      if (!savedId || job) return;

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        const r = await fetch(`/api/voice/jobs/${savedId}`, {
          cache: "no-store",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!r.ok) {
          clearLastJobId();
          return;
        }

        const payload: JobStatus & { draft_transcript?: string } = await r.json();
        setJob(payload);
        setJobStatus(
          (payload.status as 'queued' | 'transcribed' | 'inserted' | 'error') ?? 'queued'
        );
        setResultSummary(payload.result_summary ?? null);
        setErrorMessage(payload.error_message ?? null);

        // If terminal, clear and don’t resume polling
        if (payload.status === 'inserted' || payload.status === 'error') {
          clearLastJobId();
          return;
        }

        // Otherwise, resume polling with a fresh 45s window (single-flight guard)
        startPollingLoop(savedId, token);
      } catch {
        // ignore
      }
    };

    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const startRecording = useCallback(async () => {
    setMessage("");
    setDraftTranscript("");
    setFinalText("");
    setInterimText("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaSupported(false);
      setMessage("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Use compressed audio format with lower bitrate for voice (reduces file size significantly)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const rec = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: DEFAULTS.AUDIO_BITRATE  // 32 kbps is sufficient for voice, reduces file size by ~75%
      });
      chunks.current = [];

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.current.push(e.data);
    };

    rec.onstop = () => {
      const b = new Blob(chunks.current, { type: rec.mimeType });
      setBlob(b);
      const url = URL.createObjectURL(b);
      setObjectUrl(url);

      // stop all tracks
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;

      // finalize STT - but preserve the final transcript text
      stopTranscription();
      
      // Keep the final transcript visible after stopping (don't clear it)
      // The transcript is already in finalText state from Speech Recognition
    };

      recorderRef.current = rec;
      
      // Start front-end transcription BEFORE starting recording to ensure it's ready
      if (sttSupported && autoTranscribe) {
        startTranscription();
        // Small delay to ensure Speech Recognition is fully initialized
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      rec.start();
      setIsRecording(true);
    } catch (e: any) {
      // Handle microphone access errors
      let errorMsg = "Could not access microphone. ";
      const errName = e?.name || "";
      
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        errorMsg += "Please allow microphone permissions in your browser settings.";
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        errorMsg += "No microphone found. Please connect a microphone and try again.";
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        errorMsg += "Microphone is already in use by another application.";
      } else if (errName === "OverconstrainedError") {
        errorMsg += "Microphone does not support the required settings.";
      } else {
        errorMsg += e?.message || "Please check your browser settings and try again.";
      }
      
      setMessage(errorMsg);
      setMediaSupported(false);
    }
  }, [autoTranscribe, sttSupported, startTranscription]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const startWorker = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const res = await fetch("/api/voice/worker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "start" }),
      });

      if (res.ok) {
        const result = await res.json();
        setWorkerStatus('online');
        console.log("[recorder] worker started:", result.message);
      } else {
        console.error("[recorder] failed to start worker:", await res.text());
      }
    } catch (e: any) {
      console.error("[recorder] worker start error:", e?.message || e);
    }
  }, [supabase.auth]);

  const uploadAndQueue = useCallback(async () => {
    if (!blob) return;
    console.log('[Recorder] uploadAndQueue starting', { blobSize: blob.size, draftTranscript });
    setUploading(true);
    setMessage("");

    // Capture transcript value at upload time (not when callback is defined)
    const transcriptToUpload = draftTranscript;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const ext = blob.type.includes("webm") ? "webm" : "m4a";
      const contentType = blob.type || "audio/webm";
      const sizeBytes = blob.size;

      // 1) Get signed URL + job_id
      const res = await fetch("/api/voice/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          filenameExt: ext,
          contentType,
          sizeBytes,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`upload-url failed ${res.status}: ${errBody}`);
      }

      const { job_id, signedUrl, storage_path } = await res.json();

      // 2) PUT audio to signed URL
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: blob,
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`signed PUT failed ${putRes.status}: ${errText}`);
      }

      // 3) Notify /api/voice/jobs with front-end draft transcript (if any)
      const postJob = await fetch("/api/voice/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          job_id,
          storage_path,
          status: "queued",
          draft_transcript: transcriptToUpload || null,
          content_type: contentType,
          size_bytes: sizeBytes,
        }),
      });

      if (!postJob.ok) {
        const errText = await postJob.text();
        console.warn("POST /api/voice/jobs non-OK:", postJob.status, errText);
      }

      setJob({ job_id, status: "queued" });
      setJobStatus('queued');
      setResultSummary(null);
      setErrorMessage(null);
      setMessage("Upload complete. Draft transcript attached. Tracking job status…");
      setUploading(false);

      // 4) Optionally seed job from POST response (ignore if not JSON)
      try {
        if (postJob.ok) {
          const seeded = await postJob.json();
          setJob((prev) => ({
            ...(prev ?? { job_id, status: "queued" }),
            job_id: seeded.job_id ?? job_id,
            status: (seeded.status as JobStatus["status"]) ?? "queued",
            error_code: seeded.error_code ?? null,
            error_message: seeded.error_message ?? null,
            result_summary: seeded.result_summary ?? null,
            queued_at: seeded.queued_at ?? null,
            transcribed_at: seeded.transcribed_at ?? null,
            inserted_at: seeded.inserted_at ?? null,
          }));
        }
      } catch {
        // ignore JSON errors
      }

      // Save and start polling
      saveLastJobId(job_id);
      startPollingLoop(job_id, token);

      // Auto-start worker to process the job
      await startWorker();
    } catch (e: any) {
      console.error(e);
      
      // Provide user-friendly error messages
      let userMessage = "Upload failed. Please try again.";
      const errMsg = e?.message || "";
      
      if (errMsg.includes("Unauthorized") || errMsg.includes("401")) {
        userMessage = "Authentication failed. Please sign in again.";
      } else if (errMsg.includes("403") || errMsg.includes("Forbidden")) {
        userMessage = "Access denied. Please check your permissions.";
      } else if (errMsg.includes("413") || errMsg.includes("too large")) {
        userMessage = "Audio file is too large. Please record a shorter message.";
      } else if (errMsg.includes("network") || errMsg.includes("fetch")) {
        userMessage = "Network error. Please check your connection and try again.";
      } else if (errMsg.includes("upload-url failed")) {
        userMessage = "Could not prepare upload. Please try again in a moment.";
      } else if (errMsg.includes("signed PUT failed")) {
        userMessage = "Upload to storage failed. Please try again.";
      }
      
      setMessage(userMessage);
      setUploading(false);
    }
  }, [blob, draftTranscript, supabase.auth]);

  // ------ UI ------
  return (
    <div className="space-y-4">
      {/* Worker status indicator */}
      {workerStatus === 'online' && (
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Worker active — processing jobs automatically
        </div>
      )}

      {/* Capability banners */}
      {mediaSupported === false && (
        <div className="text-red-600 text-sm">
          Microphone recording isn&apos;t supported in this browser.
        </div>
      )}
      {sttSupported === false && (
        <div className="text-amber-600 text-sm">
          Live transcription isn&apos;t supported in this browser. You can still record & upload.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <button
            className="px-4 py-2 rounded-2xl shadow text-sm border hover:bg-gray-50 transition-colors"
            onClick={startRecording}
            disabled={mediaSupported === false}
            title="Start microphone recording"
          >
            🎙️ Start Recording
          </button>
        ) : (
          <button
            className="px-4 py-2 rounded-2xl shadow text-sm border bg-red-50 hover:bg-red-100 transition-colors relative"
            onClick={stopRecording}
            title="Stop and save recording"
          >
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              ⏹️ Stop Recording
            </span>
          </button>
        )}

        <button
          className="px-4 py-2 rounded-2xl shadow text-sm border disabled:opacity-50"
          onClick={() => {
            console.log('[Recorder] Upload & Queue button clicked', { blob, uploading });
            uploadAndQueue();
          }}
          disabled={!blob || uploading}
          title="Upload audio and attach draft transcript"
        >
          {uploading ? "Uploading..." : "Upload & Queue"}
        </button>

        <label className="flex items-center gap-2 text-sm ml-auto">
          <input
            type="checkbox"
            className="scale-110"
            checked={autoTranscribe}
            onChange={(e) => setAutoTranscribe(e.target.checked)}
            disabled={sttSupported === false || isRecording}
          />
          Use in-browser draft transcription
        </label>
      </div>

      {/* Recorded audio preview */}
      {blob && (
        <div className="space-y-2">
          <div className="text-sm opacity-80">
            Size: {(blob.size / 1024).toFixed(1)} KB • Type: {blob.type || "audio/webm"}
          </div>
          {objectUrl && (
            <audio controls src={objectUrl} className="w-full">
              Your browser does not support the audio element.
            </audio>
          )}
        </div>
      )}

      {/* Transcript panel */}
      <div className="rounded-xl border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Draft transcript</div>
          {isTranscribing && <div className="text-xs opacity-70">listening…</div>}
        </div>

        <textarea
          className="w-full min-h-[140px] rounded-xl border p-3 text-sm"
          placeholder={
            sttSupported
              ? "Your transcript will appear here. You can edit it before uploading."
              : "Live transcription not supported in this browser. You can type a draft here if you want."
          }
          value={draftTranscript}
          onChange={(e) => setDraftTranscript(e.target.value)}
        />

        {sttSupported && (
          <div className="text-xs opacity-70">
            Interim: {interimText || <span className="opacity-50">—</span>}
          </div>
        )}
      </div>

      {/* Messages */}
      {message && <div className="text-sm">{message}</div>}

      {/* Job card */}
      {job && (
        <div className="rounded-xl border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Job</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs underline text-gray-500 hover:text-gray-700"
                title="Refresh status now"
                onClick={refreshStatusOnce}
              >
                Refresh status
              </button>
              <button
                type="button"
                className="text-xs underline text-gray-500 hover:text-gray-700"
                title="Forget saved job id (won’t affect server state)"
                onClick={() => {
                  clearLastJobId();
                  setMessage("Forgot saved job id. This won’t affect the server job.");
                }}
              >
                Forget job
              </button>
              <div className="text-xs text-gray-500 break-all">ID: {job.job_id}</div>
            </div>

          </div>

          {/* Progress pills + countdown */}
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                (jobStatus ?? job.status) === "queued"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Queued
            </span>
            <span className="text-gray-400">→</span>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                ["transcribed", "inserted"].includes((jobStatus ?? job.status) as string)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Transcribed
            </span>
            <span className="text-gray-400">→</span>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                (jobStatus ?? job.status) === "inserted"
                  ? "bg-green-100 text-green-700"
                  : (jobStatus ?? job.status) === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {(jobStatus ?? job.status) === "error" ? "Error" : "Inserted"}
            </span>

            {polling && typeof pollCountdown === "number" && (
              <span className="ml-auto text-xs text-gray-500">
                Checking… {pollCountdown}s
              </span>
            )}
          </div>

          {/* Raw status line */}
          <div className="text-sm">Status: {jobStatus ?? job.status}</div>

          {/* Error banner */}
          {(errorMessage || job.error_message) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage ?? job.error_message} {job.error_code ? `(${job.error_code})` : ""}
            </div>
          )}

          {/* Server-stored draft transcript */}
          {"draft_transcript" in job && (job as any).draft_transcript ? (
            <div className="text-sm">
              <div className="opacity-70 mb-1">Server draft transcript:</div>
              <div className="whitespace-pre-wrap border rounded p-2 text-xs bg-gray-50/50">
                {(job as any).draft_transcript}
              </div>
            </div>
          ) : null}

          {/* Success card when inserted (template-only flow) */}
          {(jobStatus ?? job.status) === "inserted" &&
            (() => {
              let summary: any = null;
              try {
                summary = resultSummary ? JSON.parse(resultSummary) : null;
              } catch {
                summary = null;
              }

              const templateId = summary?.template_id ?? null;
              const savedTo = summary?.saved_to ?? "task_templates";
              const note =
                typeof summary?.note === "string"
                  ? summary.note
                  : "Template created. It will appear in your schedule after the Python scheduler runs.";
              const transcriptPreview = summary?.transcript_preview ?? null;

              return (
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">✅ Task Template Created</h3>
                    <span className="text-xs rounded-full bg-green-100 text-green-700 px-2 py-0.5">
                      Inserted
                    </span>
                  </div>

                  <div className="mt-2 text-sm text-gray-700 space-y-2">
                    <div>
                      <span className="font-medium">Saved to:</span> {savedTo}
                    </div>
                    {templateId && (
                      <div className="break-all">
                        <span className="font-medium">Template ID:</span> {templateId}
                      </div>
                    )}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-sm">
                      <strong>Next steps:</strong> Your task template has been created. The Python scheduler will automatically generate scheduled tasks from this template. This usually happens within 5 minutes, or you can manually trigger it from the Today page.
                    </div>
                  </div>

                  {transcriptPreview && (
                    <div className="mt-3 text-xs text-gray-600 border-t pt-2">
                      <span className="font-medium">Transcript:</span>{" "}
                      <span className="whitespace-pre-wrap">{transcriptPreview}</span>
                    </div>
                  )}
                </div>
              );
            })()}


          {/* Polling hint */}
          {polling && (
            <div className="text-xs opacity-70">
              Polling… {typeof pollCountdown === "number" ? `${pollCountdown}s` : ""}
            </div>
          )}
          {!polling &&
            job &&
            !["inserted", "error"].includes((jobStatus ?? job.status) as string) && (
              <div className="text-xs opacity-70">
                Hint: start your voice worker to move jobs from <code>queued</code> →{" "}
                <code>transcribed</code> → <code>inserted</code>.
              </div>
            )}
        </div>
      )}
    </div>
  );
}

