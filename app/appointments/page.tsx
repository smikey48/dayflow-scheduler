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
            <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
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
