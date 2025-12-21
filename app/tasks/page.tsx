'use client';

import { QuickAdd } from '../components/QuickAdd';
import { supabaseBrowser } from '../../lib/supabaseBrowser';
import { useEffect, useState } from 'react';

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUserId = async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      setLoading(false);
    };
    getUserId();
  }, []);

  const handleTaskAdded = () => {
    // Optionally show a success message or refresh a task list
    console.log('Task added successfully');
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
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
            <h1 className="text-2xl font-bold text-gray-900">Create Tasks</h1>
          </div>
          <div className="text-sm text-gray-600">
            Create floating tasks, routines, or appointments
          </div>
        </div>
      </header>

      {/* Task Entry Form */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Help Section */}
        <div className="mb-6 bg-blue-50 rounded-2xl p-6 border border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-3">Task Types Explained</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <strong className="text-blue-700">Floating Task:</strong> Work that needs to get done but timing is flexible - the AI schedules it for you
            </div>
            <div>
              <strong className="text-green-700">Routine:</strong> Fixed recurring task at a specific time (e.g. morning coffee break at 11 am)
            </div>
            <div>
              <strong className="text-purple-700">Appointment:</strong> Fixed one time or recurring meetings with other people
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : userId ? (
          <QuickAdd userId={userId} onAdded={handleTaskAdded} />
        ) : (
          <div className="text-center py-8 text-red-600">
            Please sign in to add tasks
          </div>
        )}
      </div>
    </main>
  );
}
