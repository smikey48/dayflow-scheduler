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

// Check scheduled_tasks for deleted instances today
const { data: scheduled, error: schedError } = await sb
  .from('scheduled_tasks')
  .select('id, title, template_id, is_deleted, local_date')
  .eq('user_id', userId)
  .eq('title', taskTitle)
  .eq('local_date', '2025-11-29');

console.log('Scheduled tasks for today:');
console.log(JSON.stringify(scheduled, null, 2));

if (schedError) {
  console.error('Error:', schedError);
}
