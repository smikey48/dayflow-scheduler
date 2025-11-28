// Script to directly set a user's password in Supabase
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
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node set-password.mjs <email> <new-password>');
  console.error('Example: node set-password.mjs user@example.com MyNewPassword123');
  process.exit(1);
}

async function setPassword() {
  try {
    // Get the user by email
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

    console.log('Found user:', user.id, user.email);

    // Update the user's password directly
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (error) {
      console.error('Error setting password:', error);
      return;
    }

    console.log('✅ Password set successfully!');
    console.log('You can now log in with:');
    console.log('  Email:', email);
    console.log('  Password:', newPassword);
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

setPassword();
