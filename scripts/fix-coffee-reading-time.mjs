// Fix coffee/reading template time back to 11:00
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

async function fixCoffeeReadingTime() {
  const templateId = '209e8601-0b9f-42de-8a50-6406327d06fa';
  const userId = '3c877140-9539-47b9-898a-45eeab392e39';

  console.log('Checking current coffee/reading template...');
  const { data: before, error: fetchError } = await supabase
    .from('task_templates')
    .select('title, start_time, updated_at')
    .eq('id', templateId)
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    console.error('Error fetching template:', fetchError);
    process.exit(1);
  }

  console.log('Before:', before);

  console.log('\nUpdating start_time to 11:00:00...');
  const { data: updated, error: updateError } = await supabase
    .from('task_templates')
    .update({ start_time: '11:00:00' })
    .eq('id', templateId)
    .eq('user_id', userId)
    .select('title, start_time, updated_at');

  if (updateError) {
    console.error('Error updating template:', updateError);
    process.exit(1);
  }

  console.log('After:', updated[0]);
  console.log('\n✓ Successfully updated coffee/reading to 11:00');
}

fixCoffeeReadingTime();
