"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

type Phase =
  | "idle"
  | "minting"
  | "uploading"
  | "queueing"
  | "processing"
  | "done"
  | "error";

type UploadUrlResponse = {
  job_id: string;
  storage_path: string; // e.g. "voice/<user_id>/<job_id>" or ".../<job_id>.webm"
  signedUrl: string;    // not used with uploadToSignedUrl, but fine to keep
  token?: string;       // required for uploadToSignedUrl
};

type VoiceJob = {
  job_id: string;
  status: "created" | "queued" | "transcribed" | "inserted" | `error_${string}`;
  storage_path?: string;
  content_type?: string;
  size_bytes?: number;
  error_code?: string | null;
  error_message?: string | null;
  result_summary?: {
    title?: string;
    local_date?: string;
    duration_minutes?: number | null;
    notes?: string | null;
  };
};

const BUCKET = "voice";

export default function VoiceUploader() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  // ---- helpers ----
  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setJobId(null);
    setMessage("");
    setProgress(0);
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const handleSelectFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      setFile(f);
      setMessage(f ? `Selected: ${f.name} (${f.type || "unknown type"})` : "");
    },
    []
  );

  async function safeJson(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  const getAccessToken = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  // 1) Mint upload URL (send Authorization so the route can authenticate)
  const mintUploadUrl = useCallback(async (): Promise<UploadUrlResponse> => {
    const token = await getAccessToken();

    const res = await fetch("/api/voice/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}), // backend derives user_id from auth context
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("upload-url error:", res.status, text);
      throw new Error(`Failed to mint upload URL (${res.status})`);
    }
    try {
      return JSON.parse(text) as UploadUrlResponse;
    } catch {
      console.error("upload-url non-JSON:", text);
      throw new Error("Failed to mint upload URL (bad JSON)");
    }
  }, [getAccessToken]);

  // 2) Upload using Supabase's signed upload helper (token is required)
  async function uploadViaSignedUrl(
    fullStoragePath: string, // e.g. "voice/<uid>/<job_id>" or ".../<job_id>.webm"
    token: string,
    f: File
  ) {
    setProgress(0);

    // Convert fullStoragePath to object key relative to the bucket
    const objectKey = fullStoragePath.startsWith(`${BUCKET}/`)
      ? fullStoragePath.slice(BUCKET.length + 1)
      : fullStoragePath;

    const { error } = await supabaseBrowser.storage
      .from(BUCKET)
      .uploadToSignedUrl(objectKey, token, f, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });

    if (error) throw error;

    // No progress events with uploadToSignedUrl; mark complete on success
    setProgress(100);
  }

  // 3) Queue the job after upload (send Authorization as well)
  const queueJob = useCallback(
    async (job_id: string, storage_path: string, f: File) => {
      const token = await getAccessToken();

      const res = await fetch("/api/voice/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          job_id,
          storage_path,
          content_type: f.type || "application/octet-stream",
          size_bytes: f.size,
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("queue job error:", res.status, text);
        throw new Error("Failed to queue job");
      }
      try {
        return JSON.parse(text) as VoiceJob;
      } catch {
        console.error("queue job non-JSON:", text);
        throw new Error("Failed to queue job (bad JSON)");
      }
    },
    [getAccessToken]
  );

  // 4) Poll job status until inserted (send Authorization too, for safety)
  const fetchJob = useCallback(
    async (jid: string): Promise<VoiceJob> => {
      const token = await getAccessToken();

      const res = await fetch(`/api/voice/jobs/${encodeURIComponent(jid)}`, {
        method: "GET",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("poll job error:", res.status, text);
        throw new Error("Failed to fetch job");
      }
      try {
        return JSON.parse(text) as VoiceJob;
      } catch {
        console.error("poll job non-JSON:", text);
        throw new Error("Failed to fetch job (bad JSON)");
      }
    },
    [getAccessToken]
  );

  const scheduleNextPoll = useCallback(
    (jid: string) => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(async () => {
        try {
          const job = await fetchJob(jid);
          if (job.status?.startsWith("error_")) {
            setPhase("error");
            setMessage(job.error_message || "Processing failed");
            return;
          }
          if (job.status === "inserted") {
            setPhase("done");
            setMessage("Voice processed and task inserted.");
            return;
          }
          // keep waiting
          setPhase("processing");
          setMessage(`Processing… Current status: ${job.status}`);
          scheduleNextPoll(jid);
        } catch (err: any) {
          console.error(err);
          setPhase("error");
          setMessage(err?.message || "Polling failed");
        }
      }, 2000); // 2s between polls
    },
    [fetchJob]
  );

  // Button click: full flow
  const onUploadAndQueue = useCallback(async () => {
    if (!file) return;
    try {
      setPhase("minting");
      setMessage("Requesting upload URL…");
      const minted = await mintUploadUrl();
      setJobId(minted.job_id);

      setPhase("uploading");
      setMessage("Uploading audio…");
      if (!minted.token) throw new Error("Missing upload token from server");
      await uploadViaSignedUrl(minted.storage_path, minted.token, file);

      setPhase("queueing");
      setMessage("Verifying upload & queueing job…");
      const job = await queueJob(minted.job_id, minted.storage_path, file);

      setPhase("processing");
      setMessage(`Queued. Waiting for processing… (status: ${job.status})`);
      scheduleNextPoll(minted.job_id);
    } catch (err: any) {
      console.error(err);
      setPhase("error");
      setMessage(err?.message || "Unexpected error");
    }
  }, [file, mintUploadUrl, queueJob, scheduleNextPoll]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  // ---- UI ----
  return (
    <div className="max-w-xl rounded-2xl border p-5 shadow-sm space-y-4">
      <h2 className="text-xl font-semibold">Voice to Task (Beta)</h2>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Choose audio file</label>
        <input
          type="file"
          accept=".webm,.m4a,.mp3,.wav,audio/webm,audio/mp4,audio/mpeg,audio/wav"
          onChange={handleSelectFile}
          disabled={phase !== "idle"}
          className="block w-full text-sm"
        />
        {file && (
          <p className="text-sm text-gray-600">
            Selected: <span className="font-medium">{file.name}</span>{" "}
            <span>({file.type || "unknown type"})</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onUploadAndQueue}
          disabled={!file || phase !== "idle"}
          className="rounded-2xl px-4 py-2 text-sm font-medium shadow-sm border hover:shadow transition disabled:opacity-50"
        >
          Upload &amp; Queue
        </button>

        {(phase === "done" || phase === "error") && (
          <button
            onClick={reset}
            className="rounded-2xl px-3 py-2 text-sm border"
          >
            Reset
          </button>
        )}
      </div>

      {/* progress bar */}
      {phase === "uploading" && (
        <div className="w-full">
          <div className="h-2 w-full rounded bg-gray-200">
            <div
              className="h-2 rounded bg-gray-600"
              style={{ width: `${progress}%` }}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-sm mt-1">Uploading… {progress}%</p>
        </div>
      )}

      {/* status line */}
      <p className="text-sm">
        <span className="font-medium">Status:</span>{" "}
        {phase === "idle" && "Idle — pick a file to begin."}
        {phase === "minting" && "Requesting upload URL…"}
        {phase === "uploading" && `Uploading… ${progress}%`}
        {phase === "queueing" && "Queueing job…"}
        {phase === "processing" && "Processing…"}
        {phase === "done" && "Done."}
        {phase === "error" && (
          <span className="text-red-600">Error — see message below.</span>
        )}
      </p>

      {!!message && (
        <div className="rounded-md border p-3 text-sm">
          <p>{message}</p>
          {jobId && (
            <p className="text-xs text-gray-600 mt-1">
              job_id: <code>{jobId}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

