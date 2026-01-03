'use client';

import { useState } from 'react';

export default function EmailBetaUsersPage() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendEmail() {
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message');
      return;
    }

    if (!confirm(`Send email to all active beta users?\n\nSubject: ${subject}\n\nThis action cannot be undone.`)) {
      return;
    }

    setIsSending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/email-beta-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send emails');
      }

      setResult(data);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <a
            href="/"
            className="text-gray-600 hover:text-gray-900 transition-colors"
            title="Back to home"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Email Beta Users</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Warning */}
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Admin Tool</h3>
              <p className="text-sm text-amber-800">
                This will send an email to all active beta users. Use carefully and double-check your message before sending.
              </p>
            </div>
          </div>
        </div>

        {/* Email Composer */}
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message to beta users..."
              rows={12}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              disabled={isSending}
            />
            <p className="text-sm text-gray-500 mt-2">
              Plain text format. Line breaks will be preserved.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-900 mb-2">✅ Emails Sent Successfully</p>
              <div className="text-sm text-green-800 space-y-1">
                <p>✉️ Sent: {result.sent}</p>
                {result.failed > 0 && <p>❌ Failed: {result.failed}</p>}
              </div>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-red-700">
                    View failed emails ({result.errors.length})
                  </summary>
                  <div className="mt-2 space-y-1 text-xs">
                    {result.errors.map((err: any, i: number) => (
                      <div key={i} className="bg-white rounded p-2 border border-red-200">
                        <p className="font-medium">{err.email}</p>
                        <p className="text-gray-600">{JSON.stringify(err.error)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          <button
            onClick={sendEmail}
            disabled={isSending || !subject.trim() || !message.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? 'Sending...' : 'Send Email to All Beta Users'}
          </button>
        </div>

        {/* Preview */}
        {(subject || message) && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Preview</h3>
            <div className="border rounded-lg p-4 bg-gray-50">
              {subject && (
                <p className="font-semibold text-lg mb-3">{subject}</p>
              )}
              {message && (
                <p className="whitespace-pre-wrap text-gray-700">{message}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
