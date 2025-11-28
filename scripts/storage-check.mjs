// scripts/storage-check.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.VOICE_BUCKET || 'voice';

// Usage: node scripts/storage-check.mjs "<storage_path_from_db>"
const rawArg = process.argv[2];
if (!rawArg) {
  console.error('Usage: node scripts/storage-check.mjs "<storage_path_from_db>"');
  process.exit(1);
}

const rawPath = rawArg.replace(/^\/+/, ''); // trim leading /
const withoutBucket = rawPath.startsWith(`${BUCKET}/`)
  ? rawPath.slice(BUCKET.length + 1)
  : rawPath;

const candidates = [
  { label: 'as_provided', path: rawPath },
  { label: 'without_bucket', path: withoutBucket },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function statObject(path) {
  try {
    const lastSlash = path.lastIndexOf('/');
    const prefix = lastSlash >= 0 ? path.slice(0, lastSlash) : '';
    const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

    const { data, error } = await supabase.storage.from(BUCKET).list(prefix || '', {
      search: filename,
      limit: 100,
    });
    if (error) return { ok: false, where: 'list', error };

    const entry = (data || []).find((d) => d.name === filename);
    if (!entry) return { ok: false, where: 'list', error: new Error('Not found in listing') };

    const dl = await supabase.storage.from(BUCKET).download(path);
    if (dl.error) return { ok: false, where: 'download', error: dl.error };

    const blob = dl.data;
    const size = blob.size ?? null;
    const type = blob.type ?? null;

    return { ok: true, meta: entry, size, type };
  } catch (e) {
    return { ok: false, where: 'exception', error: e };
  }
}

(async () => {
  console.log(`[check] bucket=${BUCKET}`);
  for (const c of candidates) {
    const res = await statObject(c.path);
    if (res.ok) {
      console.log(`[FOUND] ${c.label} path="${c.path}" size=${res.size} type=${res.type || '(unknown)'} meta=`, res.meta);
    } else {
      console.log(`[MISS]  ${c.label} path="${c.path}" via=${res.where} err=${res.error?.message || res.error}`);
    }
  }
})();

