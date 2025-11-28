// Delete coffee/reading task for today so it can be recreated
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteCoffeeToday() {
  const userId = '3c877140-9539-47b9-898a-45eeab392e39';
  const taskId = '43b8d474-1e83-4695-93bf-b6db0ed7e832';

  console.log('Deleting coffee/reading task for 2025-11-24...');
  
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting task:', error);
    process.exit(1);
  }

  console.log('✓ Deleted coffee/reading task');
  console.log('Now run the scheduler to recreate it at 11:00');
}

deleteCoffeeToday();
