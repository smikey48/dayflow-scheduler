// app/api/voice-task/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { getAuthenticatedUserId } from '@/lib/auth';
export const runtime = "nodejs";

// ✅ Service-role Supabase server client
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// load prompts from /prompts
async function loadSystemPrompt() {
  const p = path.join(process.cwd(), "prompts", "d2_voice_task_system.md");
  return fs.readFile(p, "utf8");
}
async function loadUserTemplate() {
  const p = path.join(process.cwd(), "prompts", "d2_voice_task_user_template.txt");
  return fs.readFile(p, "utf8");
}

// schema (validation)
const VoiceTaskSchema = z.object({
  user_id: z.string().min(1),
  task_type: z.enum(["appointment", "floating"]),
  title: z.string().min(1),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time_local: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]),
  end_time_local: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]),
  duration_minutes: z.coerce.number().int().min(0), // Coerce strings to numbers
  repeat_unit: z.enum(["none", "daily", "weekly", "monthly"]),
  repeat_interval: z.coerce.number().int().min(1), // Coerce strings to numbers
  repeat_day: z.coerce.number().int().nullable(), // Coerce strings to numbers
  is_appointment: z.boolean(),
  is_fixed: z.boolean(),
  is_routine: z.boolean(),
  notes: z.string(),
  timezone: z.literal("Europe/London"),
  origin_template_id: z.null(),
  confidence_notes: z.string(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
});

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req);
    
    const { transcript, duration_override, priority_override } = await req.json();
    if (!transcript) {
      return NextResponse.json(
        { error: "Provide JSON body with { transcript }" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const system = await loadSystemPrompt();
    const template = await loadUserTemplate();

    // today's date in Europe/London (YYYY-MM-DD)
    const london = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // en-CA → yyyy-mm-dd

    const userMsg = template
      .replace("{spoken_text}", transcript)
      .replace("{yyyy-mm-dd}", london)
      .replace("{uuid}", userId);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw },
        { status: 502 }
      );
    }

    const parsedResult = VoiceTaskSchema.safeParse(parsed);
    if (!parsedResult.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsedResult.error.issues, raw: parsed },
        { status: 422 }
      );
    }

    // ---- DB write (Supabase, service role) ----
    const task: z.infer<typeof VoiceTaskSchema> = parsedResult.data;

    // Guard against generic/empty titles from the parser.
    // Prefer transcript-derived text (first ~10 words) when needed.
    let title = (task.title ?? "").trim();
    if (!title || /^(task|floating task)$/i.test(title)) {
      const fallback = typeof transcript === "string" ? transcript.trim() : "";
      title = fallback ? fallback.split(/\s+/).slice(0, 10).join(" ") : "Untitled";
    }

    // 1) Decide `kind` first from validated flags
    const is_appointment = task.is_appointment === true;
    const is_routine = task.is_routine === true;

    if (is_appointment && is_routine) {
      return NextResponse.json(
        { error: "Choose either appointment or routine, not both." },
        { status: 400 }
      );
    }

    // Appointments and routines MUST have a start time
    // If no start time provided, force to floating regardless of flags
    const hasStartTime = Boolean(task.start_time_local);
    
    let kind: "appointment" | "routine" | "floating";
    if (is_appointment && hasStartTime) kind = "appointment";
    else if (is_routine && hasStartTime) kind = "routine";
    else kind = "floating"; // No time = floating (even if LLM said routine)

    // 2) Duration: enforce default 25 minutes for floating tasks
    let duration_minutes = task.duration_minutes ?? 0;
    if (kind === "floating" && (!duration_minutes || duration_minutes <= 0)) {
      duration_minutes = 25;
    }
    
    // Override duration if specified (e.g., from quick-note)
    if (duration_override && typeof duration_override === 'number' && duration_override > 0) {
      duration_minutes = duration_override;
    }
    
    // Override priority if specified (e.g., from quick-note)
    let priority = task.priority ?? 3;
    if (priority_override && typeof priority_override === 'number' && priority_override >= 1 && priority_override <= 5) {
      priority = priority_override;
    }

    // Helper: "HH:MM" → "HH:MM:00" for TIME WITHOUT TZ columns
    const toTime = (hhmm: string | null) => (hhmm ? `${hhmm}:00` : null);

    // Build the template payload for BOTH repeating and one-off ("none")
    const isWeekly = task.repeat_unit === "weekly";
    const isMonthly = task.repeat_unit === "monthly";

    // NOTE: For one-offs we still set repeat_unit='none' so the Python scheduler
    // will pick them up and create scheduled instances later.
    const templateRow = {
      user_id: userId,
      title,
      kind, // "appointment" | "floating" | "routine"

      // repeat settings
      repeat_unit: task.repeat_unit, // "none" | "daily" | "weekly" | "monthly"
      repeat_interval: task.repeat_interval ?? 1,
      repeat_days:
        isWeekly && Number.isInteger(task.repeat_day) 
          ? [Number(task.repeat_day)] // Ensure integer, not string
          : null,
      day_of_month:
        isMonthly && Number.isInteger(task.repeat_day) 
          ? Number(task.repeat_day) // Ensure integer, not string
          : null,

      // time + duration on the template
      start_time: toTime(task.start_time_local), // TIME WITHOUT TZ
      duration_minutes,

      // flags derived from kind + timezone
      is_appointment: kind === "appointment",
      is_routine: kind === "routine",
      is_fixed: task.is_fixed,
      timezone: task.timezone,


      // optional text
      notes: (task.notes ?? "").trim() || null,
      description: (task.confidence_notes ?? "").trim() || null,
      
      // priority (1-5, with override support)
      priority: priority,
    };

    console.log(
      "VOICE_TASK: inserting templateRow =>",
      JSON.stringify(templateRow, null, 2)
    );

    const { data: inserted, error: tErr } = await supabase
      .from("task_templates")
      .insert(templateRow)
      .select()
      .single();

    if (tErr) {
      return NextResponse.json(
        { error: `supabase insert task_templates: ${tErr.message}` },
        { status: 500 }
      );
    }

    // Your table might use either "template_id" or "id" as the PK; normalize.
    const newTemplateId = (inserted as any)?.template_id ?? (inserted as any)?.id;

    return NextResponse.json(
      {
        ok: true,
        saved_to: "task_templates",
        template_id: newTemplateId,
        note: "Template created. The Python scheduler will generate scheduled_tasks.",
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    const msg = e?.response?.data || e?.message || "Unexpected error";
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: String(msg) }, { status });
  }
}
