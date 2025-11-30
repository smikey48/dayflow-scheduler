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
const taskTitle = 'code dayflow2 - correct schedule logic';

const { data, error } = await sb
  .from('task_templates')
  .select('id, title, is_deleted, active')
  .eq('user_id', userId)
  .eq('title', taskTitle);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('Task template status:');
console.log(JSON.stringify(data, null, 2));
