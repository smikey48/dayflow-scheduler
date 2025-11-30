import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

const userId = '3c877140-9539-47b9-898a-45eeab392e39';

// Check deleted templates for this user
const { data: deleted, error: delError } = await sb
  .from('task_templates')
  .select('id, title, is_deleted')
  .eq('user_id', userId)
  .eq('is_deleted', true);

console.log('Deleted templates for user:', deleted?.length || 0);
if (deleted && deleted.length > 0) {
  console.log(JSON.stringify(deleted.slice(0, 5), null, 2));
}

// Check all deleted templates (no user filter)
const { data: allDeleted } = await sb
  .from('task_templates')
  .select('id, user_id, title, is_deleted')
  .eq('is_deleted', true);

console.log('\nAll deleted templates in database:', allDeleted?.length || 0);
