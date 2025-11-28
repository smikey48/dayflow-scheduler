// scripts/storage-list.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.VOICE_BUCKET || 'voice';

// Usage:
//   node scripts/storage-list.mjs              # lists root
//   node scripts/storage-list.mjs "<prefix>"   # lists that folder
const prefix = (process.argv[2] || '').replace(/^\/+/, '').replace(/\/+$/, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

(async () => {
  console.log(`[list] bucket=${BUCKET} prefix="${prefix}"`);
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) {
    console.error(`[list] ERROR: ${error.message}`);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log('[list] (empty)');
    return;
  }
  for (const entry of data) {
    const type = entry.id ? 'file' : 'dir';
    // entry has: name, id (only on files), updated_at, created_at, last_accessed_at, metadata, etc.
    console.log(`${type.padEnd(4)}  ${entry.name}`);
  }
})();
