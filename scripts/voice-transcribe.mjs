// scripts/voice-transcribe.mjs
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i === process.argv.length - 1) throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
}

const envMissing = [
  !process.env.SUPABASE_URL && 'SUPABASE_URL',
  !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY',
].filter(Boolean);
if (envMissing.length) {
  console.error('Missing env vars:', envMissing);
  process.exit(1);
}

const JOB_ID = arg('--job'); // UUID of the queued job

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function guessContentType(storagePath) {
  const ext = path.extname(storagePath).toLowerCase();
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.webm') return 'audio/webm';
  if (ext === '.mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

try {
  console.log('[worker] loading job', JOB_ID);

  // 1) Load the job
  const { data: jobs, error: selErr } = await supa
    .from('voice_jobs')
    .select('job_id,user_id,storage_path,status')
    .eq('job_id', JOB_ID)
    .limit(1);

  if (selErr) throw new Error('DB read failed: ' + selErr.message);
  if (!jobs || jobs.length === 0) throw new Error('Job not found');
  const job = jobs[0];

  if (job.status !== 'queued') {
    console.log('[worker] job not queued (status=', job.status, ') — exiting');
    process.exit(0);
  }

  const objectKey = job.storage_path.replace(/^voice\//, '');
  const contentType = guessContentType(job.storage_path);

  // 2) Get a short-lived signed URL to download the audio
  const { data: signed, error: sErr } = await supa.storage.from('voice').createSignedUrl(objectKey, 60);
  if (sErr || !signed?.signedUrl) throw new Error('Cannot sign download URL: ' + (sErr?.message || 'unknown'));

  console.log('[worker] downloading audio from Storage …');
  const audioResp = await fetch(signed.signedUrl);
  if (!audioResp.ok) throw new Error('Download failed: HTTP ' + audioResp.status);
  const audioBytes = new Uint8Array(await audioResp.arrayBuffer());
  console.log('[worker] audio size:', audioBytes.length);

  // 3) Transcribe with OpenAI (Whisper v1)
  console.log('[worker] transcribing with OpenAI whisper-1 …');
  const file = new File([audioBytes], 'audio' + path.extname(job.storage_path), { type: contentType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'text'
  });

  const transcript = typeof transcription === 'string'
    ? transcription
    : transcription.text ?? String(transcription);

  console.log('[worker] transcript length:', transcript.length);

  // 4) Update DB: status -> 'transcribed', save transcript
  const { error: updErr } = await supa
    .from('voice_jobs')
    .update({
      status: 'transcribed',
      transcript,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', JOB_ID);
  if (updErr) throw new Error('DB update failed: ' + updErr.message);

  console.log('[worker] done → status=transcribed');
  process.exit(0);
} catch (e) {
  console.error('[worker] FAILED:', e.message || e);
  // best-effort error save
  try {
    await supa.from('voice_jobs')
      .update({ status: 'failed', error: String(e), updated_at: new Date().toISOString() })
      .eq('job_id', JOB_ID);
  } catch {}
  process.exit(1);
}
