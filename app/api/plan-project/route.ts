// app/api/plan-project/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert project planning assistant helping users with ADHD break down major projects into manageable phases and tasks.

Your role is to:
- Analyze the major project and identify logical phases or milestones
- Break each phase into concrete, actionable tasks
- Suggest realistic timeframes for each phase and task
- Consider dependencies and natural ordering
- Keep individual tasks to 15-120 minutes (prefer 30-60 min chunks)
- Use specific, action-oriented language
- Consider ADHD-friendly principles: clear next steps, low activation energy, visible progress

For academic projects (like dissertations):
- Break by research → writing → revision phases
- Include specific deliverables (outline, lit review, chapter drafts)
- Account for feedback cycles and revision time
- Suggest realistic weekly time commitments

For software projects:
- Break by feature/component, not generic "coding" steps
- Include setup, implementation, testing, documentation
- Consider technical dependencies

For creative projects:
- Break by creative phases (ideation, drafting, refinement)
- Include research and inspiration gathering
- Plan for revision and feedback incorporation

Return JSON with this structure:
{
  "approach": "Brief explanation of the suggested breakdown approach (2-3 sentences)",
  "phases": [
    {
      "phase_name": "Phase 1: Research & Planning",
      "description": "What this phase accomplishes",
      "estimated_weeks": 4,
      "tasks": [
        {
          "title": "Specific task title",
          "description": "What to do and why",
          "duration_minutes": 60,
          "order": 1
        }
      ]
    }
  ],
  "total_estimated_weeks": 12,
  "notes": "Additional guidance, tips, or considerations for ADHD users"
}`;

const TaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5).max(1000),
  duration_minutes: z.number().int().min(15).max(240),
  order: z.number().int().min(1),
});

const PhaseSchema = z.object({
  phase_name: z.string().min(3).max(200),
  description: z.string().min(5).max(1000),
  estimated_weeks: z.number().min(0.5).max(52),
  tasks: z.array(TaskSchema).min(1).max(20),
});

const ProjectPlanSchema = z.object({
  approach: z.string().min(10).max(2000),
  phases: z.array(PhaseSchema).min(1).max(10),
  total_estimated_weeks: z.number().min(0.5).max(104),
  notes: z.string().min(10).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await getAuthenticatedUserId(req);
    
    const { project_title, project_description } = await req.json();

    if (!project_title || typeof project_title !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid project_title' },
        { status: 400 }
      );
    }

    const userPrompt = `Major Project: ${project_title}

${project_description ? `Description/Context:\n${project_description}\n\n` : ''}Please create a detailed, ADHD-friendly project plan with phases and actionable tasks.`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'OpenAI returned invalid JSON' },
        { status: 500 }
      );
    }

    const validationResult = ProjectPlanSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.error('OpenAI response validation failed:', validationResult.error);
      return NextResponse.json(
        { ok: false, error: 'OpenAI response did not match expected schema', details: validationResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ...validationResult.data });
  } catch (err: any) {
    console.error('Error in /api/plan-project:', err);
    const status = err?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status }
    );
  }
}
