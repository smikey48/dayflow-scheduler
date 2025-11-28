'use client';

import { RoutineAdd } from '../components/RoutineAdd';
import { supabaseBrowser } from '../../lib/supabaseBrowser';
import { useEffect, useState } from 'react';

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
};

export default function RoutinesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [editModalRepeatUnit, setEditModalRepeatUnit] = useState<string>('daily');
  const [editModalStartTime, setEditModalStartTime] = useState<string>('');
  const [editModalDuration, setEditModalDuration] = useState<number>(30);

  const loadRoutines = async () => {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_routine', true)
      .eq('is_deleted', false)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error loading routines:', error);
    } else {
      setRoutines(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadRoutines();
  }, []);

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
    }
  }, [editingRoutine]);

  const handleRoutineAdded = () => {
    loadRoutines();
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.slice(0, 5); // HH:MM
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
            <h1 className="text-2xl font-bold text-gray-900">Routines</h1>
          </div>
          <div className="text-sm text-gray-600">
            Manage your recurring tasks and daily habits
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Existing Routines List */}
        {!loading && routines.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Current Routines</h2>
            <div className="bg-white rounded-2xl shadow-sm border divide-y">
              {routines.map((routine) => (
                <div 
                  key={routine.id} 
                  onClick={() => setEditingRoutine(routine)}
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

        {/* Routine Entry Form */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : userId ? (
            <RoutineAdd userId={userId} onAdded={handleRoutineAdded} />
          ) : (
            <div className="text-center py-8 text-red-600">
              Please sign in to add routines
            </div>
          )}
        </div>
      </div>

      {/* Edit Routine Modal */}
      {editingRoutine && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Edit Routine</h2>
            
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
              
              const body: any = { 
                title,
                description: description || null,
                kind: 'routine',
                repeat_unit, 
                repeat_interval
              };
              if (repeat_unit === 'weekly') body.repeat_days = repeat_days;
              if (repeat_unit === 'monthly') body.day_of_month = day_of_month;
              
              if (start_time) body.start_time = start_time;
              if (duration_minutes) body.duration_minutes = duration_minutes;

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
                loadRoutines();
              } else {
                alert('Failed to update routine');
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Routine Title</label>
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
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <input 
                    type="time" 
                    name="start_time"
                    value={editModalStartTime}
                    onChange={(e) => setEditModalStartTime(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <input 
                    type="number" 
                    name="duration_minutes"
                    value={editModalDuration}
                    onChange={(e) => setEditModalDuration(parseInt(e.target.value) || 30)}
                    min="5"
                    max="480"
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>

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
                  <p className="text-xs text-gray-500 mt-1">Every N {editModalRepeatUnit === 'daily' ? 'days' : editModalRepeatUnit === 'weekly' ? 'weeks' : 'months'}</p>
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
