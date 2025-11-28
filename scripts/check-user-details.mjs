// Check full user details including banned status
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const email = process.argv[2];

if (!email) {
  console.error('Usage: node check-user-details.mjs <email>');
  process.exit(1);
}

async function checkUser() {
  try {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      console.error(`User with email ${email} not found`);
      return;
    }

    console.log('User Details:');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Email Confirmed:', user.email_confirmed_at ? 'Yes' : 'No');
    console.log('Confirmed At:', user.email_confirmed_at);
    console.log('Created At:', user.created_at);
    console.log('Last Sign In:', user.last_sign_in_at);
    console.log('Banned Until:', user.banned_until || 'Not banned');
    console.log('Phone:', user.phone || 'None');
    console.log('Role:', user.role);
    console.log('\nFull user object:');
    console.log(JSON.stringify(user, null, 2));
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkUser();
