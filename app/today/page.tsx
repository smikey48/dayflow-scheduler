// app/today/page.tsx
'use client';

import React, { useEffect, useState, useRef} from 'react';
import { supabaseBrowser } from '../../lib/supabaseBrowser';
import { useRouter } from 'next/navigation';
import FeedbackButton from '../components/FeedbackButton';

// (PriorityBadge removed - priority will be shown inline to the right of the title)



function fmtTime(value: string | null) {
  if (!value) return '';
  // If already "HH:MM" or "HH:MM:SS", just trim to HH:MM
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.slice(0, 5);
  }
  // Otherwise parse ISO and render in Europe/London
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  }).format(d);
}

function RepeatInfo({
  unit,
  interval,
  day,
  repeat,
  repeatDays,
  isRoutine,
  isAppointment,
}: {
  unit?: string | null;
  interval?: number | null;
  day?: number | null;
  repeat?: string | null;
  repeatDays?: number[] | null;
  isRoutine: boolean;
  isAppointment: boolean;
}) {
  const isFloating = !isRoutine && !isAppointment;

  // Prefer 'repeat_unit' (newer field) over 'repeat' (legacy field)
  // Only use 'repeat' if it's not 'none' and repeat_unit is empty
  let effUnit = "";
  if (unit && unit !== "none") {
    effUnit = unit.toLowerCase();
  } else if (repeat && repeat !== "none") {
    effUnit = repeat.toLowerCase();
  } else if (unit === "none" || repeat === "none") {
    effUnit = "none";
  }

  // Unknown → render nothing
  if (!effUnit) return null;

  // Only floating tasks can be called "One-off"
  if (isFloating && effUnit === "none") {
    return <p className="mt-1 text-xs text-gray-400">🔁 One-off task</p>;
  }
  // For routines/appointments with 'none', render nothing
  if (!isFloating && effUnit === "none") {
    return null;
  }

  const parts: string[] = [];
  parts.push(`Repeats ${effUnit}`);
  if (interval && interval > 1) parts.push(`every ${interval}`);

  if (effUnit === "weekly") {
    const names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; // 0 = Mon, 6 = Sun
    const list = (repeatDays && repeatDays.length
      ? repeatDays
      : Number.isInteger(day) ? [Number(day)] : []
    ).map(i => names[Math.max(0, Math.min(6, i))]);

    if (list.length) parts.push(`on ${list.join(", ")}`);
  }

  return <p className="mt-1 text-xs text-gray-500">🔁 {parts.join(" ")}</p>;
}







type Row = {
  scheduled_task_id: string;
  template_id: string  | null;
  title: string;
  description?: string | null;
  notes: string | null;
  is_appointment: boolean;
  is_fixed: boolean;
  is_routine: boolean;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  is_completed: boolean | null;
  priority?: number | null;

  // 🔁 Repeat metadata
  repeat_unit?: string | null;
  repeat_interval?: number | null;
  repeat_day?: number | null;

  // NEW:
  repeat?: string | null;        // 'daily'|'weekly'|'monthly'|null
  repeat_days?: number[] | null; // e.g. [1,3,5]
  date?: string | null;          // Reference date for interval calculations
  window_start_local?: string | null;
  window_end_local?: string | null;
};


function Badge(props: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100">
      {props.children}
    </span>
  );
}
import ReviseScheduleButton from '../components/ReviseScheduleButton';
export default function TodayPage() {
const router = useRouter();
const [authUid, setAuthUid] = useState<string | null>(null);
const [rows, setRows] = useState<Row[] | null>(null);
const [error, setError] = useState<string | null>(null);
const [editingTask, setEditingTask] = useState<Row | null>(null);
const [editModalRepeatUnit, setEditModalRepeatUnit] = useState<string>('none');
const [editModalTaskType, setEditModalTaskType] = useState<string>('floating');
const [editModalStartTime, setEditModalStartTime] = useState<string>('');
const [editModalDuration, setEditModalDuration] = useState<number>(30);
const [editModalDate, setEditModalDate] = useState<string>('');
const [showNavMenu, setShowNavMenu] = useState<boolean>(false);

  // Sync modal state when editingTask changes
  useEffect(() => {
    if (editingTask) {
      setEditModalRepeatUnit(editingTask.repeat_unit || 'none');
      // Determine task type from flags
      const taskType = editingTask.is_appointment ? 'appointment' : editingTask.is_routine ? 'routine' : 'floating';
      setEditModalTaskType(taskType);
      
      // Extract time from start_time (format: "YYYY-MM-DDTHH:MM:SS" or "HH:MM:SS")
      if (editingTask.start_time) {
        const timeMatch = editingTask.start_time.match(/(\d{2}:\d{2})/);
        if (timeMatch) {
          setEditModalStartTime(timeMatch[1]);
        }
      } else {
        setEditModalStartTime('');
      }
      
      setEditModalDuration(editingTask.duration_minutes || 30);
      setEditModalDate(editingTask.date || '');
    }
  }, [editingTask]);

  // ⬇️ Run scheduler to recreate today's schedule
  async function runScheduler() {
    try {
      const supabase = supabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.warn('[runScheduler] No auth token, skipping scheduler call');
        return false;
      }
      
      console.log('[runScheduler] Calling /api/revise-schedule...');
      const response = await fetch('/api/revise-schedule', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ force: true, write: true }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[runScheduler] Failed:', errorData);
        return false;
      }
      
      const result = await response.json();
      console.log('[runScheduler] Success:', result);
      return true;
    } catch (error) {
      console.error('[runScheduler] Error:', error);
      return false;
    }
  }

  // ⬇️ factor out loader so we can reuse it after deletes
  async function loadToday() {
    try {
      const supabase = supabaseBrowser();

      // Get today's date in Europe/London timezone (YYYY-MM-DD format)
      const todayLocal = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      console.log(`[loadToday] Starting fetch for ${todayLocal}`);

      // Fetch scheduled tasks for today
      const { data, error } = await supabase
      .from('scheduled_tasks')
      .select(`
        id, template_id, title, description, is_appointment, is_fixed, is_routine, 
        start_time, end_time, duration_minutes, is_completed, priority,
        task_templates!template_id (
          title, description, repeat, repeat_unit, repeat_interval, repeat_day, repeat_days, day_of_month, date,
          window_start_local, window_end_local, priority
        )
      `)
      .eq('local_date', todayLocal)
      .eq('is_deleted', false);
      
    if (error) {
      console.error('[loadToday] scheduled_tasks query failed:', error);
      console.error('[loadToday] Full error object:', JSON.stringify(error, null, 2));
      setError(`Database error: ${error.message || 'Unknown error'}\n\nDetails: ${JSON.stringify(error, null, 2)}`);
      return;
    }
    console.log(`[loadToday] Fetched ${data?.length || 0} scheduled tasks`);

    // Also fetch ALL scheduled_tasks (including deleted) to check which templates are already instantiated
    // This prevents recreating appointments that were moved/deleted by the user
    const { data: allScheduledTasks, error: allScheduledError } = await supabase
      .from('scheduled_tasks')
      .select('template_id')
      .eq('local_date', todayLocal);

    if (allScheduledError) {
      console.error('[loadToday] all scheduled_tasks query failed:', {
        message: allScheduledError.message,
        details: allScheduledError.details,
        code: allScheduledError.code,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`[loadToday] Fetched ${allScheduledTasks?.length || 0} total scheduled task references`);
    }

    // Also fetch recurring templates (appointments, routines, floating tasks) that should appear today
    const { data: allTemplates, error: templateError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('is_deleted', false);

    if (templateError) {
      console.error('[loadToday] template appointments query failed:', {
        message: templateError.message,
        details: templateError.details,
        code: templateError.code,
        timestamp: new Date().toISOString()
      });
      // Don't fail completely, just log the error
    } else {
      console.log(`[loadToday] Fetched ${allTemplates?.length || 0} appointment templates`);
    }

    // Find template appointments that don't already exist in scheduled_tasks (including deleted ones)
    const existingTemplateIds = new Set((allScheduledTasks || []).map((t: any) => t.template_id).filter(Boolean));
    const missingAppointments: any[] = [];
    
    (allTemplates || []).forEach((t: any) => {
      // Skip if already instantiated
      if (existingTemplateIds.has(t.id)) return;
      
      // Check if this template should generate an instance for today
      const effectiveRepeat = (t.repeat_unit === 'none' || !t.repeat_unit) ? t.repeat : t.repeat_unit;
      const repeatUnit = (effectiveRepeat || '').toLowerCase();
      
      // One-off appointment with specific date matching today
      if ((!repeatUnit || repeatUnit === 'none') && (t.local_date === todayLocal || t.date === todayLocal)) {
        missingAppointments.push({
          id: `template-${t.id}`,
          scheduled_task_id: `template-${t.id}`,
          template_id: t.id,
          title: t.title,
          description: t.description,
          notes: t.description,
          is_appointment: true,
          is_fixed: t.is_fixed || false,
          is_routine: false,
          start_time: t.start_time ? `${todayLocal}T${t.start_time}` : null,
          end_time: t.start_time && t.duration_minutes 
            ? new Date(new Date(`${todayLocal}T${t.start_time}`).getTime() + t.duration_minutes * 60000).toISOString()
            : null,
          duration_minutes: t.duration_minutes,
          is_completed: false,
          priority: t.priority,
          task_templates: t,
          repeat_unit: t.repeat_unit,
          repeat_interval: t.repeat_interval,
          repeat_day: t.repeat_day,
          repeat: t.repeat,
          repeat_days: t.repeat_days,
          _is_from_template: true,
        });
        return;
      }
      
      // Recurring appointment - check if it should appear today
      if (repeatUnit && repeatUnit !== 'none') {
        const today = new Date(todayLocal + 'T00:00:00Z');
        const jsDay = today.getUTCDay(); // JavaScript: Sun=0, Mon=1, ..., Sat=6
        const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Our standard: Mon=0, Tue=1, ..., Sun=6
        let shouldInclude = false;
        
        if (repeatUnit === 'daily') {
          shouldInclude = true;
        } else if (repeatUnit === 'weekly') {
          // Check repeat_days array (stored as Mon=0, Tue=1, ..., Sun=6)
          if (t.repeat_days && Array.isArray(t.repeat_days) && t.repeat_days.length > 0 && t.repeat_days.includes(dayOfWeek)) {
            // Day matches, now check interval (for bi-weekly, tri-weekly, etc.)
            const interval = t.repeat_interval || 1;
            if (interval === 1) {
              shouldInclude = true; // Weekly (every week)
            } else if (t.date) {
              // Check if enough weeks have passed since template reference date
              const refDate = new Date(t.date + 'T00:00:00Z');
              const daysDiff = Math.floor((today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
              const weeksDiff = Math.floor(daysDiff / 7);
              shouldInclude = weeksDiff % interval === 0;
            } else {
              // No reference date - check against last scheduled occurrence
              // This requires querying scheduled_tasks, so we'll skip interval checking
              // and rely on the Python scheduler or carry-forward logic
              shouldInclude = false; // Don't auto-create without reference date
            }
          }
        } else if (repeatUnit === 'weekday' || repeatUnit === 'weekdays') {
          shouldInclude = dayOfWeek >= 0 && dayOfWeek <= 4; // Monday(0) to Friday(4)
        } else if (repeatUnit === 'monthly') {
          if (t.day_of_month) {
            shouldInclude = today.getUTCDate() === t.day_of_month;
          }
        }
        
        if (shouldInclude) {
          missingAppointments.push({
            id: `template-${t.id}`,
            scheduled_task_id: `template-${t.id}`,
            template_id: t.id,
            title: t.title,
            description: t.description,
            notes: t.description,
            is_appointment: true,
            is_fixed: t.is_fixed || false,
            is_routine: false,
            start_time: t.start_time ? `${todayLocal}T${t.start_time}` : null,
            end_time: t.start_time && t.duration_minutes 
              ? new Date(new Date(`${todayLocal}T${t.start_time}`).getTime() + t.duration_minutes * 60000).toISOString()
              : null,
            duration_minutes: t.duration_minutes,
            is_completed: false,
            priority: t.priority,
            task_templates: t,
            repeat_unit: t.repeat_unit,
            repeat_interval: t.repeat_interval,
            repeat_day: t.repeat_day,
            repeat: t.repeat,
            repeat_days: t.repeat_days,
            _is_from_template: true,
          });
        }
      }
    });

    const combinedData = [...(data || []), ...missingAppointments];

    // Debug: Check for duplicate tasks with same template_id
    const templateCounts = new Map();
    combinedData.forEach((task) => {
      if (task.template_id) {
        const count = templateCounts.get(task.template_id) || 0;
        templateCounts.set(task.template_id, count + 1);
      }
    });
    const duplicates = Array.from(templateCounts.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.warn('[loadToday] Found duplicate tasks:', duplicates.map(([id, count]) => {
        const tasks = combinedData.filter((t) => t.template_id === id);
        return { template_id: id, count, tasks: tasks.map((t) => ({ 
          id: t.id, 
          title: t.title, 
          is_completed: t.is_completed,
          scheduled_task_id: t.scheduled_task_id 
        })) };
      }));
    }

    // Belt-and-braces client-side sort (in case PostgREST ordering gets bypassed)
    const sorted = combinedData.slice().sort((a: any, b: any) => {
      const at = a.start_time, bt = b.start_time;
      
      if (at && bt) {
        // Parse to Date objects for proper comparison
        const dateA = new Date(at);
        const dateB = new Date(bt);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        // same start_time → priority asc
        return (a.priority ?? 3) - (b.priority ?? 3);
      }
      if (at && !bt) return -1;   // a has time, b is floating → a first
      if (!at && bt) return 1;    // b has time, a is floating → b first
      // both floating → priority asc
      return (a.priority ?? 3) - (b.priority ?? 3);
    });

    // Map DB columns to Row type and flatten template data
    const mapped = sorted.map((row: any) => {
      const template = row.task_templates || {};
      
      // Debug logging for Teriyaki
      if (row.title?.includes('Teriyaki') || template.title?.includes('Teriyaki')) {
        console.log('[loadToday] Teriyaki row:', {
          rowTitle: row.title,
          templateTitle: template.title,
          templateRepeatUnit: template.repeat_unit,
          templateRepeat: template.repeat,
          fullTemplate: template
        });
      }
      
      return {
        ...row, 
        scheduled_task_id: row.id,
        // Prefer template title/description (always current) over scheduled_tasks (denormalized snapshot)
        title: template.title || row.title,
        description: template.description || row.description,
        // Use 'description' from DB (scheduler writes failure reasons there)
        notes: row.description || null,
        // Prefer template priority (always current) over scheduled_tasks (denormalized snapshot)
        priority: template.priority ?? row.priority,
        // Flatten repeat fields from joined task_templates
        repeat_unit: template.repeat_unit || null,
        repeat_interval: template.repeat_interval || null,
        repeat_day: template.repeat_day || null,
        repeat: template.repeat || null,
        repeat_days: template.repeat_days || null,
        date: template.date || null,
        window_start_local: template.window_start_local || null,
        window_end_local: template.window_end_local || null
      };
    });
    setRows(mapped as Row[]);

    } catch (err: any) {
      console.error('[loadToday] Unexpected error:', err);
      setError(`Unexpected error: ${err.message || String(err)}`);
    }
  }

  // ⬇️ Skip task to tomorrow by moving it forward one day
  async function skipToTomorrow(scheduledTaskId: string) {
    const supabase = supabaseBrowser();
    
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowLocal = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(tomorrow);
    
    // Get the current task details and its template
    const { data: currentTask, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('id', scheduledTaskId)
      .single();

    if (fetchError || !currentTask) {
      console.error('Skip to tomorrow failed: could not fetch task', fetchError);
      setError(`Skip to tomorrow failed: ${fetchError?.message || 'Task not found'}`);
      return;
    }

    // Get the template to check if it's a one-off task
    const { data: template, error: templateError } = await supabase
      .from('task_templates')
      .select('repeat_unit')
      .eq('id', currentTask.template_id)
      .single();

    if (templateError) {
      console.error('Skip to tomorrow failed: could not fetch template', templateError);
      setError(`Skip to tomorrow failed: ${templateError.message}`);
      return;
    }

    // If it's a one-off (floating) task, set the defer date on the template
    if (template.repeat_unit === 'none') {
      const { error: templateUpdateError } = await supabase
        .from('task_templates')
        .update({ date: tomorrowLocal })
        .eq('id', currentTask.template_id);

      if (templateUpdateError) {
        console.error('Skip to tomorrow failed: could not update template defer date', templateUpdateError);
        setError(`Skip to tomorrow failed: ${templateUpdateError.message}`);
        return;
      }

      // For one-off tasks, just delete the scheduled instance - the scheduler will recreate it tomorrow
      const { error: deleteError } = await supabase
        .from('scheduled_tasks')
        .delete()
        .eq('id', scheduledTaskId);

      if (deleteError) {
        console.error('Failed to delete current task:', deleteError);
        setError(`Failed to delete current task: ${deleteError.message}`);
        return;
      }

      await loadToday();
      return;
    }

    // Check if a task with this template already exists for tomorrow
    const { data: existingTask } = await supabase
      .from('scheduled_tasks')
      .select('id, is_deleted')
      .eq('template_id', currentTask.template_id)
      .eq('user_id', currentTask.user_id)
      .eq('local_date', tomorrowLocal)
      .maybeSingle();

    if (existingTask) {
      // Update the existing task for tomorrow (undelete if needed)
      const { error: updateError } = await supabase
        .from('scheduled_tasks')
        .update({
          is_deleted: false,
          is_completed: false,
        })
        .eq('id', existingTask.id);

      if (updateError) {
        console.error('Skip to tomorrow failed:', updateError);
        setError(`Skip to tomorrow failed: ${updateError.message}`);
        return;
      }

      // Delete the current task from today
      const { error: deleteError } = await supabase
        .from('scheduled_tasks')
        .delete()
        .eq('id', scheduledTaskId);

      if (deleteError) {
        console.error('Failed to delete current task:', deleteError);
        // Continue anyway since we successfully moved to tomorrow
      }
    } else {
      // No existing task for tomorrow, so update the current task's date
      const { error: updateError } = await supabase
        .from('scheduled_tasks')
        .update({ local_date: tomorrowLocal })
        .eq('id', scheduledTaskId);

      if (updateError) {
        console.error('Skip to tomorrow failed:', updateError);
        setError(`Skip to tomorrow failed: ${updateError.message}`);
        return;
      }
    }

    await loadToday();
  }

  // ⬇️ soft-delete: mark is_deleted=true on scheduled_tasks AND optionally its template
  async function deleteTask(scheduledTaskId: string, deleteTemplate: boolean = true) {
    const supabase = supabaseBrowser();
    
    // If deleting template (all future occurrences), confirm with user
    if (deleteTemplate) {
      const confirmed = window.confirm(
        'This will DELETE ALL FUTURE OCCURRENCES of this task. Are you sure?\n\n' +
        'Click OK to permanently delete, or Cancel to go back.\n\n' +
        'Tip: Use "Skip" instead if you only want to skip today.'
      );
      if (!confirmed) return;
    }
    
    // Check if this is a template-sourced task (ID starts with "template-")
    if (scheduledTaskId.startsWith('template-')) {
      // Extract template ID
      const templateId = scheduledTaskId.replace('template-', '');
      
      console.log(`[AUDIT] Today page deleteTask deleting template: ${templateId} at ${new Date().toISOString()}`);
      
      // Soft-delete the template
      const { error: templateError } = await supabase
        .from('task_templates')
        .update({ is_deleted: true })
        .eq('id', templateId);

      if (templateError) {
        console.error('Failed to delete template:', templateError);
        setError(`Failed to delete template: ${templateError.message}`);
        return;
      }

      await loadToday();
      return;
    }
    
    // First, get the template_id from the scheduled task
    const { data: task, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('template_id')
      .eq('id', scheduledTaskId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch task:', fetchError);
      setError(`Failed to fetch task: ${fetchError.message}`);
      return;
    }

    // Delete the scheduled task instance
    const { error: deleteError } = await supabase
      .from('scheduled_tasks')
      .update({ is_deleted: true })
      .eq('id', scheduledTaskId);

    if (deleteError) {
      console.error('Delete failed:', deleteError);
      setError(`Delete failed: ${deleteError.message}`);
      return;
    }

    // If deleteTemplate is true and this task has a template, also soft-delete the template
    if (deleteTemplate && task?.template_id) {
      const { error: templateError } = await supabase
        .from('task_templates')
        .update({ is_deleted: true })
        .eq('id', task.template_id);

      if (templateError) {
        console.error('Failed to delete template:', templateError);
        // Don't fail the whole operation - the instance is already deleted
        console.warn('Task instance deleted but template deletion failed');
      }
    }

    await loadToday();
  }

  // ⬇️ mark a task series as completed (complete current + delete template)
  async function completeSeries(scheduledTaskId: string) {
    const supabase = supabaseBrowser();
    
    // Confirm with user before permanently deleting recurring task
    const confirmed = window.confirm(
      'This will PERMANENTLY DELETE this recurring task.\n\n' +
      'You will NOT see this task again in future schedules.\n\n' +
      'Click OK to permanently delete, or Cancel to go back.\n\n' +
      'Tip: Use the regular "✓" button if you just want to complete today\'s instance.'
    );
    if (!confirmed) return;
    
    console.log(`[completeSeries] Starting series completion for task: ${scheduledTaskId}`);
    
    // First complete the current instance
    await completeTask(scheduledTaskId);
    
    // Then soft-delete the template to prevent future instances
    if (scheduledTaskId.startsWith('template-')) {
      // Extract template ID
      const templateId = scheduledTaskId.replace('template-', '');
      
      console.log(`[AUDIT] Today page completeSeries deleting template: ${templateId} at ${new Date().toISOString()}`);
      
      const { error: templateError } = await supabase
        .from('task_templates')
        .update({ is_deleted: true })
        .eq('id', templateId);

      if (templateError) {
        console.error('Failed to delete template:', templateError);
        setError(`Failed to complete series: ${templateError.message}`);
        return;
      }
    } else {
      // Get the template_id from the scheduled task
      const { data: task, error: fetchError } = await supabase
        .from('scheduled_tasks')
        .select('template_id')
        .eq('id', scheduledTaskId)
        .single();

      if (fetchError) {
        console.error('Failed to fetch task:', fetchError);
        setError(`Failed to fetch task: ${fetchError.message}`);
        return;
      }

      // Soft-delete the template if it exists
      if (task?.template_id) {
        console.log(`[AUDIT] Today page completeSeries deleting template: ${task.template_id} at ${new Date().toISOString()}`);
        
        const { error: templateError } = await supabase
          .from('task_templates')
          .update({ is_deleted: true })
          .eq('id', task.template_id);

        if (templateError) {
          console.error('Failed to delete template:', templateError);
          setError(`Failed to complete series: ${templateError.message}`);
          return;
        }
      }
    }
    
    console.log(`[completeSeries] Successfully completed series for task ${scheduledTaskId}`);
    await loadToday();
  }

  // ⬇️ mark a task as completed
async function completeTask(scheduledTaskId: string) {
  const supabase = supabaseBrowser();
  
  console.log(`[completeTask] Starting completion for task: ${scheduledTaskId}`);
  
  // Optimistic UI update: immediately mark as completed in local state
  setRows(prev => prev ? prev.map(r => 
    r.scheduled_task_id === scheduledTaskId 
      ? { ...r, is_completed: true } 
      : r
  ) : prev);
  
  // Check if this is a template-sourced task (ID starts with "template-")
  if (scheduledTaskId.startsWith('template-')) {
    // Need to create a scheduled_tasks entry for this template instance and mark it completed
    const templateId = scheduledTaskId.replace('template-', '');
    const todayLocal = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    
    // Get user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      return;
    }
    
    // Get template details
    const { data: template, error: templateError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('id', templateId)
      .single();
      
    if (templateError || !template) {
      console.error('Failed to fetch template:', templateError);
      setError(`Failed to fetch template: ${templateError?.message}`);
      return;
    }
    
    // Create scheduled task and mark as completed
    const { error: insertError } = await supabase
      .from('scheduled_tasks')
      .insert({
        template_id: templateId,
        user_id: user.id,
        title: template.title,
        description: template.description,
        local_date: todayLocal,
        start_time: template.start_time ? `${todayLocal}T${template.start_time}` : null,
        end_time: template.start_time && template.duration_minutes 
          ? new Date(new Date(`${todayLocal}T${template.start_time}`).getTime() + template.duration_minutes * 60000).toISOString()
          : null,
        duration_minutes: template.duration_minutes,
        is_appointment: template.is_appointment,
        is_routine: template.is_routine,
        is_fixed: template.is_fixed,
        is_completed: true,
        is_deleted: false,
        priority: template.priority,
      });
      
    if (insertError) {
      console.error('Failed to create and complete task:', insertError);
      setError(`Failed to complete task: ${insertError.message}`);
      return;
    }
    
    await loadToday();
    return;
  }
  
  const { error } = await supabase
    .from('scheduled_tasks')
    .update({ is_completed: true })
    .eq('id', scheduledTaskId);

  if (error) {
    console.error('[completeTask] Update failed:', {
      taskId: scheduledTaskId,
      message: error.message,
      details: error.details,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    setError(`Complete failed: ${error.message}`);
    // Revert optimistic update on error
    console.log('[completeTask] Reverting optimistic update, reloading...');
    await loadToday();
    return;
  }
  // Success - refresh to get any server-side changes
  console.log(`[completeTask] Successfully completed task ${scheduledTaskId}, reloading...`);
  await loadToday();
}

  useEffect(() => {
    const supabase = supabaseBrowser();

    (async () => {
      const { data: u, error: ue } = await supabase.auth.getUser();
      if (ue || !u.user) {
        // No authenticated user - redirect to login
        console.log('[Today] No authenticated user, redirecting to login');
        router.push('/auth/login');
        return;
      }
      setAuthUid(u.user.id);
      
      // Check if we have any tasks for today
      const todayLocal = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      
      const { data: existingTasks } = await supabase
        .from('scheduled_tasks')
        .select('id, start_time, is_appointment, is_routine, is_fixed')
        .eq('local_date', todayLocal)
        .eq('is_deleted', false);
      
      // Run scheduler if:
      // 1. No tasks exist for today, OR
      // 2. Very few tasks (likely incomplete schedule), OR
      // 3. There are floating tasks (not appointment/routine/fixed) without time slots
      const hasFloatingWithoutTimes = (existingTasks || []).some(
        task => !task.is_appointment && !task.is_routine && !task.is_fixed && !task.start_time
      );
      
      const taskCount = existingTasks?.length || 0;
      const needsScheduling = taskCount === 0 || taskCount < 5 || hasFloatingWithoutTimes;
      
      if (needsScheduling) {
        console.log('[Today] Running scheduler...', { 
          noTasks: taskCount === 0,
          fewTasks: taskCount < 5,
          hasFloatingWithoutTimes 
        });
        await runScheduler();
        // Wait a moment for the scheduler to complete and database to update
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('[Today] Schedule appears complete, skipping scheduler');
      }
      
      await loadToday();
    })();
  }, []);

  // ⬇️ Reload data when tab becomes visible (to get fresh data after scheduler runs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible - reloading schedule');
        loadToday();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ⬇️ Close nav menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNavMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.nav-menu-container')) {
          setShowNavMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNavMenu]);

  // ⬇️ update priority (1..5), then reload
  // Update priority for a given row (optimistic UI + persist to either template or scheduled_tasks)
  async function updatePriorityForRow(row: Row, next: number): Promise<boolean> {
    const p = Math.max(1, Math.min(5, Number(next) || 3));

    // optimistic
    const prev = rows ? rows.slice() : null;
    setRows(prevRows =>
      prevRows ? prevRows.map(r => r.scheduled_task_id === row.scheduled_task_id ? { ...r, priority: p } : r) : prevRows
    );

    try {
      // For template-sourced tasks or tasks with templates, update the template
      if (row.template_id || row.scheduled_task_id.startsWith('template-')) {
        const templateId = row.scheduled_task_id.startsWith('template-')
          ? row.scheduled_task_id.replace('template-', '')
          : row.template_id;
        
        if (!templateId) {
          throw new Error('No template ID found');
        }
          
        // update template via server route
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        const token = session?.access_token ?? null;
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/task-templates/${encodeURIComponent(templateId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ priority: p }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error_message ?? `Failed to save priority (${res.status})`);
        }
      } else {
        // update scheduled instance directly
        const supabase = supabaseBrowser();
        const { error } = await supabase
          .from('scheduled_tasks')
          .update({ priority: p })
          .eq('id', row.scheduled_task_id);
        if (error) throw error;
      }
      return true;
    } catch (e: any) {
      console.error('Priority save failed:', e);
      setError(e?.message ?? String(e));
      // revert optimistic
      if (prev) setRows(prev);
      return false;
    }
  }

  // Update duration for a given row (optimistic UI + persist to either template or scheduled_tasks)
  async function updateDurationForRow(row: Row, newDuration: number): Promise<boolean> {
    const duration = Math.max(1, Math.min(480, Number(newDuration) || 30)); // 1-480 minutes

    // optimistic
    const prev = rows ? rows.slice() : null;
    setRows(prevRows =>
      prevRows ? prevRows.map(r => r.scheduled_task_id === row.scheduled_task_id ? { ...r, duration_minutes: duration } : r) : prevRows
    );

    try {
      // For template-sourced tasks or tasks with templates, update the template
      if (row.template_id || row.scheduled_task_id.startsWith('template-')) {
        const templateId = row.scheduled_task_id.startsWith('template-')
          ? row.scheduled_task_id.replace('template-', '')
          : row.template_id;
        
        if (!templateId) {
          throw new Error('No template ID found');
        }
          
        // update template via server route
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        const token = session?.access_token ?? null;
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/task-templates/${encodeURIComponent(templateId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ duration_minutes: duration }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error_message ?? `Failed to save duration (${res.status})`);
        }
      } else {
        // Update scheduled instance directly
        const supabase = supabaseBrowser();
        const { error: upErr } = await supabase
          .from('scheduled_tasks')
          .update({ duration_minutes: duration })
          .eq('id', row.scheduled_task_id);
        if (upErr) throw upErr;
      }
      return true;
    } catch (e: any) {
      console.error('Duration update failed:', e);
      setError(e?.message ?? String(e));
      // revert
      if (prev) setRows(prev);
      return false;
    }
  }

  // Inline editable title used within the schedule list. Defined inside
  // TodayPage so it can access `rows`, `setRows` and `setError` directly.
  function InlineListTitle({ row }: { row: Row }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(row.title);
    const [saving, setSaving] = useState(false);
    const [savingPriority, setSavingPriority] = useState(false);
    const [prioritySaved, setPrioritySaved] = useState(false);
    const [savingDuration, setSavingDuration] = useState(false);
    const [durationSaved, setDurationSaved] = useState(false);
    const [durationValue, setDurationValue] = useState(String(row.duration_minutes || 30));
    const ref = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      setValue(row.title);
    }, [row.title]);

    useEffect(() => {
      setDurationValue(String(row.duration_minutes || 30));
    }, [row.duration_minutes]);

    useEffect(() => {
      if (editing) ref.current?.focus();
    }, [editing]);

    async function save() {
      const trimmed = (value ?? '').trim();
      setEditing(false);
      if (!trimmed) {
        setError('Title cannot be empty.');
        setValue(row.title);
        return;
      }
      if (trimmed === row.title) return;

      // Optimistic update
      const prev = rows ? rows.slice() : null;
      setRows((prevRows) =>
        prevRows
          ? prevRows.map(r => r.scheduled_task_id === row.scheduled_task_id ? { ...r, title: trimmed } : r)
          : prevRows
      );

      setSaving(true);
      try {
        // For template-sourced tasks or tasks with templates, update the template
        if (row.template_id || row.scheduled_task_id.startsWith('template-')) {
          const templateId = row.scheduled_task_id.startsWith('template-')
            ? row.scheduled_task_id.replace('template-', '')
            : row.template_id;
          
          if (!templateId) {
            throw new Error('No template ID found');
          }
          
          // Update template via server route (requires bearer token)
          const { data: { session } } = await supabaseBrowser().auth.getSession();
          const token = session?.access_token ?? null;
          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`/api/task-templates/${encodeURIComponent(templateId)}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ title: trimmed }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error_message ?? `Failed to save title (${res.status})`);
          }
        } else {
          // Update scheduled instance directly using Supabase client
          const supabase = supabaseBrowser();
          const { error: upErr } = await supabase
            .from('scheduled_tasks')
            .update({ title: trimmed })
            .eq('id', row.scheduled_task_id);
          if (upErr) throw upErr;
        }
      } catch (e: any) {
        console.error('Title save failed:', e);
        setError(e?.message ?? String(e));
        // revert optimistic
        if (prev) setRows(prev);
        setValue(row.title);
      } finally {
        setSaving(false);
      }
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setEditing(false);
        setValue(row.title);
      }
    }

    return (
      <div className="flex items-center gap-2 w-full">
        {editing ? (
          <input
            ref={ref}
            value={value}
            onChange={e => { e.stopPropagation(); setValue(e.target.value); }}
            onBlur={(e) => { e.stopPropagation(); save(); }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKey}
            disabled={saving}
            className="flex-1 truncate font-medium rounded px-1 py-0.5 border"
          />
        ) : (
          <div
            className="flex-1 inline-flex items-center gap-2 group px-1 py-0.5 rounded transition-colors hover:bg-green-100"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title="Click to edit"
          >
            <p className="truncate font-medium cursor-text">{row.title}</p>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-gray-400 group-hover:text-green-600 opacity-0 group-hover:opacity-100 transition-all"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              aria-hidden="true"
            >
              <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
              <path fillRule="evenodd" d="M2 15.25V18h2.75l8.486-8.486-2.75-2.75L2 15.25z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {/* Duration editor - always visible */}
        <div className="inline-flex items-center gap-1 flex-shrink-0 transition-opacity" style={{display: 'none'}}>
          <input
            type="number"
            min="1"
            max="480"
            step="5"
            value={durationValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              setDurationValue(e.target.value);
            }}
            onBlur={async (e) => {
              e.stopPropagation();
              const next = Number(durationValue);
              if (!next || next < 1) {
                // Reset to current value if invalid
                setDurationValue(String(row.duration_minutes || 30));
                return;
              }
              if (next === row.duration_minutes) return; // No change
              
              setSavingDuration(true);
              setDurationSaved(false);
              const ok = await updateDurationForRow(row, next);
              setSavingDuration(false);
              if (ok) {
                setDurationSaved(true);
                window.setTimeout(() => setDurationSaved(false), 1400);
              } else {
                // Revert on failure
                setDurationValue(String(row.duration_minutes || 30));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setDurationValue(String(row.duration_minutes || 30));
                e.currentTarget.blur();
              }
            }}
            className={`border rounded px-1 py-0.5 text-xs w-12 ${savingDuration ? 'opacity-60 pointer-events-none' : ''}`}
            aria-label={`Duration in minutes for ${row.title}`}
          />
          <span className="text-xs text-gray-500">min</span>
          
          {/* spinner while saving, checkmark briefly on success */}
          {savingDuration ? (
            <svg className="w-4 h-4 text-gray-500 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
          ) : durationSaved ? (
            <svg className="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clipRule="evenodd" />
            </svg>
          ) : null}
        </div>
      </div>
    );
  }


  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-8">
      <FeedbackButton page="Today" />
      
      <header className="flex items-end justify-between">
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
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-2xl font-bold">Today</h1>
            </div>
            <div className="relative nav-menu-container">
              <button
                onClick={() => setShowNavMenu(!showNavMenu)}
                className="text-gray-600 hover:text-gray-900 transition-colors p-1"
                title="Navigate to other pages"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              {showNavMenu && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <a
                    href="/appointments"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Appointments
                  </a>
                  <a
                    href="/tasks"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Create Tasks
                  </a>
                  <a
                    href="/routines"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Routines
                  </a>
                  <a
                    href="/projects"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Projects
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">Europe/London</p>
          <ReviseScheduleButton onSuccess={loadToday} />
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
          <p className="font-medium text-red-700">Failed to load today’s schedule</p>
          <pre className="mt-2 overflow-x-auto text-xs text-red-800">{error}</pre>
          <p className="mt-2 text-xs text-red-800">
            Tip: ensure you’re signed in and the view grants <code>select</code> to <code>authenticated</code>.
          </p>
        </div>
      ) : rows === null ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500">
          No items for today.
        </div>
      ) : (
        <>
          {/* ✅ Completed section (green) */}
          {rows.some((t) => t.is_completed) && (
            <section>
              <h2 className="text-lg font-semibold text-green-700 mb-2">
                Completed Today
              </h2>
              <ul className="space-y-2">
                {rows
                  .filter((t) => t.is_completed)
                  .map((t) => (
                    <li
                      key={t.scheduled_task_id}
                      className="rounded-2xl border border-green-200 bg-green-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-green-800 truncate">{t.title}</p>
                        <p className="text-green-700 text-sm">✓</p>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {/* ✅ Active tasks section - Diary page style */}
          <section>
            <div className="bg-white border-2 border-gray-300 rounded-lg shadow-lg p-6" style={{
              backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #e5e7eb 31px, #e5e7eb 32px)',
              minHeight: '600px'
            }}>
              {/* Diary page header */}
              <div className="border-b-2 border-gray-400 pb-3 mb-6">
                <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>
                  {new Date().toLocaleDateString('en-GB', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    timeZone: 'Europe/London'
                  })}
                </h2>
              </div>

              {/* Schedule entries */}
              <div className="space-y-0">
                {rows
                  .filter((t) => !t.is_completed)
                  .map((t) => {
                    const hasStart = Boolean(t.start_time);
                    if (!hasStart) {
                      console.log(`Task "${t.title}" has no start_time:`, { start_time: t.start_time, end_time: t.end_time });
                    }
                    return (
                      <div
                        key={String(t.scheduled_task_id)}
                        className="py-2 border-b border-gray-200 hover:bg-blue-50/30 transition group"
                        style={{ minHeight: '32px' }}
                      >
                        <div className="flex items-start gap-4">
                          {/* Time column - like diary margin */}
                          <div className="w-24 shrink-0 pt-0.5">
                            {hasStart ? (
                              <p className="text-sm font-semibold text-gray-700 tabular-nums" style={{ fontFamily: 'Georgia, serif' }}>
                                {fmtTime(t.start_time)}
                                {t.end_time && (
                                  <span className="text-xs text-gray-500"> – {fmtTime(t.end_time)}</span>
                                )}
                              </p>
                            ) : t.notes && (t.notes.includes('No available time slot') || t.notes.includes('window')) ? (
                              <p className="text-xs text-amber-600 font-medium">⚠️ Not scheduled</p>
                            ) : (
                              <p className="text-xs text-gray-500">~{t.duration_minutes ?? 25}m</p>
                            )}
                          </div>

                          {/* Task content - like diary entry */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <InlineListTitle row={t} />
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {t.is_appointment && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Appt</span>}
                                {t.is_routine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Routine</span>}
                                {!t.is_appointment && !t.is_routine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Floating task</span>}
                              </div>
                            </div>
                            
                            {t.notes && !t.notes.includes('No available time slot') && !t.notes.includes('window') && (
                              <p className="mt-1 text-xs text-gray-600 line-clamp-2" style={{ fontFamily: 'Georgia, serif' }}>
                                {t.notes}
                              </p>
                            )}

                            {t.notes && (t.notes.includes('No available time slot') || t.notes.includes('window')) && (
                              <p className="mt-1 text-xs text-amber-700 italic">
                                {t.notes}
                              </p>
                            )}

                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <RepeatInfo
                                unit={t.repeat_unit}
                                interval={t.repeat_interval}
                                day={t.repeat_day}
                                repeat={t.repeat}
                                repeatDays={t.repeat_days as number[] | null}
                                isRoutine={!!t.is_routine}
                                isAppointment={!!t.is_appointment}
                              />
                              {(t.window_start_local || t.window_end_local) && (
                                <p className="mt-1 text-xs text-blue-600">
                                  ⏰ Window: {fmtTime(t.window_start_local || null)} – {fmtTime(t.window_end_local || null)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action buttons - hidden until hover */}
                          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            {t.template_id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}
                                className="text-[10px] rounded border border-blue-300 bg-white px-2 py-1 hover:bg-blue-50"
                                title="Edit task settings"
                              >
                                Edit
                              </button>
                            )}
                            {t.template_id && t.repeat_unit && t.repeat_unit !== 'none' ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); completeTask(t.scheduled_task_id); }}
                                  className="text-[10px] rounded border border-green-300 bg-white px-2 py-1 hover:bg-green-50"
                                  title="Mark today's instance as completed"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); completeSeries(t.scheduled_task_id); }}
                                  className="text-[10px] rounded border border-green-500 bg-green-50 px-2 py-1 hover:bg-green-100 font-semibold"
                                  title="Complete and finish this recurring task permanently"
                                >
                                  ✓ Done
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); completeTask(t.scheduled_task_id); }}
                                className="text-[10px] rounded border border-green-300 bg-white px-2 py-1 hover:bg-green-50"
                                title="Mark as completed"
                              >
                                ✓
                              </button>
                            )}
                            
                            {t.template_id && t.repeat_unit && t.repeat_unit !== 'none' ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteTask(t.scheduled_task_id, false); }}
                                  className="text-[10px] rounded border border-yellow-300 bg-white px-2 py-1 hover:bg-yellow-50"
                                  title="Skip this occurrence only"
                                >
                                  Skip
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteTask(t.scheduled_task_id, true); }}
                                  className="text-[10px] rounded border border-red-300 bg-white px-2 py-1 hover:bg-red-50"
                                  title="Delete all future occurrences"
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); skipToTomorrow(t.scheduled_task_id); }}
                                  className="text-[10px] rounded border border-yellow-300 bg-white px-2 py-1 hover:bg-yellow-50"
                                  title="Move to tomorrow"
                                >
                                  Tomorrow
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteTask(t.scheduled_task_id, true); }}
                                  className="text-[10px] rounded border border-red-300 bg-white px-2 py-1 hover:bg-red-50"
                                  title="Remove completely"
                                >
                                  ×
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full m-4 my-8">
            <h2 className="text-xl font-semibold mb-4">Edit Task</h2>
            <p className="text-sm text-gray-600 mb-2">{editingTask.title}</p>
            {editingTask.description && (
              <p className="text-sm text-gray-500 mb-2 italic">{editingTask.description}</p>
            )}
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const task_type = formData.get('task_type') as string;
              const repeat_unit = formData.get('repeat_unit') as string;
              const repeat_interval = parseInt(formData.get('repeat_interval') as string) || 1;
              const day_of_month = parseInt(formData.get('day_of_month') as string) || null;
              
              // Get selected days for weekly
              const repeat_days: number[] = [];
              if (repeat_unit === 'weekly') {
                for (let i = 0; i <= 6; i++) {
                  if (formData.get(`day_${i}`) === 'on') {
                    repeat_days.push(i);
                  }
                }
              }

              const { data: { session } } = await supabaseBrowser().auth.getSession();
              const token = session?.access_token ?? null;
              if (!token) return;

              const reference_date = (formData.get('reference_date') as string) || null;
              const start_time = (formData.get('start_time') as string) || null;
              const duration_minutes = parseInt(formData.get('duration_minutes') as string) || null;
              const priority = parseInt(formData.get('priority') as string) || 3;
              const notes = (formData.get('notes') as string) || null;
              const defer_date = (formData.get('defer_date') as string) || null;
              
              // Validation: Appointments and routines MUST have start time
              if ((task_type === 'appointment' || task_type === 'routine') && !start_time) {
                alert('Appointments and routines must have a start time');
                return;
              }
              
              const body: any = { 
                kind: task_type,
                notes: notes,
                repeat_unit, 
                priority
              };
              
              // Only include repeat settings if not one-off
              if (repeat_unit !== 'none') {
                body.repeat_interval = repeat_interval;
                body.date = reference_date;
                if (repeat_unit === 'weekly') body.repeat_days = repeat_days;
                if (repeat_unit === 'monthly') body.day_of_month = day_of_month;
              } else {
                // Explicitly clear repeat fields when changing to one-off
                body.repeat_interval = 1;
                body.repeat_days = null;
                body.day_of_month = null;
                
                // Set defer date for one-off floating tasks, otherwise clear it
                if (task_type === 'floating' && defer_date) {
                  body.date = defer_date;
                } else {
                  body.date = null;
                }
              }
              
              // Add time field for appointments and routines
              if (task_type === 'appointment' || task_type === 'routine') {
                if (start_time) body.start_time = start_time;
              }
              
              // Add duration for all task types
              if (duration_minutes) body.duration_minutes = duration_minutes;

              // Update the template
              console.log('[Edit Task] Updating template with body:', body);
              const res = await fetch(`/api/task-templates/${editingTask.template_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
              });

              // Also update the scheduled task's notes field
              if (res.ok && notes !== editingTask.notes) {
                const supabase = supabaseBrowser();
                const { error: notesError } = await supabase
                  .from('scheduled_tasks')
                  .update({ description: notes })
                  .eq('id', editingTask.scheduled_task_id);
                
                if (notesError) {
                  console.error('Failed to update notes:', notesError);
                }
              }

              if (res.ok) {
                setEditingTask(null);
                setEditModalRepeatUnit('none');
                setEditModalTaskType('floating');
                setEditModalStartTime('');
                setEditModalDuration(30);
                setEditModalDate('');
                // Force reload to ensure fresh data from template join
                window.location.reload();
              } else {
                const errorData = await res.json().catch(() => ({}));
                console.error('Failed to update task:', errorData);
                alert(`Failed to update task: ${errorData.error_message || errorData.error || 'Unknown error'}`);
              }
            }}>
              <div className="space-y-4">
                {/* Notes field */}
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={editingTask.notes || ''}
                    rows={3}
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="Add notes for this task instance..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Task Type</label>
                  <select 
                    name="task_type" 
                    value={editModalTaskType}
                    className="w-full border rounded px-3 py-2"
                    onChange={(e) => setEditModalTaskType(e.target.value)}
                  >
                    <option value="floating">Floating Task</option>
                    <option value="routine">Routine</option>
                    <option value="appointment">Appointment</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {editModalTaskType === 'floating' && 'Scheduled flexibly by the system'}
                    {editModalTaskType === 'routine' && 'Fixed recurring task at specific time'}
                    {editModalTaskType === 'appointment' && 'Fixed one-time event at specific time'}
                  </p>
                </div>

                {/* Show start time field for appointments and routines */}
                {(editModalTaskType === 'appointment' || editModalTaskType === 'routine') && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Time</label>
                    <input 
                      type="time" 
                      name="start_time"
                      value={editModalStartTime}
                      onChange={(e) => setEditModalStartTime(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                )}

                {/* Duration field for all task types */}
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <input 
                    type="number" 
                    name="duration_minutes"
                    value={editModalDuration}
                    onChange={(e) => setEditModalDuration(parseInt(e.target.value) || 30)}
                    min="5"
                    max="480"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* Priority field for all task types */}
                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select 
                    name="priority"
                    defaultValue={editingTask.priority || 3}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="1">1 - Highest</option>
                    <option value="2">2 - High</option>
                    <option value="3">3 - Normal</option>
                    <option value="4">4 - Low</option>
                    <option value="5">5 - Lowest</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Lower numbers are scheduled earlier</p>
                </div>

                {/* Defer date field for one-off floating tasks */}
                {editModalRepeatUnit === 'none' && editModalTaskType === 'floating' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Defer Until Date</label>
                    <input 
                      type="date" 
                      name="defer_date"
                      value={editModalDate}
                      onChange={(e) => setEditModalDate(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                    <p className="text-xs text-gray-500 mt-1">Task will not be scheduled until this date</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Repeat</label>
                  <select 
                    name="repeat_unit" 
                    value={editModalRepeatUnit}
                    className="w-full border rounded px-3 py-2"
                    onChange={(e) => setEditModalRepeatUnit(e.target.value)}
                  >
                    <option value="none">One-off (No repeat)</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {editModalRepeatUnit !== 'none' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Interval</label>
                      <input 
                        type="number" 
                        name="repeat_interval" 
                        min="1"
                        defaultValue={editingTask.repeat_interval || 1}
                        className="w-full border rounded px-3 py-2"
                        id="repeat_interval_input"
                      />
                      <p className="text-xs text-gray-500 mt-1">Every N {editModalRepeatUnit === 'daily' ? 'days' : editModalRepeatUnit === 'weekly' ? 'weeks' : 'months'}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Reference Date (First Occurrence)
                        <span className="text-xs text-gray-500 font-normal ml-2">Required for interval &gt; 1</span>
                      </label>
                      <input 
                        type="date" 
                        name="reference_date" 
                        defaultValue={editingTask.date || ''}
                        className="w-full border rounded px-3 py-2"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The first date this task should occur (used to calculate future intervals)
                      </p>
                    </div>
                  </>
                )}

                {/* Show day checkboxes if weekly is selected */}
                {editModalRepeatUnit === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Repeat on days</label>
                    <div className="flex flex-wrap gap-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                        <label key={i} className="flex items-center space-x-1">
                          <input 
                            type="checkbox" 
                            name={`day_${i}`}
                            defaultChecked={editingTask.repeat_days?.includes(i)}
                          />
                          <span className="text-sm">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show day of month if monthly is selected */}
                {editModalRepeatUnit === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Day of month</label>
                    <input 
                      type="number" 
                      name="day_of_month" 
                      min="1"
                      max="31"
                      defaultValue={editingTask.repeat_day || 1}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    setEditModalRepeatUnit('none');
                    setEditModalTaskType('floating');
                    setEditModalStartTime('');
                    setEditModalDuration(30);
                    setEditModalDate('');
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    

    </main>
  );
}
