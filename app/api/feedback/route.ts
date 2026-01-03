import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { feedback, userEmail, page } = await request.json();

    if (!feedback || typeof feedback !== 'string') {
      return NextResponse.json(
        { error: 'Feedback text is required' },
        { status: 400 }
      );
    }

    const emailBody = {
      from: 'DayFlow Feedback <onboarding@resend.dev>',
      to: 'mike_j_lewis@hotmail.co.uk',
      subject: `DayFlow Feedback - ${page || 'Unknown Page'}`,
      text: `
Feedback received from DayFlow application

Page: ${page || 'Unknown'}
User Email: ${userEmail || 'Anonymous'}
Timestamp: ${new Date().toISOString()}

Feedback:
${feedback}
      `.trim(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">DayFlow Feedback</h2>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Page:</strong> ${page || 'Unknown'}</p>
            <p><strong>User Email:</strong> ${userEmail || 'Anonymous'}</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
            <h3 style="margin-top: 0;">Feedback:</h3>
            <p style="white-space: pre-wrap;">${feedback}</p>
          </div>
        </div>
      `.trim(),
    };

    // For now, we'll use Resend API if available, otherwise log to console
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      // Send via Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: emailBody.from,
          to: emailBody.to,
          subject: emailBody.subject,
          html: emailBody.html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Resend API error:', error);
        throw new Error('Failed to send email via Resend');
      }

      const result = await response.json();
      console.log('Feedback email sent via Resend:', result);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Feedback sent successfully',
        method: 'resend'
      });
    } else {
      // Fallback: Log to console (for development/testing)
      console.log('=== FEEDBACK RECEIVED ===');
      console.log('Page:', page);
      console.log('User:', userEmail || 'Anonymous');
      console.log('Feedback:', feedback);
      console.log('========================');
      
      return NextResponse.json({ 
        success: true, 
        message: 'Feedback logged (no email service configured)',
        method: 'console'
      });
    }
  } catch (error) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
