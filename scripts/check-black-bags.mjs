import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from parent directory
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBlackBags() {
  // Check template
  const { data: templates, error: tError } = await supabase
    .from('task_templates')
    .select('id, title, window_start_local, window_end_local, kind, duration_minutes, priority, repeat_unit, repeat_interval, is_appointment, is_routine')
    .ilike('title', '%black bags%');

  if (tError) {
    console.error('Template error:', tError);
    return;
  }

  console.log('\n=== BLACK BAGS TEMPLATE ===');
  console.log(JSON.stringify(templates, null, 2));

  if (!templates || templates.length === 0) {
    console.log('No Black bags template found');
    return;
  }

  // Check today's scheduled task
  const today = new Date().toISOString().split('T')[0];
  const { data: scheduled, error: sError } = await supabase
    .from('scheduled_tasks')
    .select('title, start_time, end_time, local_date, is_appointment, is_routine')
    .eq('local_date', today)
    .ilike('title', '%black bags%');

  if (sError) {
    console.error('Scheduled error:', sError);
    return;
  }

  console.log('\n=== BLACK BAGS SCHEDULED FOR TODAY ===');
  console.log(JSON.stringify(scheduled, null, 2));
}

checkBlackBags();
