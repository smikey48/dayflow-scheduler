import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { subject, message, htmlMessage } = await request.json();

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Subject and message are required' },
        { status: 400 }
      );
    }

    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      return NextResponse.json(
        { error: 'Email service not configured (RESEND_API_KEY missing)' },
        { status: 500 }
      );
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all beta users
    const { data: betaUsers, error: fetchError } = await supabase
      .from('beta_users')
      .select('email, name');

    if (fetchError) {
      console.error('Error fetching beta users:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch beta users' },
        { status: 500 }
      );
    }

    if (!betaUsers || betaUsers.length === 0) {
      return NextResponse.json(
        { error: 'No beta users found' },
        { status: 404 }
      );
    }

    console.log(`Sending email to ${betaUsers.length} beta users...`);

    // Send individual emails (Resend doesn't support BCC for free tier)
    const results = [];
    const errors = [];

    for (const user of betaUsers) {
      if (!user.email) continue;

      const emailBody = {
        from: 'DayFlow <onboarding@resend.dev>',
        to: user.email,
        subject: subject,
        text: message,
        html: htmlMessage || `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">DayFlow Update</h2>
            <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
              You're receiving this email because you're a DayFlow beta user.
            </p>
          </div>
        `.trim(),
      };

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify(emailBody),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`Failed to send to ${user.email}:`, error);
          errors.push({ email: user.email, error });
        } else {
          const result = await response.json();
          results.push({ email: user.email, id: result.id });
        }

        // Rate limiting: wait 100ms between emails
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error sending to ${user.email}:`, error);
        errors.push({ email: user.email, error: String(error) });
      }
    }

    console.log(`Email campaign complete: ${results.length} sent, ${errors.length} failed`);

    return NextResponse.json({
      success: true,
      sent: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Email beta users error:', error);
    return NextResponse.json(
      { error: 'Failed to send emails', details: String(error) },
      { status: 500 }
    );
  }
}
