import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserId } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(request);
    
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title');

    if (!title) {
      return NextResponse.json(
        { error: 'Missing title parameter' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find templates matching the title
    const { data: templates, error: findError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', `%${title}%`);

    if (findError) {
      console.error('Error finding templates:', findError);
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ message: 'No matching templates found', deleted: 0 });
    }

    // Delete all matching templates
    const deletePromises = templates.map(template =>
      supabase.from('task_templates').delete().eq('id', template.id)
    );

    await Promise.all(deletePromises);

    console.log(`Deleted ${templates.length} template(s) matching "${title}":`);
    templates.forEach(t => console.log(`  - ${t.title} (ID: ${t.id})`));

    return NextResponse.json({
      message: `Successfully deleted ${templates.length} template(s)`,
      deleted: templates.length,
      templates: templates.map(t => ({ id: t.id, title: t.title }))
    });

  } catch (error: any) {
    console.error('Delete template error:', error);
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status }
    );
  }
}
