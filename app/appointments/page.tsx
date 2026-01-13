'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import Calendar from '../components/Calendar';
import { QuickAdd } from '../components/QuickAdd';
import FeedbackButton from '../components/FeedbackButton';

export default function AppointmentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showNavMenu, setShowNavMenu] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const handleAdded = () => {
    setShowAddForm(false);
    setRefreshKey(prev => prev + 1); // Trigger calendar refresh
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <FeedbackButton page="Appointments" />
      
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
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
              <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
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
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {showAddForm ? 'Cancel' : '+ Add Appointment'}
          </button>
        </div>
      </header>

      {/* Add Appointment Form */}
      {showAddForm && userId && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <QuickAdd userId={userId} onAdded={handleAdded} />
        </div>
      )}

      {/* Calendar View */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Calendar key={refreshKey} />
      </div>
    </main>
  );
}
