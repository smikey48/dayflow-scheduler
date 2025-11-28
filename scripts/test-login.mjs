// Test login directly
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node test-login.mjs <email> <password>');
  process.exit(1);
}

async function testLogin() {
  try {
    console.log('Attempting to sign in with:', email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Login failed:', error.message);
      console.error('Error details:', error);
      return;
    }

    if (data.session) {
      console.log('✅ Login successful!');
      console.log('User ID:', data.user.id);
      console.log('Email:', data.user.email);
      console.log('Session expires:', new Date(data.session.expires_at * 1000));
    } else {
      console.log('⚠️  Login succeeded but no session');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testLogin();
