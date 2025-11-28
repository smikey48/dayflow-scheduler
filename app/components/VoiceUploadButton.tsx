'use client';

import { useState } from 'react';
import { uploadVoiceFile } from '../../lib/voiceUpload'; // relative path to /lib

export default function VoiceUploadButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const { job_id } = await uploadVoiceFile(f);
      setMsg(`Uploaded. Job queued: ${job_id}`);
    } catch (err: any) {
      setMsg(`Error: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
      e.currentTarget.value = ''; // reset input so you can re-upload same file if needed
    }
  }

  return (
    <div className="flex items-center gap-3 p-2">
      <input
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.mp4,.flac"
        onChange={onPickFile}
        disabled={busy}
      />
      {busy && <span>Uploading…</span>}
      {msg && <span>{msg}</span>}
    </div>
  );
}
