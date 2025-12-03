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

  // Repeat settings
  if (typeof body.repeat_unit !== "undefined") {
    const validUnits = ['none', 'daily', 'weekly', 'monthly', null];
    if (!validUnits.includes(body.repeat_unit)) {
      return NextResponse.json(
        { error_code: "validation_error", error_message: "repeat_unit must be 'none', 'daily', 'weekly', or 'monthly'." },
        { status: 400 }
      );
    }
    // Convert 'none' to null for database
    updates.repeat_unit = body.repeat_unit === 'none' ? null : body.repeat_unit;
    
    // When changing to one-off (none), clear repeat-related fields
    if (body.repeat_unit === 'none') {
      updates.repeat_interval = 1;  // Set to 1 for one-off tasks
      updates.repeat_days = null;    // Clear weekly days
      updates.repeat_day = null;     // Clear monthly day
      updates.date = null;           // Clear reference date
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
      updates.repeat_day = null;
    } else {
      const day = Number(body.day_of_month);
      if (Number.isNaN(day) || !isFinite(day) || day < 1 || day > 31) {
        return NextResponse.json(
          { error_code: "validation_error", error_message: "day_of_month must be between 1 and 31." },
          { status: 400 }
        );
      }
      updates.repeat_day = Math.trunc(day);
    }
  }

  // Reference date for interval calculations
  if (typeof body.date !== "undefined") {
    if (body.date === null || body.date === '') {
      updates.date = null;
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
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error_code: "no_changes", error_message: "No valid fields to update." },
      { status: 400 }
    );
  }

  // Update (also check user_id to ensure ownership)
  console.log(`[PATCH task-templates/${templateId}] Attempting update for user ${userId}:`, updates);
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


