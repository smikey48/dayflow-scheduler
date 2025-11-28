// components/QuickAdd.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { Playwrite_ES_Deco } from 'next/font/google';

type Props = {
  userId: string;
  onAdded?: () => void;
};

function clampPriority(n: unknown) {
  let p = Number(n);
  if (!Number.isFinite(p)) p = 3;
  if (p < 1) p = 1;
  if (p > 5) p = 5;
  return p;
}
type TaskType = 'floating' | 'routine' | 'appointment';
type Repeat = 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly';

export function QuickAdd({ userId, onAdded }: Props) {
  // Core fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<number>(3);
  // Task type + repeat UI
  const [type, setType] = useState<TaskType>('floating');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]); // 0=Sun..6=Sat
  const [repeatInterval, setRepeatInterval] = useState<number>(1);


  const [dayOfMonth, setDayOfMonth] = useState<number | ''>('');

  // Timing fields
  const [dateStr, setDateStr] = useState<string>('');     // YYYY-MM-DD (for one-off date, or to derive repeat metadata)
  const [startTime, setStartTime] = useState<string>(''); // HH:MM
  const [duration, setDuration] = useState<number | ''>(''); // minutes

  // NEW: optional scheduling window (HH:MM)
  const [windowStart, setWindowStart] = useState<string>(''); // e.g., "13:00"
  const [windowEnd, setWindowEnd] = useState<string>('');     // e.g., "17:30"
  const isHHMM = (s: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
  const windowDisabled = type === 'appointment'; // windows apply to floating/routine, not appointments

  // UX
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleDay = (i: number) =>
    setRepeatDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  function todayYmd(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  }
  // Set default date on mount if blank (Europe/London)
  useEffect(() => {
    setDateStr((prev) => (prev && prev.trim() ? prev : todayYmd()));
  }, []);

  

  function dowFromYmd(ymd: string): number | null {
    // ymd: YYYY-MM-DD
    if (!ymd) return null;
    const d = new Date(ymd + 'T12:00:00'); // noon to avoid DST edges
    if (isNaN(d.getTime())) return null;
    return d.getDay(); // 0=Sun..6=Sat
    }
  
  function domFromYmd(ymd: string): number | null {
    if (!ymd) return null;
    const d = new Date(ymd + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return d.getDate();
  }

  // Build a template row for task_templates
  function buildTemplatePayload(): Record<string, any> {
    const kind = type; // 'floating' | 'routine' | 'appointment'
    const isAppointment = kind === 'appointment';
    const isRoutine = kind === 'routine';

    // Use 25 min default for floating if user left it blank (UI already validates, but this is extra safety)
    const durationMinutes =
      kind === 'floating'
        ? Number(duration === '' ? 25 : duration)
        : Number(duration === '' ? 0 : duration);

    // Normalize start_time to HH:MM:00 if provided
    const startTimeNormalized = startTime ? `${startTime}:00` : null;

    const payload: Record<string, any> = {
      user_id: userId,
      title,
      description: description || null,

      // type/kind
      kind,

      // repeat controls (set both repeat and repeat_unit for compatibility)
      repeat,                     // 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly'
      repeat_unit: repeat,        // 🔑 CRITICAL: scheduler uses repeat_unit, not repeat
      repeat_interval: 1,
      active: true,
      timezone: 'Europe/London',
      // Conditional fields set below
    };

    // One-off templates: include a date so scheduler instantiates on that day
    // Always include repeat_interval if repeating
    if (repeat !== 'none') {
      payload.repeat_interval = repeatInterval || 1;
    }

    if (repeat === 'none') {
      payload.date = dateStr || todayYmd();
    } else {
      // 🔑 CRITICAL: Include date as reference for interval calculations
      // When repeat_interval > 1, scheduler uses this date to calculate when task is due
      // E.g., biweekly task with date=2025-11-10 will be due Nov 10, Nov 24, Dec 8, etc.
      // Always include for appointments (constraint + clarity) and interval > 1 tasks
      if (kind === 'appointment' || repeatInterval > 1 || repeat === 'monthly') {
        payload.date = dateStr || todayYmd();
      }

      if (repeat === 'weekly') {
        if (repeatDays.length > 0) {
          payload.repeat_days = repeatDays;
        } else {
          const derived = dowFromYmd(dateStr);
          payload.repeat_days = derived != null ? [derived] : null;
        }
      }
      if (repeat === 'weekday') {
        payload.repeat_days = [1, 2, 3, 4, 5];
      }
      if (repeat === 'monthly') {
        if (dayOfMonth !== '') {
          payload.day_of_month = Number(dayOfMonth);
        } else {
          const derived = domFromYmd(dateStr);
          payload.day_of_month = derived ?? null;
        }
      }
    }


    // Timing fields (used by routines and appointments; floating needs duration)
    if (startTimeNormalized) payload.start_time = startTimeNormalized;
    payload.duration_minutes = durationMinutes;

    // ---- NEW: flags derived from kind (must match DB constraints) ----
    payload.is_appointment = isAppointment;
    payload.is_routine = isRoutine;
    payload.is_fixed = isAppointment; // keep your convention that appointments are fixed
    payload.priority = clampPriority(priority);

    // NEW: optional scheduling window (apply when not appointment and both provided)
    if (!isAppointment && windowStart.trim() && windowEnd.trim()) {
      // Postgres TIME will accept "HH:MM" (seconds optional)
      payload.window_start_local = windowStart.trim();
      payload.window_end_local = windowEnd.trim();
    }

    return payload;

    }
    function resetForm() {
    setTitle('');
    setDescription('');
    setPriority(3);
    setType('floating');
    setRepeat('none');
    setRepeatDays([]);
    setRepeatInterval(1);
    setDayOfMonth('');
    setDateStr(todayYmd());  // re-defaults to today
    setStartTime('');
    setDuration('');
    setWindowStart('');
    setWindowEnd('');
    setErr(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    // ---- Validation rules ----
    // Floating always needs duration
    if (type === 'floating' && !duration) {
      setErr('Please provide a duration (minutes) for floating tasks.');
      return;
    }
    // Appointments must have time + duration; for one-off require date, for repeating we can derive weekday/month day from date (optional)
    if (type === 'appointment') {
      if (!startTime || !duration) {
        setErr('Please provide start time and duration for the appointment.');
        return;
      }
      if (repeat === 'none' && !dateStr) {
        setErr('Please provide a date for a one-off appointment.');
        return;
      }
    }
    // Monthly repeats must have a day-of-month or a date we can derive it from
    if (repeat === 'monthly' && dayOfMonth === '' && !dateStr) {
      setErr('Please provide a day-of-month or a date to derive it for a monthly repeat.');
      return;
    }

    // NEW: window validation (only when applicable)
    if (!windowDisabled) {
      const ws = windowStart.trim();
      const we = windowEnd.trim();
      if ((ws && !we) || (!ws && we)) {
        setErr('Please provide both window start and end, or leave both blank.');
        return;
      }
      if (ws && we) {
        if (!isHHMM(ws) || !isHHMM(we)) {
          setErr('Window times must be HH:MM (24-hour).');
          return;
        }
        const toMin = (s: string) => {
          const [h, m] = s.split(':').map(n => parseInt(n, 10));
          return h * 60 + m;
        };
        if (toMin(ws) >= toMin(we)) {
          setErr('Window start must be before window end.');
          return;
        }
      }
    }

    setBusy(true);
    setErr(null);


    try {
      const payload = buildTemplatePayload();
      console.log('QuickAdd insert payload:', JSON.stringify(payload, null, 2));
      const { error } = await supabase.from('task_templates').insert(payload);
      if (error) throw error;

      // If it's an appointment for today, automatically reschedule
      const isAppointmentForToday = type === 'appointment' && dateStr === todayYmd();
      if (isAppointmentForToday) {
        console.log('Appointment added for today - triggering reschedule');
        try {
          const rescheduleRes = await fetch('/api/scheduler/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, force: true })
          });
          if (!rescheduleRes.ok) {
            console.error('Reschedule failed:', await rescheduleRes.text());
          }
        } catch (rescheduleErr) {
          console.error('Failed to trigger reschedule:', rescheduleErr);
          // Don't block the UI - the appointment was added successfully
        }
      }

      resetForm();
      onAdded?.();


    } catch (e: any) {
      setErr(e.message ?? 'Failed to add task');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="p-4 rounded-xl border-2 shadow-sm bg-yellow-50 mt-3"
      data-test="quickadd-mounted"
    >
      <h3 className="text-lg font-semibold mb-3">Quick Add</h3>

      {err && <div className="mb-2 text-sm text-red-600">{err}</div>}

      <form onSubmit={onSubmit} className="space-y-3">
        {/* Title / Description */}
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Task Type */}
        <div className="flex items-center gap-3 text-sm">
          <label className="min-w-24">Task type:</label>
          <select
            className="border rounded px-2 py-1"
            value={type}
            onChange={(e) => {
              const next = e.target.value as TaskType;
              setType(next);
              // keep repeat as chosen; appointments can now repeat
            }}
          >
            <option value="floating">Floating</option>
            <option value="routine">Routine</option>
            <option value="appointment">Appointment</option>
          </select>
        </div>

        {/* Repeat (enabled for appointments now) */}
        <div className="flex items-center gap-3 text-sm">
          <label className="min-w-24">Repeat:</label>
          <select
            className="border rounded px-2 py-1"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as Repeat)}
          >
            <option value="none">Doesn’t repeat</option>
            <option value="daily">Daily</option>
            <option value="weekday">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly (by date)</option>
          </select>
          {repeat !== 'none' && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm">Every</label>
              <input
                type="number"
                min={1}
                value={repeatInterval}
                onChange={(e) => setRepeatInterval(Number(e.target.value))}
                className="w-16 border rounded px-2 py-1 text-sm"
              />
              <span className="text-sm">
                {repeat === 'daily'
                  ? repeatInterval === 1 ? 'day' : 'days'
                  : repeat === 'weekly'
                  ? repeatInterval === 1 ? 'week' : 'weeks'
                  : repeat === 'monthly'
                  ? repeatInterval === 1 ? 'month' : 'months'
                  : ''}
              </span>

            </div>
          )}


        </div>

        {/* Weekly day picker (works for any type now) */}
        {repeat === 'weekly' && (
          <div className="text-sm">
            {/* Optional: update the hint to match canonical indexing */}
            <div className="mb-1">Days (0=Mon…6=Sun):</div>
            <div className="flex gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((lbl, i) => {
                // map display order (Sun..Sat) → Python index (Mon=0..Sun=6)
                const py = (i + 6) % 7;
                const active = repeatDays.includes(py);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(py)}
                    className={
                      'px-2 py-1 border rounded ' + (active ? 'font-semibold underline' : '')
                    }
                    aria-pressed={active}
                    title={`Index ${py}`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        )}


        {/* Monthly day-of-month */}
        {repeat === 'monthly' && (
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Day</label>
            <input
              type="number"
              min={1}
              max={31}
              className="border rounded px-2 py-1 w-24"
              value={dayOfMonth}
              onChange={(e) => {
                const v = e.target.value;
                setDayOfMonth(v === '' ? '' : Math.max(1, Math.min(31, Number(v))));
              }}
              placeholder={dateStr ? `Derived from ${dateStr}` : '1–31'}
            />
          </div>
        )}

        {/* Optional single date (used for one-off, or to derive repeat params) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm mb-1">
              {repeat !== 'none' && repeatInterval > 1
                ? 'Reference date (for interval)'
                : type === 'appointment' && repeat !== 'none'
                ? 'Start date'
                : 'Date (optional)'}
            </label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={dateStr}
              onChange={(e) => {
                setDateStr(e.target.value);
                setErr(null); // clear any previous "date required" or related error
              }}
            />
            {repeat !== 'none' && repeatInterval > 1 && (
              <p className="text-xs text-gray-600 mt-1">
                Sets when the interval starts. E.g., every 2 weeks from Nov 10 → Nov 10, 24, Dec 8...
              </p>
            )}
          </div>

          {/* Start time (needed for appointment; optional for routine) */}
          <div>
            <label className="block text-sm mb-1">Start time</label>
            <input
              type="time"
              className="w-full border rounded px-2 py-1"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setErr(null);
              }}
            />

          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="priority" className="w-36">Priority (1=high)</label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(clampPriority(e.target.value))}
              className="border rounded px-2 py-1"
            >
              <option value={1}>1 – Highest</option>
              <option value={2}>2</option>
              <option value={3}>3 (default)</option>
              <option value={4}>4</option>
              <option value={5}>5 – Lowest</option>
            </select>
          </div>
          {/* Duration */}
          <div>
            <label className="block text-sm mb-1">Duration (min)</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded px-2 py-1"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value === '' ? '' : Number(e.target.value));
                setErr(null);
              }}
              required={type === 'floating' || type === 'appointment'}
            />

          </div>
        </div>

                {/* NEW: Optional scheduling window (applies to floating/routine) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Window start (HH:MM)</label>
            <input
              type="time"
              className="w-full border rounded px-2 py-1"
              value={windowStart}
              onChange={(e) => {
                setWindowStart(e.target.value);
                setErr(null);
              }}

              disabled={windowDisabled}
              placeholder="13:00"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Window end (HH:MM)</label>
            <input
              type="time"
              className="w-full border rounded px-2 py-1"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              disabled={windowDisabled}
              placeholder="17:30"
            />
          </div>
        </div>
        <p className="text-xs text-gray-600">
          Optional. If set, this task will only be scheduled within this range.
        </p>

        {/* Submit */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="border rounded px-3 py-2 text-sm"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={busy}
            className="border rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>

          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>

      </form>
    </section>
  );
}
