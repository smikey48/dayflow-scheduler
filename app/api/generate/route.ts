// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(req);

  if (!userId) {
    return NextResponse.json({
      ok: true,
      message: 'No-op: generation is handled by the Python scheduler (no user).',
      wrote: false
    });
  }

    // IMPORTANT: Do not write to scheduled_tasks here.
    // This endpoint now only acknowledges the request.
    return NextResponse.json({
      ok: true,
      message: 'No-op: generation is handled by the Python scheduler. Nothing was written.',
      wrote: false
    });
  } catch (error: any) {
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status }
    );
  }
}
