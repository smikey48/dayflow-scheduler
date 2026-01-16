import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserId } from '@/lib/auth';

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PatchBody = {
  title?: string;
  description?: string | null;
  priority?: number | string | null;
  duration_minutes?: number | string | null;
  kind?: string | null;
  repeat_unit?: string | null;
  repeat_interval?: number | null;
  repeat_days?: number[] | null;
  day_of_month?: number | null;
  date?: string | null;
  start_time?: string | null;
};

export async function PATCH(
  req: Request,
  { params }: { params: any }
) {
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req as any);
    console.log('[PATCH task-templates] Authenticated user ID:', userId);
    
    // Get Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceKey
    );
    
    // Get template ID from params
    const p = await params as Record<string, string> | undefined;
    const templateId = p?.template_id ?? p?.id;
    console.log('[PATCH task-templates] Template ID:', templateId);
    
    if (!templateId) {
      return NextResponse.json(
        { error_code: 'missing_param', error_message: 'Missing template id in route.' },
        { status: 400 }
      );
    }

  // Parse JSON
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
    console.log('[PATCH task-templates] Request body:', JSON.stringify(body, null, 2));
  } catch {
    return NextResponse.json(
      { error_code: "invalid_json", error_message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Validate & collect updates
  const updates: Record<string, unknown> = {};

  if (typeof body.title !== "undefined") {
    const trimmed = String(body.title).trim();
    if (!trimmed) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "Title cannot be empty." },
        { status: 400 }
      );
    }
    updates.title = trimmed;
  }

  if (typeof body.description !== "undefined") {
    updates.description = body.description ? String(body.description).trim() : null;
  }

  if (typeof body.start_time !== "undefined") {
    updates.start_time = body.start_time;
  }

  if (typeof body.priority !== "undefined" && body.priority !== null) {
    // accept number or numeric string; clamp to 1..5
    const p = Number(body.priority);
    if (Number.isNaN(p) || !isFinite(p)) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "Priority must be a number between 1 and 5." },
        { status: 400 }
      );
    }
    const clamped = Math.max(1, Math.min(5, Math.trunc(p)));
    updates.priority = clamped;
  }

  if (typeof body.duration_minutes !== "undefined" && body.duration_minutes !== null) {
    // accept number or numeric string; clamp to 1..480 (8 hours max)
    const d = Number(body.duration_minutes);
    if (Number.isNaN(d) || !isFinite(d) || d < 1) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "Duration must be a number between 1 and 480 minutes." },
        { status: 400 }
      );
    }
    const clamped = Math.max(1, Math.min(480, Math.trunc(d)));
    updates.duration_minutes = clamped;
  }

  // Task type (kind)
  if (typeof body.kind !== "undefined") {
    const validKinds = ['floating', 'routine', 'appointment'];
    if (!validKinds.includes(body.kind || '')) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "kind must be 'floating', 'routine', or 'appointment'." },
        { status: 400 }
      );
    }
    updates.kind = body.kind;
    // Update boolean flags based on kind
    updates.is_appointment = body.kind === 'appointment';
    updates.is_routine = body.kind === 'routine';
  }

  // Fetch existing template to check if it's an appointment
  const { data: existingTemplate } = await supabase
    .from("task_templates")
    .select("is_appointment, kind")
    .eq("id", templateId)
    .eq("user_id", userId)
    .single();

  const isAppointment = existingTemplate?.is_appointment || body.kind === 'appointment';

  // Repeat settings
  if (typeof body.repeat_unit !== "undefined") {
    const validUnits = ['none', 'daily', 'weekly', 'monthly', 'annual', null];
    if (!validUnits.includes(body.repeat_unit)) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "repeat_unit must be 'none', 'daily', 'weekly', 'monthly', or 'annual'." },
        { status: 400 }
      );
    }
    // Keep 'none' as-is (it's a string value, not NULL)
    updates.repeat_unit = body.repeat_unit;
    
    // When changing to one-off (none), clear repeat-related fields
    // BUT: Keep date for appointments (they need it for one-off events)
    // AND: Keep date if explicitly provided (for deferred floating tasks)
    if (body.repeat_unit === 'none') {
      updates.repeat_interval = 1;  // Set to 1 for consistency
      updates.repeat_days = null;    // Clear weekly days
      updates.repeat_day = null;     // Clear monthly day
      // Only clear date for non-appointment tasks when no date is provided
      // This allows floating tasks to have a defer date
      if (!isAppointment && typeof body.date === 'undefined') {
        updates.date = null;
      }
    }
  }

  if (typeof body.repeat_interval !== "undefined" && body.repeat_interval !== null) {
    const interval = Number(body.repeat_interval);
    if (Number.isNaN(interval) || !isFinite(interval) || interval < 1) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "repeat_interval must be a positive number." },
        { status: 400 }
      );
    }
    updates.repeat_interval = Math.max(1, Math.trunc(interval));
  }

  if (typeof body.repeat_days !== "undefined") {
    if (body.repeat_days === null) {
      updates.repeat_days = null;
    } else if (Array.isArray(body.repeat_days)) {
      // Validate array of 0-6 (days of week)
      const validDays = body.repeat_days.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (!validDays) {
        return NextResponse.json(
          { error_code: "validation_error", error_message: "repeat_days must be an array of integers 0-6." },
          { status: 400 }
        );
      }
      updates.repeat_days = body.repeat_days;
    }
  }

  if (typeof body.day_of_month !== "undefined") {
    if (body.day_of_month === null) {
      updates.day_of_month = null;
      updates.repeat_day = null;  // Keep both fields in sync
    } else {
      const day = Number(body.day_of_month);
      if (Number.isNaN(day) || !isFinite(day) || day < 1 || day > 31) {
        return NextResponse.json(
          { error_code: "validation_error", error_message: "day_of_month must be between 1 and 31." },
          { status: 400 }
        );
      }
      const truncatedDay = Math.trunc(day);
      updates.day_of_month = truncatedDay;
      updates.repeat_day = truncatedDay;  // Keep both fields in sync for backward compatibility
    }
  }

  // Reference date for interval calculations
  if (typeof body.date !== "undefined") {
    console.log('[PATCH task-templates] Processing date field:', body.date);
    if (body.date === null || body.date === '') {
      updates.date = null;
      console.log('[PATCH task-templates] Setting date to null');
    } else {
      // Validate date format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(body.date)) {
        return NextResponse.json(
          { error_code: "validation_error", error_message: "date must be in YYYY-MM-DD format." },
          { status: 400 }
        );
      }
      updates.date = body.date;
      console.log('[PATCH task-templates] Setting date to:', body.date);
    }
  } else {
    console.log('[PATCH task-templates] Date field not in request body');
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error_code: "no_changes", error_message: "No valid fields to update." },
      { status: 400 }
    );
  }

  // VALIDATION: Prevent invalid weekly tasks without days
  if (updates.repeat_unit === 'weekly') {
    // If repeat_days is not being set in this update, fetch the current value
    if (typeof updates.repeat_days === 'undefined') {
      const { data: currentTemplate } = await supabase
        .from("task_templates")
        .select("repeat_days")
        .eq("id", templateId)
        .eq("user_id", userId)
        .single();
      
      // If current template has no repeat_days, we need to require it
      if (!currentTemplate?.repeat_days || currentTemplate.repeat_days.length === 0) {
        return NextResponse.json(
          { 
            error_code: "validation_error", 
            error_message: "Weekly tasks must have at least one day selected (repeat_days). Please specify which days of the week this task should repeat on." 
          },
          { status: 400 }
        );
      }
    } else if (updates.repeat_days === null || (Array.isArray(updates.repeat_days) && updates.repeat_days.length === 0)) {
      // Trying to set repeat_days to null or empty array on a weekly task
      return NextResponse.json(
        { 
          error_code: "validation_error", 
          error_message: "Weekly tasks must have at least one day selected. Please specify which days of the week this task should repeat on, or change repeat_unit to 'none' or 'daily'." 
        },
        { status: 400 }
      );
    }
  }

  // Update (also check user_id to ensure ownership)
  console.log(`[PATCH task-templates/${templateId}] Attempting update for user ${userId}:`, updates);
  
  // AUDIT LOG: Track any is_deleted changes
  if ('is_deleted' in updates) {
    console.log(`[AUDIT] Template ${templateId} is_deleted being set to ${updates.is_deleted} by user ${userId} at ${new Date().toISOString()}`);
  }
  
  const { data, error } = await supabase
    .from("task_templates")
    .update(updates)
    .eq("id", templateId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error(`[PATCH task-templates/${templateId}] Update failed:`, error);
    return NextResponse.json(
      { error_code: "update_failed", error_message: error.message },
      { status: 400 }
    );
  }

  console.log(`[PATCH task-templates/${templateId}] Update succeeded:`, data);

  // If start_time was updated, also update today's scheduled instance
  if (typeof body.start_time !== 'undefined') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    console.log(`[PATCH task-templates/${templateId}] start_time updated, syncing scheduled_tasks for ${today}`);
    
    const { data: scheduledData, error: scheduledError } = await supabase
      .from('scheduled_tasks')
      .update({ start_time: body.start_time })
      .eq('template_id', templateId)
      .eq('user_id', userId)
      .eq('local_date', today)
      .select();
    
    if (scheduledError) {
      console.error(`[PATCH task-templates/${templateId}] Failed to update scheduled_tasks:`, scheduledError);
    } else {
      console.log(`[PATCH task-templates/${templateId}] Updated ${scheduledData?.length ?? 0} scheduled tasks for today`);
    }
  }

  // Note: Auto-reschedule disabled - user should manually click "Recreate Schedule" button
  // to see template changes reflected in today's schedule

  return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    console.error('[PATCH task-templates] Error:', error);
    const status = error?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error_code: 'error', error_message: error?.message || 'Internal server error' },
      { status }
    );
  }
}


