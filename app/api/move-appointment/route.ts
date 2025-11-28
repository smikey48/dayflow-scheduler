import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserId } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const userId = await getAuthenticatedUserId(request);
    
    const body = await request.json();
    const { taskId, templateId, newDate, newTime, moveType, oldDate, startTime, endTime, isAppointment, isRoutine, isFutureInstance, title, description } = body;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate duration from original start/end times
    let durationMinutes = 30; // default
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }

    // Use newTime if provided, otherwise extract from original startTime
    const timeToUse = newTime || (startTime ? startTime.split('T')[1]?.split('.')[0] : '09:00:00');
    
    // Ensure time has seconds
    const formattedTime = timeToUse.includes(':') 
      ? (timeToUse.split(':').length === 2 ? `${timeToUse}:00` : timeToUse)
      : '09:00:00';

    if (moveType === 'single') {
      // Move single instance
      if (isFutureInstance) {
        // This is a future instance generated from template - create new scheduled task for new date
        // and create a deletion record for the old date to prevent it from showing
        const newStartTime = `${newDate}T${formattedTime}`;
        const newEndTimeDate = new Date(`${newDate}T${formattedTime}`);
        newEndTimeDate.setMinutes(newEndTimeDate.getMinutes() + durationMinutes);
        const newEndTime = newEndTimeDate.toISOString();

        // Check if a record already exists for this template on the new date
        const { data: existingTask } = await supabase
          .from('scheduled_tasks')
          .select('id, is_deleted')
          .eq('template_id', templateId)
          .eq('user_id', userId)
          .eq('local_date', newDate)
          .maybeSingle();

        if (existingTask) {
          // Update existing record instead of inserting
          const { error: updateError } = await supabase
            .from('scheduled_tasks')
            .update({
              title: title,
              description: description,
              start_time: newStartTime,
              end_time: newEndTime,
              is_appointment: isAppointment,
              is_routine: isRoutine,
              is_deleted: false,
              is_completed: false,
            })
            .eq('id', existingTask.id);

          if (updateError) {
            console.error('Error updating scheduled task:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        } else {
          // Create scheduled task for new date
          const { error: insertError } = await supabase
            .from('scheduled_tasks')
            .insert({
              template_id: templateId,
              user_id: userId,
              title: title,
              description: description,
              local_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              is_appointment: isAppointment,
              is_routine: isRoutine,
              is_deleted: false,
              is_completed: false,
            });

          if (insertError) {
            console.error('Error inserting scheduled task:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
          }
        }

        // Only create a deletion record if we're moving to a different date
        if (oldDate !== newDate) {
          // Check if deletion record already exists for old date
          const { data: existingDelete } = await supabase
            .from('scheduled_tasks')
            .select('id')
            .eq('template_id', templateId)
            .eq('user_id', userId)
            .eq('local_date', oldDate)
            .single();

          if (existingDelete) {
            // Update existing record to mark as deleted
            const { error: deleteError } = await supabase
              .from('scheduled_tasks')
              .update({
                is_deleted: true,
              })
              .eq('id', existingDelete.id);

            if (deleteError) {
              console.error('Error updating deletion record:', deleteError);
              return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }
          } else {
            // Create a deleted record for the old date to hide it
            const oldStartTime = startTime ? `${oldDate}T${startTime.split('T')[1]}` : null;
            const oldEndTime = endTime ? `${oldDate}T${endTime.split('T')[1]}` : null;

            const { error: deleteError } = await supabase
              .from('scheduled_tasks')
              .insert({
                template_id: templateId,
                user_id: userId,
                title: title,
                description: description,
                local_date: oldDate,
                start_time: oldStartTime,
                end_time: oldEndTime,
                is_appointment: isAppointment,
                is_routine: isRoutine,
                is_deleted: true,
                is_completed: false,
              });

            if (deleteError) {
              console.error('Error creating deletion record:', deleteError);
              return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }
          }
        }
      } else {
        // Update existing scheduled_tasks record
        const newStartTime = `${newDate}T${formattedTime}`;
        const newEndTimeDate = new Date(`${newDate}T${formattedTime}`);
        newEndTimeDate.setMinutes(newEndTimeDate.getMinutes() + durationMinutes);
        const newEndTime = newEndTimeDate.toISOString();

        const { error: updateError } = await supabase
          .from('scheduled_tasks')
          .update({
            local_date: newDate,
            start_time: newStartTime,
            end_time: newEndTime,
          })
          .eq('id', taskId)
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating scheduled task:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }
    } else if (moveType === 'series') {
      // Move entire series: update the template's date field and start_time
      if (!templateId) {
        return NextResponse.json({ error: 'Template ID required for series move' }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from('task_templates')
        .update({
          date: newDate,
          start_time: formattedTime,
        })
        .eq('id', templateId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating template:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Move appointment error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
