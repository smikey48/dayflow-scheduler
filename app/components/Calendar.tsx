'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser } from '../../lib/supabaseBrowser';

type CalendarTask = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  is_appointment: boolean;
  is_routine: boolean;
  local_date: string;
  template_id?: string;
  is_future_instance?: boolean;
};

type ViewMode = 'week' | 'month';

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  }).format(date);
}

export default function Calendar() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarTask | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');
  const [moveType, setMoveType] = useState<'single' | 'series'>('single');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteType, setDeleteType] = useState<'single' | 'series'>('single');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Calculate date range based on view mode
  const getDateRange = () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === 'week') {
      // Start of week (Monday)
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);

      // End of week (Sunday)
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // Start of month
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      // End of month
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  // Fetch tasks for the current date range
  const fetchTasks = useCallback(async () => {
    const fetchStartTime = Date.now();
    console.log('[Calendar.fetchTasks] Starting fetch...');
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const startDate = start.toISOString().split('T')[0];
      const endDate = end.toISOString().split('T')[0];
      console.log(`[Calendar.fetchTasks] Date range: ${startDate} to ${endDate}`);

      const supabase = supabaseBrowser();
      
      // Get current user
      console.log('[Calendar.fetchTasks] Getting user...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('[Calendar.fetchTasks] Auth error:', {
          message: userError.message,
          code: userError.code,
          timestamp: new Date().toISOString()
        });
        setLoading(false);
        return;
      }
      if (!user) {
        console.error('[Calendar.fetchTasks] No user logged in');
        setLoading(false);
        return;
      }
      console.log(`[Calendar.fetchTasks] User: ${user.id}`);

      // Fetch from our calendar API that includes future recurring instances
      const apiUrl = `/api/calendar-tasks?startDate=${startDate}&endDate=${endDate}&userId=${user.id}&t=${Date.now()}`;
      console.log(`[Calendar.fetchTasks] Fetching from API: ${apiUrl}`);
      
      const response = await fetch(
        apiUrl,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        }
      );

      if (!response.ok) {
        console.error('[Calendar.fetchTasks] HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          url: apiUrl,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const data = await response.json();
      console.log(`[Calendar.fetchTasks] Success! Fetched ${data?.length || 0} tasks in ${Date.now() - fetchStartTime}ms`);
      setTasks(data || []);
    } catch (err) {
      console.error('[Calendar.fetchTasks] Exception caught:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode]);

  // Refetch tasks when date or view changes
  useEffect(() => {
    fetchTasks();
  }, [currentDate, viewMode]);

  // Also refetch when component regains focus (handles external schedule updates)
  useEffect(() => {
    const handleFocus = () => {
      fetchTasks();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Listen for schedule recreation events from other components (e.g., Today view)
  useEffect(() => {
    const handleScheduleRecreated = () => {
      console.log('Calendar: Received scheduleRecreated event, refreshing...');
      fetchTasks();
    };
    window.addEventListener('scheduleRecreated', handleScheduleRecreated);
    return () => window.removeEventListener('scheduleRecreated', handleScheduleRecreated);
  }, [fetchTasks]);

  // Navigation handlers
  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get days to display - memoized to recalculate when viewMode or currentDate changes
  const days = React.useMemo(() => {
    const { start, end } = getDateRange();
    const daysArray: Date[] = [];

    if (viewMode === 'month') {
      // For month view, start from the Monday of the week containing the 1st
      const monthStart = new Date(start);
      const dayOfWeek = monthStart.getDay();
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0 offset
      monthStart.setDate(monthStart.getDate() - daysToSubtract);

      // Fill until we have at least 35 days (5 weeks) or 42 days (6 weeks)
      const current = new Date(monthStart);
      const maxDays = 42; // Always show 6 weeks for consistency
      for (let i = 0; i < maxDays; i++) {
        daysArray.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    } else {
      // Week view - just the 7 days
      const current = new Date(start);
      while (current <= end) {
        daysArray.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    }

    return daysArray;
  }, [viewMode, currentDate]);

  // Group tasks by date and sort by start time
  const tasksByDate = tasks.reduce((acc, task) => {
    if (!acc[task.local_date]) {
      acc[task.local_date] = [];
    }
    acc[task.local_date].push(task);
    return acc;
  }, {} as Record<string, CalendarTask[]>);

  // Sort tasks within each date by start time
  Object.keys(tasksByDate).forEach(date => {
    tasksByDate[date].sort((a, b) => {
      const timeA = a.start_time || '';
      const timeB = b.start_time || '';
      return timeA.localeCompare(timeB);
    });
  });

  // Format header title
  const getHeaderTitle = () => {
    if (viewMode === 'week') {
      const { start, end } = getDateRange();
      const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    } else {
      return currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
  };

  const handleTaskClick = (task: CalendarTask) => {
    setSelectedTask(task);
    setEditMode(false);
    // Extract times for editing
    const startMatch = task.start_time.match(/(\d{2}:\d{2})/);
    const endMatch = task.end_time.match(/(\d{2}:\d{2})/);
    setEditStartTime(startMatch ? startMatch[1] : '09:00');
    setEditEndTime(endMatch ? endMatch[1] : '10:00');
  };

  const handleTimeSlotClick = (date: Date, hour: number) => {
    // TODO: Create new task modal
    console.log('Time slot clicked:', date, hour);
  };

  const handleEditSave = async () => {
    if (!selectedTask) return;

    try {
      const supabase = supabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('Please sign in to edit appointments');
        return;
      }

      // Calculate new start and end times with the edited values
      const newStartTime = `${selectedTask.local_date}T${editStartTime}:00`;
      const newEndTime = `${selectedTask.local_date}T${editEndTime}:00`;

      // Use the move-appointment API with the same date but updated times
      const response = await fetch('/api/move-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          taskId: selectedTask.id,
          templateId: selectedTask.template_id,
          title: selectedTask.title,
          description: selectedTask.description,
          newDate: selectedTask.local_date, // Same date
          newTime: editStartTime,
          moveType: 'single',
          oldDate: selectedTask.local_date,
          startTime: newStartTime, // Use new times for duration calculation
          endTime: newEndTime,
          isAppointment: selectedTask.is_appointment,
          isRoutine: selectedTask.is_routine,
          isFutureInstance: selectedTask.is_future_instance,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update appointment time');
      }

      // Refresh tasks
      await fetchTasks();
      setEditMode(false);
      setSelectedTask(null);
    } catch (error: any) {
      console.error('Error updating task time:', error);
      alert(error.message || 'Failed to update appointment time');
    }
  };

  const handleMoveClick = async () => {
    if (selectedTask) {
      setMoveDate(selectedTask.local_date);
      
      // For routines, fetch template's original time to prevent overwriting with scheduled time
      if (selectedTask.is_routine && selectedTask.template_id) {
        try {
          const supabase = supabaseBrowser();
          const { data: template } = await supabase
            .from('task_templates')
            .select('start_time')
            .eq('id', selectedTask.template_id)
            .single();
          
          if (template?.start_time) {
            const timeMatch = template.start_time.match(/(\d{2}:\d{2})/);
            setMoveTime(timeMatch ? timeMatch[1] : '11:00');
          } else {
            setMoveTime('11:00');
          }
        } catch (err) {
          console.error('Error fetching template time:', err);
          // Fallback to scheduled time if template fetch fails
          if (selectedTask.start_time) {
            const timeMatch = selectedTask.start_time.match(/(\d{2}:\d{2})/);
            setMoveTime(timeMatch ? timeMatch[1] : '11:00');
          } else {
            setMoveTime('11:00');
          }
        }
      } else {
        // For appointments and floating tasks, use scheduled time
        if (selectedTask.start_time) {
          const timeMatch = selectedTask.start_time.match(/(\d{2}:\d{2})/);
          setMoveTime(timeMatch ? timeMatch[1] : '09:00');
        } else {
          setMoveTime('09:00');
        }
      }
      setShowMoveDialog(true);
    }
  };

  const handleMoveConfirm = async () => {
    if (!selectedTask || !moveDate) return;

    try {
      const supabase = supabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('Please sign in to move appointments');
        return;
      }

      const response = await fetch('/api/move-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          taskId: selectedTask.id,
          templateId: selectedTask.template_id,
          title: selectedTask.title,
          description: selectedTask.description,
          newDate: moveDate,
          newTime: moveTime,
          moveType: moveType,
          oldDate: selectedTask.local_date,
          startTime: selectedTask.start_time,
          endTime: selectedTask.end_time,
          isAppointment: selectedTask.is_appointment,
          isRoutine: selectedTask.is_routine,
          isFutureInstance: selectedTask.is_future_instance,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to move appointment');
      }

      // Refresh tasks
      await fetchTasks();
      setShowMoveDialog(false);
      setSelectedTask(null);
    } catch (error: any) {
      console.error('Error moving task:', error);
      alert(error.message || 'Failed to move appointment');
    }
  };

  const handleDeleteClick = () => {
    if (selectedTask) {
      setDeleteType('single');
      setDeleteConfirmText('');
      setShowDeleteDialog(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTask) return;

    // Extra protection: require typing task title to delete entire series
    if (deleteType === 'series' && deleteConfirmText !== selectedTask.title) {
      alert(`Please type "${selectedTask.title}" exactly to confirm deletion of the entire recurring series.`);
      return;
    }

    try {
      const supabase = supabaseBrowser();
      const userId = (await supabase.auth.getUser()).data.user?.id;

      if (!userId) {
        alert('Please sign in to delete appointments');
        return;
      }

      if (deleteType === 'single') {
        // Delete only this instance
        if (selectedTask.is_future_instance) {
          // This is a future instance - create a deleted record to prevent it from showing
          const { error } = await supabase
            .from('scheduled_tasks')
            .insert({
              template_id: selectedTask.template_id,
              user_id: userId,
              title: selectedTask.title,
              description: selectedTask.description,
              local_date: selectedTask.local_date,
              start_time: selectedTask.start_time,
              end_time: selectedTask.end_time,
              is_appointment: selectedTask.is_appointment,
              is_routine: selectedTask.is_routine,
              is_deleted: true,
              is_completed: false,
            });

          if (error) throw error;
        } else {
          // This is an existing scheduled task - soft delete it
          const { error } = await supabase
            .from('scheduled_tasks')
            .update({ is_deleted: true })
            .eq('id', selectedTask.id);

          if (error) throw error;
        }
      } else {
        // Delete entire series - soft delete the template
        if (selectedTask.template_id) {
          const { error } = await supabase
            .from('task_templates')
            .update({ is_deleted: true })
            .eq('id', selectedTask.template_id);

          if (error) throw error;
        } else {
          // No template, just delete this instance
          if (selectedTask.is_future_instance) {
            const { error } = await supabase
              .from('scheduled_tasks')
              .insert({
                template_id: selectedTask.template_id,
                user_id: userId,
                title: selectedTask.title,
                description: selectedTask.description,
                local_date: selectedTask.local_date,
                start_time: selectedTask.start_time,
                end_time: selectedTask.end_time,
                is_appointment: selectedTask.is_appointment,
                is_routine: selectedTask.is_routine,
                is_deleted: true,
                is_completed: false,
              });

            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('scheduled_tasks')
              .update({ is_deleted: true })
              .eq('id', selectedTask.id);

            if (error) throw error;
          }
        }
      }

      // Refresh tasks
      await fetchTasks();
      setShowDeleteDialog(false);
      setSelectedTask(null);
    } catch (error: any) {
      console.error('Error deleting task:', error);
      alert(error.message || 'Failed to delete appointment');
    }
  };

  return (
    <div className="mt-8 rounded-2xl border p-6 w-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Appointments</h2>
          <div className="flex gap-1 rounded-lg border p-1">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'week' ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'month' ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
            >
              Month
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className="px-3 py-1 rounded border hover:bg-gray-50"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 rounded border hover:bg-gray-50 text-sm"
          >
            Today
          </button>
          <button
            onClick={goToNext}
            className="px-3 py-1 rounded border hover:bg-gray-50"
          >
            →
          </button>
          <button
            onClick={fetchTasks}
            className="ml-2 px-3 py-1 rounded border hover:bg-gray-50 text-sm"
            title="Refresh appointments"
          >
            ↻
          </button>
          <span className="ml-2 text-sm font-medium">{getHeaderTitle()}</span>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : viewMode === 'week' ? (
        /* Diary-style week view */
        <div className="flex gap-6 max-w-[1400px] mx-auto">
          {/* Left page (Mon-Wed) */}
          <div className="flex-1 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-lg border-r-2 border-amber-200 p-8 relative">
            <div className="absolute top-2 left-2 text-xs text-amber-400 opacity-50">Left</div>
            <div className="space-y-6">
              {days.slice(0, 3).map((day) => {
                const dateKey = day.toISOString().split('T')[0];
                const dayTasks = tasksByDate[dateKey] || [];
                const isToday = day.toDateString() === new Date().toDateString();

                return (
                  <div key={day.toISOString()} className="pb-6 border-b border-amber-200 last:border-0">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <h3 className={`text-2xl font-serif ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>
                          {day.toLocaleDateString('en-GB', { weekday: 'long' })}
                        </h3>
                        <p className="text-sm text-gray-500 font-serif">
                          {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                      {isToday && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                          Today
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2 pl-4">
                      {dayTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 italic font-serif">No appointments</p>
                      ) : (
                        dayTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaskClick(task);
                            }}
                            className={`w-full text-left p-3 rounded-md transition-all hover:shadow-md ${
                              task.is_appointment
                                ? 'bg-white border-l-4 border-purple-400 hover:bg-purple-50'
                                : 'bg-white border-l-4 border-green-400 hover:bg-green-50'
                            }`}
                          >
                            <div className="font-medium text-gray-900 mb-1">{task.title}</div>
                            <div className="text-sm text-gray-600 font-mono">
                              {formatTime(task.start_time)} - {formatTime(task.end_time)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center binding/spine */}
          <div className="w-8 bg-gradient-to-b from-gray-300 via-gray-400 to-gray-300 rounded-sm shadow-inner relative">
            <div className="absolute inset-0 flex flex-col justify-evenly">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-px bg-gray-500 opacity-30"></div>
              ))}
            </div>
          </div>

          {/* Right page (Thu-Sun) */}
          <div className="flex-1 bg-gradient-to-bl from-amber-50 to-orange-50 rounded-lg shadow-lg border-l-2 border-amber-200 p-8 relative">
            <div className="absolute top-2 right-2 text-xs text-amber-400 opacity-50">Right</div>
            <div className="space-y-6">
              {days.slice(3, 7).map((day) => {
                const dateKey = day.toISOString().split('T')[0];
                const dayTasks = tasksByDate[dateKey] || [];
                const isToday = day.toDateString() === new Date().toDateString();

                return (
                  <div key={day.toISOString()} className="pb-6 border-b border-amber-200 last:border-0">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <h3 className={`text-2xl font-serif ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>
                          {day.toLocaleDateString('en-GB', { weekday: 'long' })}
                        </h3>
                        <p className="text-sm text-gray-500 font-serif">
                          {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                      {isToday && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                          Today
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2 pl-4">
                      {dayTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 italic font-serif">No appointments</p>
                      ) : (
                        dayTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaskClick(task);
                            }}
                            className={`w-full text-left p-3 rounded-md transition-all hover:shadow-md ${
                              task.is_appointment
                                ? 'bg-white border-l-4 border-purple-400 hover:bg-purple-50'
                                : 'bg-white border-l-4 border-green-400 hover:bg-green-50'
                            }`}
                          >
                            <div className="font-medium text-gray-900 mb-1">{task.title}</div>
                            <div className="text-sm text-gray-600 font-mono">
                              {formatTime(task.start_time)} - {formatTime(task.end_time)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Original month view grid */
        <div className="grid grid-cols-7 gap-2 w-full">
          {/* Day headers */}
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
            <div key={dayName} className="text-center font-medium text-sm py-2 border-b">
              {dayName}
            </div>
          ))}

          {/* Day cells */}
          {days.map((day, idx) => {
            const dateKey = day.toISOString().split('T')[0];
            const dayTasks = tasksByDate[dateKey] || [];
            const isToday = day.toDateString() === new Date().toDateString();
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isOtherMonth = viewMode === 'month' && !isCurrentMonth;

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[100px] border rounded p-2 ${
                  isToday ? 'bg-blue-50 border-blue-300' : 
                  isOtherMonth ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
                } cursor-pointer transition-colors`}
                onClick={() => handleTimeSlotClick(day, 9)}
                title={`${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
              >
                <div className={`text-sm font-medium mb-2 ${
                  isToday ? 'text-blue-600' : 
                  isOtherMonth ? 'text-gray-400' : ''
                }`}>
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskClick(task);
                      }}
                      className={`w-full text-left text-xs p-1 rounded truncate ${
                        task.is_appointment
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                      title={`${task.title} (${formatTime(task.start_time)} - ${formatTime(task.end_time)})`}
                    >
                      {formatTime(task.start_time)} {task.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-600">Type:</span>{' '}
                <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                  selectedTask.is_appointment
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {selectedTask.is_appointment ? 'Appointment' : 'Routine'}
                </span>
              </div>
              
              <div>
                <span className="font-medium text-gray-600">Date:</span>{' '}
                {new Date(selectedTask.local_date).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                {editMode ? (
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-gray-900">{formatTime(selectedTask.start_time)}</div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time
                </label>
                {editMode ? (
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-gray-900">{formatTime(selectedTask.end_time)}</div>
                )}
              </div>
              
              {selectedTask.template_id && (
                <div className="text-xs text-gray-500 mt-4 pt-4 border-t">
                  Template ID: {selectedTask.template_id}
                </div>
              )}
            </div>
            
            <div className="mt-6 flex gap-2">
              {editMode ? (
                <>
                  <button
                    onClick={handleEditSave}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleDeleteClick}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
                  >
                    Edit Time
                  </button>
                  <button
                    onClick={handleMoveClick}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move Dialog */}
      {showMoveDialog && selectedTask && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowMoveDialog(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Move Appointment</h3>
              <button
                onClick={() => setShowMoveDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Date
                </label>
                <input
                  type="date"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Time
                </label>
                <input
                  type="time"
                  value={moveTime}
                  onChange={(e) => setMoveTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {selectedTask.template_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Move Options
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="moveType"
                        value="single"
                        checked={moveType === 'single'}
                        onChange={(e) => setMoveType(e.target.value as 'single' | 'series')}
                        className="mr-2"
                      />
                      <span className="text-sm">Move only this instance</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="moveType"
                        value="series"
                        checked={moveType === 'series'}
                        onChange={(e) => setMoveType(e.target.value as 'single' | 'series')}
                        className="mr-2"
                      />
                      <span className="text-sm">Move entire recurring series</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleMoveConfirm}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
                >
                  Confirm Move
                </button>
                <button
                  onClick={() => setShowMoveDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && selectedTask && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowDeleteDialog(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Delete Appointment</h3>
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete "{selectedTask.title}"?
              </p>

              {selectedTask.template_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delete Options
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="deleteType"
                        value="single"
                        checked={deleteType === 'single'}
                        onChange={(e) => {
                          setDeleteType(e.target.value as 'single' | 'series');
                          setDeleteConfirmText('');
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">Delete only this instance</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="deleteType"
                        value="series"
                        checked={deleteType === 'series'}
                        onChange={(e) => {
                          setDeleteType(e.target.value as 'single' | 'series');
                          setDeleteConfirmText('');
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-red-600 font-semibold">⚠️ Delete entire recurring series (ALL future occurrences)</span>
                    </label>
                  </div>
                </div>
              )}

              {deleteType === 'series' && selectedTask.template_id && (
                <div className="bg-red-50 border border-red-300 rounded p-3">
                  <p className="text-sm text-red-800 font-semibold mb-2">
                    ⚠️ WARNING: This will permanently delete ALL future occurrences of this appointment!
                  </p>
                  <p className="text-xs text-red-700 mb-2">
                    Type the appointment name exactly to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={`Type "${selectedTask.title}" here`}
                    className="w-full px-3 py-2 border border-red-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleteType === 'series' && selectedTask.template_id && deleteConfirmText !== selectedTask.title}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                    deleteType === 'series' && selectedTask.template_id && deleteConfirmText !== selectedTask.title
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
