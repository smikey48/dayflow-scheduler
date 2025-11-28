"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Row = {
  scheduled_task_id: string;
  title: string;
  notes: string | null;
  is_appointment: boolean;
  is_fixed: boolean;
  is_routine: boolean;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;   // "HH:MM:SS"
  duration_minutes: number | null;
  is_completed: boolean | null;
};

function fmtTime(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5); // HH:MM
}

function Badge(props: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100">
      {props.children}
    </span>
  );
}

export default function TodayClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // who am I?
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setError(`auth.getUser(): ${userErr.message}`);
      return;
    }
    setAuthUid(userData.user ? userData.user.id : null);

    // Get today's date in local timezone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

    // Fetch today's tasks directly from scheduled_tasks (enforces RLS)
    const { data, error } = await supabase
      .from("scheduled_tasks")
      .select("id, title, description, is_appointment, is_routine, start_time, end_time, duration_minutes, is_completed, is_fixed")
      .eq("local_date", today)
      .eq("is_deleted", false)
      .order("start_time", { ascending: true, nullsFirst: false });
    
    if (error) {
      setError(error.message);
    } else {
      // Map to Row type
      const mappedRows = (data || []).map(task => ({
        scheduled_task_id: task.id,
        title: task.title,
        notes: task.description,
        is_appointment: task.is_appointment || false,
        is_fixed: task.is_fixed || false,
        is_routine: task.is_routine || false,
        start_time: task.start_time ? task.start_time.split('T')[1]?.split('.')[0] || null : null,
        end_time: task.end_time ? task.end_time.split('T')[1]?.split('.')[0] || null : null,
        duration_minutes: task.duration_minutes,
        is_completed: task.is_completed,
      }));
      setRows(mappedRows as Row[]);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for schedule recreation events to refresh data
    const handleScheduleRecreated = () => {
      loadData();
    };
    window.addEventListener('scheduleRecreated', handleScheduleRecreated);

    return () => {
      window.removeEventListener('scheduleRecreated', handleScheduleRecreated);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
        <p className="font-medium text-red-700">Failed to load today’s schedule</p>
        <pre className="mt-2 overflow-x-auto text-xs text-red-800">{error}</pre>
        <p className="mt-2 text-xs text-red-800">
          Tip: ensure you’re signed in and the view grants <code>select</code> to{" "}
          <code>authenticated</code>.
        </p>
      </div>
    );
  }

  if (rows === null) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500">
        No items for today.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const hasStart = Boolean(t.start_time);
        return (
          <li
            key={String(t.scheduled_task_id)}
            className="rounded-2xl border p-3 hover:bg-gray-50 transition"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{t.title}</p>
                  {t.is_appointment ? <Badge>Appt</Badge> : null}
                  {t.is_routine ? <Badge>Routine</Badge> : null}
                  {t.is_fixed && hasStart ? <Badge>Fixed</Badge> : null}
                  {!hasStart ? <Badge>Floating</Badge> : null}
                </div>
                {t.notes ? (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{t.notes}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                {hasStart ? (
                  <p className="tabular-nums text-sm">
                    {fmtTime(t.start_time)}
                    {t.end_time ? <>–{fmtTime(t.end_time)}</> : null}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">~{t.duration_minutes ?? 25}m</p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
