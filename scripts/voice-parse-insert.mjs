// scripts/voice-parse-insert.mjs
import { createClient } from '@supabase/supabase-js';
// Add near the top (after imports)
const BASE = process.env.API_BASE || 'http://localhost:3000';

async function fetchJsonVerbose(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, options);
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch (err) {
    console.error(`[parse-insert] FETCH ERROR url=${url}`);
    console.error(`[parse-insert] options=${JSON.stringify({
      method: options.method,
      headers: options.headers,
      bodyPreview: typeof options.body === 'string'
        ? options.body.slice(0, 500)
        : (options.body ? '(binary or object)' : null),
    })}`);
    console.error(`[parse-insert] error=${err?.message || String(err)}`);
    throw err;
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i === process.argv.length - 1) throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
}

const missing = [
  !process.env.SUPABASE_URL && 'SUPABASE_URL',
  !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
if (missing.length) {
  console.error('Missing env vars:', missing);
  process.exit(1);
}

const JOB_ID = arg('--job'); // UUID
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

try {
  // 1) Load the transcribed job
  const { data: jobs, error: selErr } = await supa
    .from('voice_jobs')
    .select('job_id,user_id,transcript,status')
    .eq('job_id', JOB_ID)
    .limit(1);

  if (selErr) throw new Error('DB read failed: ' + selErr.message);
  if (!jobs || jobs.length === 0) throw new Error('Job not found');
  const job = jobs[0];

  if (!job.transcript || job.status !== 'transcribed') {
    throw new Error(`Job not ready to parse (status=${job.status}, transcript=${job.transcript ? 'present' : 'missing'})`);
  }

  // 2) Call your existing parser endpoint
  console.log('[parse] posting to /api/voice-task …');
  const res = await fetchJsonVerbose('/api/voice-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: job.transcript,
      user_id: job.user_id
    })
  });

  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Parser failed: HTTP ${res.status} → ${text}`);
  }

  // 3) Update DB: inserted
  const { error: updErr } = await supa
    .from('voice_jobs')
    .update({
      status: 'inserted',
      updated_at: new Date().toISOString(),
      // optional: keep the parser result for audit/debug
      error: null,
      transcript: job.transcript
    })
    .eq('job_id', JOB_ID);

  if (updErr) throw new Error('DB update failed: ' + updErr.message);

  console.log('[parse] done → status=inserted');
  console.log('[parse] parser response (truncated):', JSON.stringify(parsed).slice(0, 300) + '…');
  process.exit(0);
} catch (e) {
  console.error('[parse] FAILED:', e.message || e);
  try {
    await supa.from('voice_jobs')
      .update({ status: 'failed', error: String(e), updated_at: new Date().toISOString() })
      .eq('job_id', JOB_ID);
  } catch {}
  process.exit(1);
}
