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

const { data, error } = await sb
  .from('scheduled_tasks')
  .select('title, start_time, end_time, is_routine, is_deleted, is_completed')
  .eq('user_id', userId)
  .eq('local_date', '2025-11-29')
  .order('start_time');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('Today\'s schedule (ALL tasks including deleted):');
data.forEach(task => {
  const start = new Date(task.start_time);
  const end = new Date(task.end_time);
  const routine = task.is_routine ? ' (routine)' : '';
  const flags = ` del:${task.is_deleted} done:${task.is_completed}`;
  console.log(`${start.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})} - ${end.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})} ${task.title}${routine}${flags}`);
});
