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
    
    console.log('[move-appointment] Request:', { title, oldDate, newDate, moveType, isFutureInstance });

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
      console.log('[move-appointment] moveType is single');
      // Move single instance
      if (isFutureInstance) {
        console.log('[move-appointment] isFutureInstance is true, templateId:', templateId);
        // This is a future instance generated from template - create new scheduled task for new date
        // and create a deletion record for the old date to prevent it from showing
        const newStartTime = `${newDate}T${formattedTime}`;
        const newEndTimeDate = new Date(`${newDate}T${formattedTime}`);
        newEndTimeDate.setMinutes(newEndTimeDate.getMinutes() + durationMinutes);
        const newEndTime = newEndTimeDate.toISOString();
        console.log('[move-appointment] About to check/insert for newDate:', newDate, 'newStartTime:', newStartTime);

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

        // Update the template to keep it in sync
        if (templateId) {
          const updateFields: any = {};
          
          // If moving to a different date, update the template's reference date
          if (oldDate !== newDate) {
            updateFields.date = newDate;
            console.log('[move-appointment] Updating template date to:', newDate);
          }
          
          // If changing time, update the template's start_time
          if (newTime) {
            updateFields.start_time = formattedTime;
            console.log('[move-appointment] Updating template start_time to:', formattedTime);
          }

          // Only update if there are changes
          if (Object.keys(updateFields).length > 0) {
            const { error: templateError } = await supabase
              .from('task_templates')
              .update(updateFields)
              .eq('id', templateId)
              .eq('user_id', userId);

            if (templateError) {
              console.warn('[move-appointment] Failed to update template:', templateError);
              // Don't fail the request - scheduled task was updated successfully
            }
          }
        }
      }
    }
    
    if (moveType === 'series') {
      console.log('[move-appointment] Series move - templateId:', templateId, 'oldDate:', oldDate, 'newDate:', newDate);
      // Move entire series: update the template's repeat_days to reflect new day of week
      if (!templateId) {
        return NextResponse.json({ error: 'Template ID required for series move' }, { status: 400 });
      }

      // Calculate the new day of week (0 = Monday in DB format)
      const newDateObj = new Date(newDate);
      const jsDay = newDateObj.getDay(); // 0 = Sunday in JS
      const dbDay = jsDay === 0 ? 6 : jsDay - 1; // Convert to DB format: 0 = Monday, 6 = Sunday
      
      console.log('[move-appointment] New day calculation - JS day:', jsDay, 'DB day:', dbDay);

      const { error: updateError } = await supabase
        .from('task_templates')
        .update({
          repeat_days: [dbDay],
          start_time: formattedTime,
        })
        .eq('id', templateId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating template:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      
      console.log('[move-appointment] Successfully updated template repeat_days to [' + dbDay + ']');
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
