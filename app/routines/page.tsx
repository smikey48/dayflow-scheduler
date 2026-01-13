'use client';

import { RoutineAdd } from '../components/RoutineAdd';
import { supabaseBrowser } from '../../lib/supabaseBrowser';
import { useEffect, useState } from 'react';
import FeedbackButton from '../components/FeedbackButton';

type Routine = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  repeat_unit: string | null;
  repeat_interval: number | null;
  repeat_days: number[] | null;
  day_of_month: number | null;
  priority: number | null;
  date: string | null;
  local_date: string | null;
  is_appointment: boolean;
  is_routine: boolean;
  is_completed: boolean | null;
};

export default function RoutinesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [editModalRepeatUnit, setEditModalRepeatUnit] = useState<string>('daily');
  const [editModalStartTime, setEditModalStartTime] = useState<string>('');
  const [editModalDuration, setEditModalDuration] = useState<number>(30);
  const [editModalDate, setEditModalDate] = useState<string>('');
  const [editModalTaskType, setEditModalTaskType] = useState<'routine' | 'appointment' | 'floating'>('routine');
  const [editModalPriority, setEditModalPriority] = useState<number>(3);
  const [taskTypeFilter, setTaskTypeFilter] = useState<'routines' | 'appointments' | 'floating'>('routines');
  const [showNavMenu, setShowNavMenu] = useState<boolean>(false);

  const loadRoutines = async () => {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    let query = supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false);

    // Filter based on task type
    if (taskTypeFilter === 'routines') {
      query = query.eq('is_routine', true);
      query = query.order('start_time', { ascending: true });
    } else if (taskTypeFilter === 'appointments') {
      query = query.eq('is_appointment', true);
      // For appointments, order by date first, then start_time
      query = query.order('date', { ascending: true, nullsFirst: false });
      query = query.order('start_time', { ascending: true });
    } else if (taskTypeFilter === 'floating') {
      query = query.eq('is_routine', false).eq('is_appointment', false);
      query = query.order('priority', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading tasks:', error);
    } else {
      // Filter out past one-time appointments
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const filteredData = (data || []).filter(task => {
        // If it's a one-time task (repeat_unit is 'none' or null)
        if (!task.repeat_unit || task.repeat_unit === 'none') {
          // Check if it has a date
          const taskDate = task.date || task.local_date;
          if (taskDate) {
            const date = new Date(taskDate);
            date.setHours(0, 0, 0, 0);
            // Only include if date is today or in the future
            return date >= today;
          }
        }
        // Include all recurring tasks
        return true;
      });
      
      setRoutines(filteredData);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadRoutines();
  }, [taskTypeFilter]);

  // Sync modal state when editingRoutine changes
  useEffect(() => {
    if (editingRoutine) {
      setEditModalRepeatUnit(editingRoutine.repeat_unit || 'daily');
      
      // Extract time from start_time
      if (editingRoutine.start_time) {
        const timeMatch = editingRoutine.start_time.match(/(\d{2}:\d{2})/);
        if (timeMatch) {
          setEditModalStartTime(timeMatch[1]);
        }
      } else {
        setEditModalStartTime('');
      }
      
      setEditModalDuration(editingRoutine.duration_minutes || 30);
      setEditModalPriority(editingRoutine.priority || 3);
    }
  }, [editingRoutine]);

  const handleRoutineAdded = () => {
    loadRoutines();
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.slice(0, 5); // HH:MM
  };

  const formatDate = (date: string | null) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getNextOccurrence = (routine: Routine) => {
    if (routine.repeat_unit === 'weekly' && routine.repeat_days && routine.repeat_days.length > 0) {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Use the stored date as the "start from" date if available
      const startFromDate = routine.date || routine.local_date;
      const referenceDate = startFromDate ? new Date(startFromDate) : today;
      referenceDate.setHours(0, 0, 0, 0);
      
      // If reference date is in the future, find next occurrence from that date
      const searchDate = referenceDate > today ? referenceDate : today;
      const currentDay = searchDate.getDay(); // 0=Sunday, 1=Monday, etc.
      const currentDayDB = currentDay === 0 ? 6 : currentDay - 1; // Convert to DB format: 0=Monday, 6=Sunday
      
      // Find all possible next dates and pick the earliest
      let earliestDate: Date | null = null;
      
      for (const day of routine.repeat_days) {
        let daysUntil = day - currentDayDB;
        
        // Calculate candidate date
        const candidateDate = new Date(searchDate);
        
        if (daysUntil < 0) {
          // Day is earlier in the week, so next occurrence is next week
          candidateDate.setDate(searchDate.getDate() + daysUntil + 7);
        } else if (daysUntil === 0) {
          // Same day as search date
          if (searchDate.getTime() === today.getTime()) {
            // It's today - check if time has passed
            if (routine.start_time) {
              const [hours, minutes] = routine.start_time.split(':').map(Number);
              const appointmentTime = new Date();
              appointmentTime.setHours(hours, minutes, 0, 0);
              
              if (now >= appointmentTime) {
                // Time has passed, next occurrence is next week
                candidateDate.setDate(searchDate.getDate() + 7);
              }
            }
          }
          // else: it's the reference date in the future, use it as-is
        } else {
          // Day is later this week
          candidateDate.setDate(searchDate.getDate() + daysUntil);
        }
        
        // Keep track of the earliest date
        if (!earliestDate || candidateDate < earliestDate) {
          earliestDate = candidateDate;
        }
      }
      
      if (earliestDate) {
        return formatDate(earliestDate.toISOString().split('T')[0]);
      }
    }
    return null;
  };

  const formatRepeat = (routine: Routine) => {
    const unit = routine.repeat_unit || 'none';
    const interval = routine.repeat_interval || 1;
    
    if (unit === 'none') return 'One-time';
    
    let result = interval > 1 ? `Every ${interval} ` : '';
    
    if (unit === 'daily') {
      result += interval > 1 ? 'days' : 'Daily';
    } else if (unit === 'weekday') {
      result = 'Weekdays';
    } else if (unit === 'weekly') {
      result += interval > 1 ? 'weeks' : 'Weekly';
      if (routine.repeat_days && routine.repeat_days.length > 0) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayNames = routine.repeat_days.map(d => days[d]).join(', ');
        result += ` (${dayNames})`;
      }
    } else if (unit === 'monthly') {
      result += interval > 1 ? 'months' : 'Monthly';
      if (routine.day_of_month) {
        result += ` (day ${routine.day_of_month})`;
      }
    }
    
    return result;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <FeedbackButton page="Routines" />
      
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a 
              href="/"
              className="text-gray-600 hover:text-gray-900 transition-colors"
              title="Back to home"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Edit Tasks</h1>
              <div className="relative nav-menu-container">
                <button
                  onClick={() => setShowNavMenu(!showNavMenu)}
                  className="text-gray-600 hover:text-gray-900 transition-colors p-1"
                  title="Navigate to other pages"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
                {showNavMenu && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <a
                      href="/today"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Today
                    </a>
                    <a
                      href="/appointments"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Appointments
                    </a>
                    <a
                      href="/tasks"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Create Tasks
                    </a>
                    <a
                      href="/projects"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Projects
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            Edit floating tasks, routines or appointments
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Task Type Filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Task Type
          </label>
          <select
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value as 'routines' | 'appointments' | 'floating')}
            className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="routines">Routines</option>
            <option value="appointments">Appointments</option>
            <option value="floating">Floating Tasks</option>
          </select>
        </div>
        {/* Existing Tasks List */}
        {!loading && routines.length > 0 && taskTypeFilter !== 'floating' && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">
              {taskTypeFilter === 'routines' && 'Current Routines'}
              {taskTypeFilter === 'appointments' && 'Current Appointments'}
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border divide-y">
              {routines.map((routine) => (
                <div 
                  key={routine.id} 
                  onClick={() => {
                    setEditingRoutine(routine);
                    setEditModalRepeatUnit(routine.repeat_unit || 'daily');
                    setEditModalStartTime(routine.start_time || '');
                    setEditModalDuration(routine.duration_minutes || 30);
                    
                    // Set task type based on flags
                    if (routine.is_appointment) {
                      setEditModalTaskType('appointment');
                    } else if (routine.is_routine) {
                      setEditModalTaskType('routine');
                    } else {
                      setEditModalTaskType('floating');
                    }
                    
                    // For recurring appointments, show the calculated next occurrence
                    // For one-time appointments, use the stored date
                    if (routine.repeat_unit === 'weekly' && routine.repeat_days && routine.repeat_days.length > 0) {
                      const nextOcc = getNextOccurrence(routine);
                      if (nextOcc) {
                        // Extract just the date part (YYYY-MM-DD) from the formatted string
                        // getNextOccurrence returns a formatted string, we need to convert it back to YYYY-MM-DD
                        const dateStr = routine.date || routine.local_date;
                        if (dateStr) {
                          const now = new Date();
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          
                          const startFromDate = new Date(dateStr);
                          startFromDate.setHours(0, 0, 0, 0);
                          
                          const searchDate = startFromDate > today ? startFromDate : today;
                          const currentDay = searchDate.getDay();
                          const currentDayDB = currentDay === 0 ? 6 : currentDay - 1;
                          
                          let earliestDate: Date | null = null;
                          
                          for (const day of routine.repeat_days) {
                            let daysUntil = day - currentDayDB;
                            const candidateDate = new Date(searchDate);
                            
                            if (daysUntil < 0) {
                              candidateDate.setDate(searchDate.getDate() + daysUntil + 7);
                            } else if (daysUntil === 0) {
                              if (searchDate.getTime() === today.getTime()) {
                                if (routine.start_time) {
                                  const [hours, minutes] = routine.start_time.split(':').map(Number);
                                  const appointmentTime = new Date();
                                  appointmentTime.setHours(hours, minutes, 0, 0);
                                  
                                  if (now >= appointmentTime) {
                                    candidateDate.setDate(searchDate.getDate() + 7);
                                  }
                                }
                              }
                            } else {
                              candidateDate.setDate(searchDate.getDate() + daysUntil);
                            }
                            
                            if (!earliestDate || candidateDate < earliestDate) {
                              earliestDate = candidateDate;
                            }
                          }
                          
                          if (earliestDate) {
                            setEditModalDate(earliestDate.toISOString().split('T')[0]);
                          } else {
                            setEditModalDate(dateStr);
                          }
                        } else {
                          setEditModalDate('');
                        }
                      } else {
                        setEditModalDate(routine.date || routine.local_date || '');
                      }
                    } else {
                      setEditModalDate(routine.date || routine.local_date || '');
                    }
                  }}
                  className="p-4 hover:bg-green-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{routine.title}</h3>
                      {routine.description && (
                        <p className="text-sm text-gray-600 mt-1">{routine.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {routine.start_time && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTime(routine.start_time)}
                          </span>
                        )}
                        {routine.duration_minutes && (
                          <span>{routine.duration_minutes} min</span>
                        )}
                        <span className="text-green-600 font-medium">
                          {formatRepeat(routine)}
                        </span>
                        {(routine.repeat_unit === 'none' || !routine.repeat_unit) && (routine.date || routine.local_date) && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDate(routine.date || routine.local_date)}
                          </span>
                        )}
                        {routine.repeat_unit === 'weekly' && getNextOccurrence(routine) && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Next due: {getNextOccurrence(routine)}
                          </span>
                        )}
                        {routine.priority && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            P{routine.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Floating Tasks - Split into Recurring and One-off */}
        {!loading && taskTypeFilter === 'floating' && (
          <>
            {/* Recurring Floating Tasks */}
            {routines.filter(r => r.repeat_unit && r.repeat_unit !== 'none').length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3">Recurring Floating Tasks</h2>
                <div className="bg-white rounded-2xl shadow-sm border divide-y">
                  {routines.filter(r => r.repeat_unit && r.repeat_unit !== 'none').map((routine) => (
                    <div 
                      key={routine.id} 
                      onClick={() => {
                        setEditingRoutine(routine);
                        setEditModalRepeatUnit(routine.repeat_unit || 'daily');
                        setEditModalStartTime(routine.start_time || '');
                        setEditModalDuration(routine.duration_minutes || 30);
                        setEditModalTaskType('floating');
                        setEditModalDate(routine.date || routine.local_date || '');
                      }}
                      className="p-4 hover:bg-green-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{routine.title}</h3>
                          {routine.description && (
                            <p className="text-sm text-gray-600 mt-1">{routine.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            {routine.start_time && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatTime(routine.start_time)}
                              </span>
                            )}
                            {routine.duration_minutes && (
                              <span>{routine.duration_minutes} min</span>
                            )}
                            <span className="text-green-600 font-medium">
                              {formatRepeat(routine)}
                            </span>
                            {routine.priority && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                P{routine.priority}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* One-off Floating Tasks */}
            {routines.filter(r => (!r.repeat_unit || r.repeat_unit === 'none') && !r.is_completed).length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3">One-off Floating Tasks</h2>
                <div className="bg-white rounded-2xl shadow-sm border divide-y">
                  {routines.filter(r => (!r.repeat_unit || r.repeat_unit === 'none') && !r.is_completed).map((routine) => (
                    <div 
                      key={routine.id} 
                      onClick={() => {
                        setEditingRoutine(routine);
                        setEditModalRepeatUnit(routine.repeat_unit || 'daily');
                        setEditModalStartTime(routine.start_time || '');
                        setEditModalDuration(routine.duration_minutes || 30);
                        setEditModalTaskType('floating');
                        setEditModalDate(routine.date || routine.local_date || '');
                      }}
                      className="p-4 hover:bg-green-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{routine.title}</h3>
                          {routine.description && (
                            <p className="text-sm text-gray-600 mt-1">{routine.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            {routine.start_time && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatTime(routine.start_time)}
                              </span>
                            )}
                            {routine.duration_minutes && (
                              <span>{routine.duration_minutes} min</span>
                            )}
                            <span className="text-green-600 font-medium">
                              {formatRepeat(routine)}
                            </span>
                            {routine.priority && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                P{routine.priority}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Routine Modal */}
      {editingRoutine && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              {editingRoutine.is_appointment ? 'Edit Appointment' : editingRoutine.is_routine ? 'Edit Routine' : 'Edit Task'}
            </h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const title = (formData.get('title') as string) || '';
              const description = (formData.get('description') as string) || '';
              const repeat_unit = formData.get('repeat_unit') as string;
              const repeat_interval = parseInt(formData.get('repeat_interval') as string) || 1;
              const day_of_month = parseInt(formData.get('day_of_month') as string) || null;
              
              // Get selected days for weekly
              const repeat_days: number[] = [];
              if (repeat_unit === 'weekly') {
                for (let i = 0; i <= 6; i++) {
                  if (formData.get(`day_${i}`) === 'on') {
                    repeat_days.push(i);
                  }
                }
              }

              const { data: { session } } = await supabaseBrowser().auth.getSession();
              const token = session?.access_token ?? null;
              if (!token) return;

              const start_time = (formData.get('start_time') as string) || null;
              const duration_minutes = parseInt(formData.get('duration_minutes') as string) || null;
              const priority = parseInt(formData.get('priority') as string) || 3;
              
              const date_value = (formData.get('date') as string) || null;
              
              // Use the task type from the modal state
              const kind = editModalTaskType;
              
              const body: any = { 
                title,
                description: description || null,
                kind,
                repeat_unit, 
                repeat_interval,
                priority
              };
              if (repeat_unit === 'weekly') body.repeat_days = repeat_days;
              if (repeat_unit === 'monthly') body.day_of_month = day_of_month;
              
              if (start_time) body.start_time = start_time;
              if (duration_minutes) body.duration_minutes = duration_minutes;
              if (date_value) {
                body.date = date_value;
              }

              const res = await fetch(`/api/task-templates/${editingRoutine.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
              });

              if (res.ok) {
                setEditingRoutine(null);
                setEditModalRepeatUnit('daily');
                setEditModalStartTime('');
                setEditModalDuration(30);
                setEditModalDate('');
                setEditModalTaskType('routine');
                loadRoutines();
              } else {
                alert('Failed to update routine');
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input 
                    type="text" 
                    name="title"
                    defaultValue={editingRoutine.title}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description (optional)</label>
                  <input 
                    type="text" 
                    name="description"
                    defaultValue={editingRoutine.description || ''}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    name="priority"
                    value={editModalPriority}
                    onChange={(e) => setEditModalPriority(parseInt(e.target.value))}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value={1}>1 – Highest</option>
                    <option value={2}>2</option>
                    <option value={3}>3 (default)</option>
                    <option value={4}>4</option>
                    <option value={5}>5 – Lowest</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Task Type</label>
                  <select
                    value={editModalTaskType}
                    onChange={(e) => setEditModalTaskType(e.target.value as 'routine' | 'appointment' | 'floating')}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="routine">Routine</option>
                    <option value="appointment">Appointment</option>
                    <option value="floating">Floating Task</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Start Time {editModalTaskType === 'floating' && '(optional)'}
                  </label>
                  <input 
                    type="time" 
                    name="start_time"
                    value={editModalStartTime}
                    onChange={(e) => setEditModalStartTime(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    required={editModalTaskType !== 'floating'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Duration (minutes) {editModalTaskType === 'floating' && '(optional)'}
                  </label>
                  <input 
                    type="number" 
                    name="duration_minutes"
                    value={editModalDuration}
                    onChange={(e) => setEditModalDuration(parseInt(e.target.value) || 30)}
                    min="5"
                    max="480"
                    className="w-full border rounded px-3 py-2"
                    required={editModalTaskType !== 'floating'}
                  />
                </div>

                {editModalTaskType === 'appointment' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {editModalRepeatUnit === 'none' ? 'Date' : 'Next Occurrence Date'}
                    </label>
                    <input 
                      type="date" 
                      name="date"
                      value={editModalDate}
                      onChange={(e) => setEditModalDate(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Repeat</label>
                  <select 
                    name="repeat_unit" 
                    value={editModalRepeatUnit}
                    className="w-full border rounded px-3 py-2"
                    onChange={(e) => setEditModalRepeatUnit(e.target.value)}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekday">Weekdays</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Interval</label>
                  <input 
                    type="number" 
                    name="repeat_interval" 
                    min="1"
                    defaultValue={editingRoutine.repeat_interval || 1}
                    className="w-full border rounded px-3 py-2"
                  />
                  {(editingRoutine.repeat_interval || 1) > 1 && (
                    <p className="text-xs text-gray-500 mt-1">Every N {editModalRepeatUnit === 'daily' ? 'days' : editModalRepeatUnit === 'weekly' ? 'weeks' : 'months'}</p>
                  )}
                </div>

                {/* Show day checkboxes if weekly is selected */}
                {editModalRepeatUnit === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Repeat on days</label>
                    <div className="flex flex-wrap gap-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                        const py = (i + 6) % 7;
                        return (
                          <label key={i} className="flex items-center space-x-1">
                            <input 
                              type="checkbox" 
                              name={`day_${py}`}
                              defaultChecked={editingRoutine.repeat_days?.includes(py)}
                            />
                            <span className="text-sm">{day}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Show day of month if monthly is selected */}
                {editModalRepeatUnit === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Day of month</label>
                    <input 
                      type="number" 
                      name="day_of_month" 
                      min="1"
                      max="31"
                      defaultValue={editingRoutine.day_of_month || 1}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoutine(null);
                    setEditModalRepeatUnit('daily');
                    setEditModalStartTime('');
                    setEditModalDuration(30);
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
