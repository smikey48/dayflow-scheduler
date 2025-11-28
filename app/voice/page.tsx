// C:\Projects\dayflow-ui\dayflow2-gui\app\voice\page.tsx
import Recorder from "../components/voice/Recorder";

export default function VoicePage() {
  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center gap-4">
        <a 
          href="/"
          className="text-gray-600 hover:text-gray-900 transition-colors"
          title="Back to home"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </a>
        <h1 className="text-2xl font-semibold">Voice to Task</h1>
      </div>
      <p className="text-sm opacity-80">
        Record a short note. We&apos;ll upload it to Storage and track the job status.
      </p>

      <div className="text-xs opacity-60 border rounded px-2 py-1">
        /voice page v2 — Recorder imported directly
      </div>

      <Recorder />
    </main>
  );
}



