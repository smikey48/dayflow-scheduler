"use client";

import React from "react";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

export default function ReviseScheduleButton({ onSuccess }: { onSuccess?: () => void }) {
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState<null | { ok: boolean; msg: string }>(null);
  const hideTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // clear any old timer when unmounting
  React.useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  async function runRevise() {
    setIsRunning(true);
    setStatus(null);
    try {
      const supabase = supabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();

      // Create abort controller with 2 minute timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

      console.log('[ReviseSchedule] Starting request...');
      const res = await fetch("/api/revise-schedule", {
        method: "POST",
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ""}` 
        },
        body: JSON.stringify({ force: true, write: true }),
        signal: controller.signal,
      });

      console.log('[ReviseSchedule] Response status:', res.status);
      clearTimeout(timeoutId);
      const data = await res.json();
      console.log('[ReviseSchedule] Response data:', data);

      if (res.ok) {
        setStatus({ ok: true, msg: "Revised" });
        // Emit custom event for other components to listen to
        window.dispatchEvent(new CustomEvent('scheduleRecreated'));
        if (onSuccess) onSuccess();
      } else {
        // non-blocking inline error (no alert)
        setStatus({ ok: false, msg: data?.error || `Failed (code ${res.status})` });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus({ ok: false, msg: "Request timed out after 2 minutes" });
      } else {
        setStatus({ ok: false, msg: String(err?.message || err) });
      }
    } finally {
      setIsRunning(false);
      // auto-hide status after 3s
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setStatus(null), 3000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={runRevise}
        disabled={isRunning}
        className="px-3 py-1.5 rounded-2xl border bg-black text-white hover:opacity-90 disabled:opacity-50 text-sm"
        title="Recreate today's schedule from templates"
      >
        {isRunning ? "Recreating…" : "Recreate Schedule"}
      </button>

      {status && (
        <span
          className={
            "text-xs px-2 py-1 rounded-2xl " +
            (status.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")
          }
        >
          {status.ok ? (status.msg === 'Revised' ? 'Recreated' : status.msg) : status.msg}
        </span>
      )}
    </div>
  );
}
