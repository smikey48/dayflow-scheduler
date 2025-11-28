// lib/voiceUpload.ts
import { createClient } from '@supabase/supabase-js';

// Browser-side client (public anon key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const VOICE_BUCKET = process.env.NEXT_PUBLIC_VOICE_BUCKET || 'voice';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true },
});

// Simple map for common audio types -> extension
function extFromContentType(ct: string) {
  const c = (ct || '').toLowerCase();
  if (c.includes('wav')) return '.wav';
  if (c.includes('mpeg') || c.includes('mp3')) return '.mp3';
  if (c.includes('m4a')) return '.m4a';
  if (c.includes('ogg')) return '.ogg';
  if (c.includes('webm')) return '.webm';
  if (c.includes('mp4')) return '.mp4';
  if (c.includes('flac')) return '.flac';
  return '.wav';
}

export async function uploadVoiceFile(file: File) {
  // 1) Ask server for a signed upload URL + token
  const contentType = file.type || 'audio/wav';
  const filename = file.name?.trim() || `recording${extFromContentType(contentType)}`;

  const res = await fetch('/api/voice/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // server creates job_id + storage_path (bucket-relative) with an extension
    body: JSON.stringify({ filename, contentType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`upload-url failed: ${err.error || res.statusText}`);
  }

  const { job_id, storage_path, token } = await res.json();

  // 2) Upload the binary to the signed path
  //    uploadToSignedUrl will set Content-Type based on the File object's type
  const up = await supabase.storage
    .from(VOICE_BUCKET)
    .uploadToSignedUrl(storage_path, token, file);

  if (up.error) {
    throw new Error(`upload failed: ${up.error.message}`);
  }

  // 3) (Recommended) Mark job queued AFTER successful upload
  //    so the worker won’t try to download before the file exists.
  const mark = await fetch('/api/voice/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Your /api/voice/jobs already verifies object existence — good.
    body: JSON.stringify({ job_id }),
  });

  if (!mark.ok) {
    const err = await mark.json().catch(() => ({}));
    throw new Error(`mark queued failed: ${err.error || mark.statusText}`);
  }

  return { job_id, storage_path };
}
