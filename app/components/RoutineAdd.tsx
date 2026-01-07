// components/RoutineAdd.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';

type Props = {
  userId: string;
  onAdded?: () => void;
};

function clampPriority(n: unknown) {
  let p = Number(n);
  if (!Number.isFinite(p)) p = 1;
  if (p < 1) p = 1;
  if (p > 5) p = 5;
  return p;
}

type Repeat = 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly' | 'annual';

export function RoutineAdd({ userId, onAdded }: Props) {
  // Core fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<number>(1);
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatInterval, setRepeatInterval] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number | ''>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [duration, setDuration] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleDay = (i: number) =>
    setRepeatDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  function todayYmd(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  }

  useEffect(() => {
    setDateStr((prev) => (prev && prev.trim() ? prev : todayYmd()));
  }, []);

  function dowFromYmd(ymd: string): number | null {
    if (!ymd) return null;
    const d = new Date(ymd + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return d.getDay();
  }

  function domFromYmd(ymd: string): number | null {
    if (!ymd) return null;
    const d = new Date(ymd + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return d.getDate();
  }

  function buildTemplatePayload(): Record<string, any> {
    const startTimeNormalized = startTime ? `${startTime}:00` : null;
    const durationMinutes = Number(duration === '' ? 0 : duration);

    const payload: Record<string, any> = {
      user_id: userId,
      title,
      description: description || null,
      kind: 'routine',
      repeat,
      repeat_unit: repeat,
      repeat_interval: repeatInterval || 1,
      active: true,
      timezone: 'Europe/London',
      is_appointment: false,
      is_routine: true,
      is_fixed: false,
      priority: clampPriority(priority),
    };

    if (repeat !== 'none') {
      payload.repeat_interval = repeatInterval || 1;

      // 🔑 CRITICAL: Include date as reference for interval calculations
      // When repeat_interval > 1, scheduler uses this date to calculate when task is due
      // E.g., biweekly task created on Nov 10 will be due Nov 10, Nov 24, Dec 8, etc.
      // Annual repeats MUST have a reference date for month/day matching
      if (dateStr && (repeatInterval > 1 || repeat === 'monthly' || repeat === 'annual')) {
        payload.date = dateStr;
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

    if (startTimeNormalized) payload.start_time = startTimeNormalized;
    payload.duration_minutes = durationMinutes;

    return payload;
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setPriority(1);
    setRepeat('daily');
    setRepeatDays([]);
    setRepeatInterval(1);
    setDayOfMonth('');
    setDateStr(todayYmd());
    setStartTime('');
    setDuration('');
    setErr(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    if (!startTime || !duration) {
      setErr('Please provide start time and duration for the routine.');
      return;
    }

    if (repeat === 'monthly' && dayOfMonth === '' && !dateStr) {
      setErr('Please provide a day-of-month or a date to derive it for a monthly repeat.');
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const payload = buildTemplatePayload();
      console.log('RoutineAdd insert payload:', JSON.stringify(payload, null, 2));
      const { error } = await supabase.from('task_templates').insert(payload);
      if (error) throw error;

      resetForm();
      onAdded?.();
    } catch (e: any) {
      setErr(e.message ?? 'Failed to add routine');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-4 rounded-xl border-2 shadow-sm bg-green-50">
      <h3 className="text-lg font-semibold mb-3">Add Routine</h3>

      {err && <div className="mb-2 text-sm text-red-600">{err}</div>}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Routine title"
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

        <div className="flex items-center gap-3 text-sm">
          <label className="min-w-24">Repeat:</label>
          <select
            className="border rounded px-2 py-1"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as Repeat)}
          >
            <option value="daily">Daily</option>
            <option value="weekday">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly (by date)</option>
            <option value="annual">Annual (yearly)</option>
          </select>
          {repeat !== 'none' && (
            <div className="flex items-center gap-2">
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
                  : repeat === 'annual'
                  ? repeatInterval === 1 ? 'year' : 'years'
                  : ''}
              </span>
            </div>
          )}
        </div>

        {repeat === 'weekly' && (
          <div className="text-sm">
            <div className="mb-1">Days:</div>
            <div className="flex gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((lbl, i) => {
                const py = (i + 6) % 7;
                const active = repeatDays.includes(py);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(py)}
                    className={
                      'px-2 py-1 border rounded ' + (active ? 'bg-green-200 font-semibold' : '')
                    }
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
              placeholder="1–31"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm mb-1">
              {repeat !== 'none' && repeatInterval > 1 
                ? 'Reference date (for interval)' 
                : 'Date (optional)'}
            </label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={dateStr}
              onChange={(e) => {
                setDateStr(e.target.value);
                setErr(null);
              }}
            />
            {repeat !== 'none' && repeatInterval > 1 && (
              <p className="text-xs text-gray-600 mt-1">
                Sets when the interval starts. E.g., biweekly from Nov 10 → Nov 10, 24, Dec 8...
              </p>
            )}
          </div>

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
              required
            />
          </div>

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
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="bg-green-600 hover:bg-green-700 text-white rounded px-4 py-2 text-sm font-medium"
          >
            {busy ? 'Adding…' : 'Add Routine'}
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={busy}
            className="border rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}
