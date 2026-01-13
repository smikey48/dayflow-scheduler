'use client';

import { QuickAdd } from '../components/QuickAdd';
import { supabaseBrowser } from '../../lib/supabaseBrowser';
import { useEffect, useState } from 'react';
import FeedbackButton from '../components/FeedbackButton';

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNavMenu, setShowNavMenu] = useState<boolean>(false);

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
      <FeedbackButton page="Create Tasks" />
      
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Create Tasks</h1>
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
                      href="/routines"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Edit Tasks
                    </a>
                    <a
                      href="/appointments"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Appointments
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
