// scripts/jobs-peek.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[peek] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('[peek] url=', SUPABASE_URL);

const { data, error } = await supabase
  .from('voice_jobs')
  .select('job_id, user_id, status, storage_path, queued_at')
  .eq('status', 'queued')
  .order('queued_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('[peek] query error:', error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log('[peek] no queued jobs found');
} else {
  console.log('[peek] queued jobs:');
  for (const row of data) {
    console.log(` - ${row.job_id} | ${row.status} | ${row.storage_path} | queued_at=${row.queued_at}`);
  }
}
