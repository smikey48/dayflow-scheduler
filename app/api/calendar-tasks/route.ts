import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserId } from '@/lib/auth';

// Initialize at module level
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const requestStartTime = Date.now();
  console.log(`[calendar-tasks API] Request received at ${new Date().toISOString()}`);
  
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(request);
    
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    console.log(`[calendar-tasks API] Params: startDate=${startDate}, endDate=${endDate}, userId=${userId}`);

    if (!startDate || !endDate) {
      console.error('[calendar-tasks API] Missing required parameters');
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[calendar-tasks API] Supabase client created');

    // 1. Fetch existing scheduled tasks in range (only appointments, exclude deleted tasks for display)
    console.log('[calendar-tasks API] Fetching existing scheduled tasks...');
    const { data: existingTasks, error: existingError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('is_appointment', true)
      .gte('local_date', startDate)
      .lte('local_date', endDate)
      .not('start_time', 'is', null);

    if (existingError) {
      console.error('[calendar-tasks API] Error fetching existing tasks:', {
        message: existingError.message,
        details: existingError.details,
        code: existingError.code,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    console.log(`[calendar-tasks API] Fetched ${existingTasks?.length || 0} existing tasks`);
    existingTasks?.forEach(t => {
      console.log(`  Existing: ${t.title}, date: ${t.local_date}, start: ${t.start_time}`);
    });

    // Also fetch ALL scheduled tasks (including deleted) to check against when generating future instances
    const { data: allScheduledTasks, error: allScheduledError } = await supabase
      .from('scheduled_tasks')
      .select('id, template_id, local_date')
      .eq('user_id', userId)
      .eq('is_appointment', true)
      .gte('local_date', startDate)
      .lte('local_date', endDate);

    if (allScheduledError) {
      console.error('Error fetching all scheduled tasks:', allScheduledError);
      return NextResponse.json({ error: allScheduledError.message }, { status: 500 });
    }

    // 2. Fetch recurring appointment templates (only appointments, exclude deleted)
    // Note: Check both 'repeat' (legacy) and 'repeat_unit' columns
    const { data: templates, error: templatesError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('is_appointment', true);

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      return NextResponse.json({ error: templatesError.message }, { status: 500 });
    }

    // Debug: Also check for ALL appointments (recurring or not)
    const { data: allAppointments } = await supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('is_appointment', true);
    
    console.log(`Total appointments in task_templates: ${allAppointments?.length || 0}`);
    allAppointments?.forEach(a => {
      console.log(`  Appointment: ${a.title}, repeat: ${a.repeat}, repeat_unit: ${a.repeat_unit}, repeat_interval: ${a.repeat_interval}, repeat_days: ${JSON.stringify(a.repeat_days)}`);
    });
    
    // Separate recurring templates from one-off appointments
    const recurringTemplates: any[] = [];
    const oneOffAppointments: any[] = [];
    
    templates?.forEach(t => {
      const repeat = t.repeat;
      const repeatUnit = t.repeat_unit;
      // If repeat_unit is 'none', use the repeat column instead
      const effectiveRepeat = (repeatUnit === 'none' || !repeatUnit) ? repeat : repeatUnit;
      
      if (effectiveRepeat && effectiveRepeat !== 'none') {
        recurringTemplates.push(t);
      } else if (t.local_date || t.date) {
        // One-off appointment with a specific date (check both local_date and date fields)
        oneOffAppointments.push(t);
      }
    });

    console.log(`Fetched ${recurringTemplates.length} recurring templates for calendar`);
    recurringTemplates.forEach(t => {
      console.log(`  Template: ${t.title}, is_appointment: ${t.is_appointment}, is_routine: ${t.is_routine}, repeat: ${t.repeat}, repeat_unit: ${t.repeat_unit}, repeat_days: ${JSON.stringify(t.repeat_days)}`);
    });

    console.log(`Fetched ${oneOffAppointments.length} one-off appointments for calendar`);
    oneOffAppointments.forEach(t => {
      console.log(`  One-off: ${t.title}, date: ${t.date || t.local_date}`);
    });

    // 3. Generate future instances for recurring templates
    const futureInstances: any[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    recurringTemplates.forEach(template => {
      // Use repeat if repeat_unit is 'none', otherwise use repeat_unit
      const ru = template.repeat_unit;
      const effectiveRepeat = (ru === 'none' || !ru) ? template.repeat : ru;
      const repeatUnit = (effectiveRepeat || '').toLowerCase();
      if (!repeatUnit || repeatUnit === 'none') return;
      const repeatInterval = template.repeat_interval || 1;
      const repeatDays = template.repeat_days; // Array of day numbers for weekly patterns
      let currentDate = new Date(start);

      // For weekly/monthly, use the template's reference date or start_time to determine base day
      const templateRefDate = template.date ? new Date(template.date) : null;

      // Generate instances for each day in range
      while (currentDate <= end) {
        let shouldInclude = false;
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Convert JS day to database format (0-based, Monday=0)
        // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
        // DB: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
        const dbDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        // Check if this day matches the recurrence pattern
        if (repeatUnit === 'daily') {
          // For daily with interval > 1, check if days since reference match interval
          if (repeatInterval === 1) {
            shouldInclude = true;
          } else if (templateRefDate) {
            const daysDiff = Math.floor((currentDate.getTime() - templateRefDate.getTime()) / (1000 * 60 * 60 * 24));
            shouldInclude = daysDiff >= 0 && daysDiff % repeatInterval === 0;
          }
        } else if (repeatUnit === 'weekly') {
          // Use repeat_days array if present
          // Database uses 0=Monday, 1=Tuesday, 2=Wednesday, ..., 6=Sunday
          if (repeatDays && Array.isArray(repeatDays) && repeatDays.length > 0) {
            shouldInclude = repeatDays.includes(dbDayOfWeek);
            // If template has a reference date, only include if current date is on or after that date
            if (shouldInclude && templateRefDate) {
              const refDate = new Date(templateRefDate);
              refDate.setHours(0, 0, 0, 0);
              const checkDate = new Date(currentDate);
              checkDate.setHours(0, 0, 0, 0);
              shouldInclude = checkDate >= refDate;
            }
          } else if (templateRefDate) {
            // Fall back to template's original day of week
            const templateJsDayOfWeek = templateRefDate.getDay();
            shouldInclude = dayOfWeek === templateJsDayOfWeek;
          }
        } else if (repeatUnit === 'weekday' || repeatUnit === 'weekdays') {
          shouldInclude = dayOfWeek >= 1 && dayOfWeek <= 5;
        } else if (repeatUnit === 'monthly') {
          // Check if day of month matches
          if (template.day_of_month) {
            shouldInclude = currentDate.getDate() === template.day_of_month;
          } else if (templateRefDate) {
            shouldInclude = currentDate.getDate() === templateRefDate.getDate();
          }
        }

        if (shouldInclude) {
          // Check if instance already exists (including deleted ones)
          const dateKey = currentDate.toISOString().split('T')[0];
          const exists = allScheduledTasks?.some(
            task => task.template_id === template.id && task.local_date === dateKey
          );

          if (!exists) {
            // Generate start/end times for this date
            const startTime = template.start_time
              ? `${dateKey}T${template.start_time}`
              : null;
            const endTime = startTime && template.duration_minutes
              ? new Date(new Date(startTime).getTime() + template.duration_minutes * 60000).toISOString()
              : null;

            futureInstances.push({
              id: `future-${template.id}-${dateKey}`,
              template_id: template.id,
              title: template.title,
              description: template.description,
              local_date: dateKey,
              start_time: startTime,
              end_time: endTime,
              is_appointment: template.is_appointment || false,
              is_routine: template.is_routine || false,
              is_completed: false,
              is_future_instance: true, // Flag to indicate this is generated
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    // 4. Add one-off appointments that fall within the date range
    oneOffAppointments.forEach(template => {
      const appointmentDate = template.local_date || template.date;
      if (appointmentDate && appointmentDate >= startDate && appointmentDate <= endDate) {
        // Check if instance already exists in scheduled_tasks
        const exists = existingTasks?.some(
          task => task.template_id === template.id && task.local_date === appointmentDate
        );

        if (!exists) {
          // Generate start/end times for this date
          const startTime = template.start_time
            ? `${appointmentDate}T${template.start_time}`
            : null;
          const endTime = startTime && template.duration_minutes
            ? new Date(new Date(startTime).getTime() + template.duration_minutes * 60000).toISOString()
            : null;

          futureInstances.push({
            id: `oneoff-${template.id}-${appointmentDate}`,
            template_id: template.id,
            title: template.title,
            description: template.description,
            local_date: appointmentDate,
            start_time: startTime,
            end_time: endTime,
            is_appointment: template.is_appointment || false,
            is_routine: template.is_routine || false,
            is_completed: false,
            is_future_instance: true, // Flag to indicate this is generated
          });
        }
      }
    });

    // 5. Combine existing tasks with future instances
    const allTasks = [...(existingTasks || []), ...futureInstances];

    const requestDuration = Date.now() - requestStartTime;
    console.log(`[calendar-tasks API] Success! Returning ${allTasks.length} total tasks (${existingTasks?.length || 0} existing + ${futureInstances.length} future) in ${requestDuration}ms`);

    return NextResponse.json(allTasks, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error('[calendar-tasks API] Exception:', {
      error: error,
      message: error.message || 'Internal server error',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status }
    );
  }
}
