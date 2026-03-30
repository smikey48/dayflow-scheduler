"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SchedulerButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function runScheduler() {
    setIsRunning(true);
    setMessage(null);
    try {
      // Get today's date in Europe/London timezone as YYYY-MM-DD
      const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
      const body = {
        date: todayLocal,
        force: true,
        write: true,
      };

      const res = await fetch("/api/revise-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMessage(`Failed: ${data?.error ?? res.statusText}`);
      } else {
        setMessage("Schedule generated ✅");
        // Revalidate the server component data
        router.refresh();
        // Dispatch event to notify Calendar view to refresh
        window.dispatchEvent(new CustomEvent('scheduleRecreated'));
      }
    } catch (err: any) {
      setMessage(`Error: ${String(err?.message ?? err)}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={runScheduler}
        disabled={isRunning}
        className="px-4 py-2 rounded-2xl shadow border"
        aria-label="Generate today's schedule"
      >
        {isRunning ? "Generating…" : "Today"}
      </button>
      {message && <span className="text-sm">{message}</span>}
    </div>
  );
}

