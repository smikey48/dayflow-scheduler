// Check coffee/reading task for today
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

async function checkCoffeeToday() {
  const userId = '3c877140-9539-47b9-898a-45eeab392e39';
  const today = '2025-11-24';

  console.log('Checking scheduled_tasks for coffee/reading on', today);
  const { data: tasks, error: taskError } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', today)
    .ilike('title', '%coffee%')
    .order('start_time');

  if (taskError) {
    console.error('Error fetching tasks:', taskError);
    process.exit(1);
  }

  console.log('\nFound', tasks.length, 'coffee/reading tasks:');
  tasks.forEach(task => {
    console.log('\n---');
    console.log('ID:', task.id);
    console.log('Title:', task.title);
    console.log('Start:', task.start_time);
    console.log('End:', task.end_time);
    console.log('Template ID:', task.template_id);
    console.log('Is Routine:', task.is_routine);
    console.log('Created at:', task.created_at);
  });

  console.log('\n\nChecking template:');
  const templateId = '209e8601-0b9f-42de-8a50-6406327d06fa';
  const { data: template, error: templateError } = await supabase
    .from('task_templates')
    .select('title, start_time, updated_at')
    .eq('id', templateId)
    .single();

  if (templateError) {
    console.error('Error fetching template:', templateError);
  } else {
    console.log('Template start_time:', template.start_time);
    console.log('Template updated_at:', template.updated_at);
  }
}

checkCoffeeToday();
